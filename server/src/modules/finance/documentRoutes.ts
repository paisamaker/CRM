import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { env } from '../../config/env.js';
import { authenticate, authorize, authorizeAny } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError, ForbiddenError, NotFoundError } from '../../utils/AppError.js';
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
  authorizeAny('transactions', 'create', 'submit'),
  // Accept both "file" (canonical) and legacy "document" field names
  scanUpload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'document', maxCount: 1 },
  ]),
  asyncHandler(async (req, res) => {
    const files = req.files as { [field: string]: Express.Multer.File[] } | undefined;
    const uploaded = files?.file?.[0] || files?.document?.[0] || req.file;
    if (!uploaded) {
      throw new AppError('Please select a PDF or image file to scan.', 400);
    }

    assertSafeUploadSignature(uploaded.path, uploaded.mimetype);

    const result = await processFinancialDocument(uploaded, {
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

    const extracted = result.extractedData;
    const confMap: Record<string, number> = { high: 0.92, medium: 0.7, low: 0.45 };
    const confFields: Record<string, number> = {};
    for (const [k, v] of Object.entries(extracted.confidence || {})) {
      confFields[k] = confMap[String(v)] ?? 0.7;
    }
    const overall =
      Object.values(confFields).length > 0
        ? Object.values(confFields).reduce((a, b) => a + b, 0) / Object.values(confFields).length
        : 0.75;

    // Flatten nested AI schema into the shape the finance UI expects
    const flatExtracted = {
      documentType: extracted.documentType,
      suggestedTransactionType: extracted.transactionDetails?.suggestedType,
      suggestedCategory: extracted.transactionDetails?.suggestedCategory,
      invoiceNumber: extracted.invoiceNumber ?? undefined,
      receiptNumber: extracted.receiptNumber ?? undefined,
      billNumber: extracted.billNumber ?? undefined,
      documentDate: extracted.documentDate ?? undefined,
      dueDate: extracted.dueDate ?? undefined,
      currency: extracted.currency,
      vendor: {
        name: extracted.partyDetails?.vendorName ?? undefined,
        address: extracted.partyDetails?.vendorAddress ?? undefined,
        gstin: extracted.partyDetails?.vendorGstin ?? undefined,
      },
      customer: {
        name: extracted.partyDetails?.customerName ?? undefined,
        gstin: extracted.partyDetails?.customerGstin ?? undefined,
      },
      subtotal: extracted.financialDetails?.subtotal ?? undefined,
      discount: extracted.financialDetails?.discount ?? undefined,
      taxableAmount: extracted.financialDetails?.taxableAmount ?? undefined,
      cgst: extracted.financialDetails?.cgst ?? undefined,
      sgst: extracted.financialDetails?.sgst ?? undefined,
      igst: extracted.financialDetails?.igst ?? undefined,
      otherTaxes: extracted.financialDetails?.otherTaxes ?? undefined,
      totalTax: extracted.financialDetails?.totalTax ?? undefined,
      grandTotal:
        extracted.financialDetails?.grandTotal ||
        extracted.financialDetails?.amountPaid ||
        undefined,
      amountPaid: extracted.financialDetails?.amountPaid ?? undefined,
      outstandingAmount: extracted.financialDetails?.outstandingAmount ?? undefined,
      paymentMethod: extracted.transactionDetails?.paymentMethod ?? undefined,
      paymentStatus: extracted.transactionDetails?.paymentStatus,
      description: extracted.transactionDetails?.description ?? undefined,
      notes: extracted.transactionDetails?.notes ?? undefined,
      items: extracted.lineItems || [],
    };

    res.json({
      success: true,
      message: 'Document scanned and parsed successfully',
      data: {
        scannedDocumentId: result.scanId,
        scanId: result.scanId,
        documentHash: result.documentHash,
        extractedData: flatExtracted,
        confidence: { overall, fields: confFields },
        status: 'scanned',
        extractionEngine: result.provider,
        provider: result.provider,
        isDuplicate: result.isDuplicate,
        duplicateWarning: result.isDuplicate
          ? {
              isDuplicate: true,
              reason: result.duplicateWarning || 'Similar document already exists',
              matchedType: result.duplicateMatch?.type,
              matchedId: result.duplicateMatch?.id,
              details: result.duplicateMatch,
            }
          : null,
        fileUrl: result.fileUrl,
        fileName: result.fileName,
        fileMime: result.mimeType,
        mimeType: result.mimeType,
        fileSize: result.fileSize,
      },
    });
  })
);

// ── GET /check-duplicate ────────────────────────────────
// Real-time check if an invoice number or file hash already exists
router.get(
  '/check-duplicate',
  authorize('transactions', 'read'),
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

function canAccessScan(doc: { scannedBy?: unknown }, role: string, userId: string): boolean {
  if (role === 'ceo' || role === 'finance' || role === 'manager') return true;
  const raw = doc.scannedBy;
  if (!raw) return false;
  if (typeof raw === 'string') return raw === userId;
  if (typeof raw === 'object' && raw !== null && '_id' in raw) {
    return String((raw as { _id: unknown })._id) === userId;
  }
  return String(raw) === userId;
}

// ── GET /:id ───────────────────────────────────────────
// Retrieve a specific scanned document by ID
router.get(
  '/:id',
  authorize('transactions', 'read'),
  asyncHandler(async (req, res) => {
    const doc = await ScannedDocument.findById(req.params.id)
      .populate('scannedBy', 'name email role')
      .populate('linkedTransaction', 'title amount date type')
      .populate('linkedBill', 'title billNumber totalAmount billDate');

    if (!doc) {
      throw new NotFoundError('Scanned document not found');
    }

    if (!canAccessScan(doc, req.user!.role, req.user!.id)) {
      throw new ForbiddenError('Access denied');
    }

    res.json({ success: true, data: doc });
  })
);

// ── PATCH /:id/confirm ─────────────────────────────────
// Link a scanned document to a created Transaction or Bill
router.patch(
  '/:id/confirm',
  authorizeAny('transactions', 'create', 'submit'),
  asyncHandler(async (req, res) => {
    const { transactionId, billId } = req.body;
    const doc = await ScannedDocument.findById(req.params.id);
    if (!doc) throw new NotFoundError('Scanned document not found');

    if (!canAccessScan(doc, req.user!.role, req.user!.id)) {
      throw new ForbiddenError('Access denied');
    }

    doc.status = 'confirmed';
    if (transactionId) doc.linkedTransaction = transactionId;
    if (billId) doc.linkedBill = billId;
    await doc.save();

    res.json({ success: true, data: doc });
  })
);

export default router;
