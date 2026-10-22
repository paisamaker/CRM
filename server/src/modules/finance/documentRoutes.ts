import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { env } from '../../config/env.js';
import { authenticate } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError, NotFoundError } from '../../utils/AppError.js';
import { writeAudit } from '../../utils/audit.js';
import { ScannedDocument } from '../../models/ScannedDocument.js';
import {
  processFinancialDocument,
  checkDuplicateDocument,
} from './documentScanner.js';
import { assertSafeUploadSignature } from '../../utils/fileSignature.js';

const router = Router();
router.use(authenticate);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadRoot = path.resolve(__dirname, '../../../uploads/documents');

if (!fs.existsSync(uploadRoot)) {
  fs.mkdirSync(uploadRoot, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    cb(null, `${Date.now()}-${safe}`);
  },
});

const scanUpload = multer({
  storage,
  limits: { fileSize: env.DOCUMENT_SCAN_MAX_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set([
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
    ]);
    if (!allowed.has(file.mimetype.toLowerCase())) {
      return cb(
        new AppError(
          'Invalid file type. Only PDF, JPG, PNG, and WEBP files are supported.',
          400,
          'INVALID_FILE_TYPE'
        ) as unknown as Error
      );
    }
    cb(null, true);
  },
});

// ── POST /scan ──────────────────────────────────────────
// Uploads and extracts financial details from a bill or receipt
router.post(
  '/scan',
  scanUpload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError('Please select a PDF or image file to scan.', 400);
    }

    assertSafeUploadSignature(req.file.path, req.file.mimetype);

    const result = await processFinancialDocument(req.file, {
      id: req.user!.id,
      role: req.user!.role,
    });

    await writeAudit({
      actor: req.user!.id,
      action: 'scan',
      entity: 'ScannedDocument',
      entityId: result.scanId,
      after: {
        fileName: result.fileName,
        grandTotal: result.extractedData.financialDetails.grandTotal,
        documentType: result.extractedData.documentType,
        isDuplicate: result.isDuplicate,
        provider: result.provider,
      },
      req,
    });

    res.json({
      success: true,
      message: 'Document scanned and parsed successfully',
      data: result,
    });
  })
);

// ── GET /check-duplicate ────────────────────────────────
// Real-time check if an invoice number or file hash already exists
router.get(
  '/check-duplicate',
  asyncHandler(async (req, res) => {
    const hash = String(req.query.hash || '').trim();
    const invoiceNumber = String(req.query.invoiceNumber || '').trim();
    const amount = Number(req.query.amount) || undefined;
    const vendor = String(req.query.vendor || '').trim();

    if (!hash && !invoiceNumber) {
      return res.json({ success: true, data: { isDuplicate: false } });
    }

    const result = await checkDuplicateDocument(hash, invoiceNumber, amount, vendor);
    res.json({ success: true, data: result });
  })
);

// ── GET /:id ───────────────────────────────────────────
// Retrieve a specific scanned document by ID
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const doc = await ScannedDocument.findById(req.params.id)
      .populate('scannedBy', 'name email role')
      .populate('linkedTransaction', 'title amount date type')
      .populate('linkedBill', 'title billNumber totalAmount billDate');

    if (!doc) {
      throw new NotFoundError('Scanned document not found');
    }

    // Authorization: CEO and finance can view all, employees can view own
    if (
      req.user!.role === 'employee' &&
      doc.scannedBy &&
      (doc.scannedBy as any)._id?.toString() !== req.user!.id &&
      (doc.scannedBy as any).toString() !== req.user!.id
    ) {
      throw new AppError('Access denied', 403);
    }

    res.json({ success: true, data: doc });
  })
);

// ── PATCH /:id/confirm ─────────────────────────────────
// Link a scanned document to a created Transaction or Bill
router.patch(
  '/:id/confirm',
  asyncHandler(async (req, res) => {
    const { transactionId, billId } = req.body;
    const doc = await ScannedDocument.findById(req.params.id);
    if (!doc) throw new NotFoundError('Scanned document not found');

    doc.status = 'confirmed';
    if (transactionId) doc.linkedTransaction = transactionId;
    if (billId) doc.linkedBill = billId;
    await doc.save();

    res.json({ success: true, data: doc });
  })
);

export default router;
