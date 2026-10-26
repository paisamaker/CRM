import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth.js';
import { upload, publicUploadPath, finalizeUploadedFile } from '../../middleware/upload.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { DocumentFile } from '../../models/Document.js';
import { ChatMessage } from '../../models/ChatMessage.js';
import { Conversation } from '../../models/Conversation.js';
import { paginate } from '../../utils/pagination.js';
import { ForbiddenError, NotFoundError } from '../../utils/AppError.js';
import { writeAudit } from '../../utils/audit.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadRoot = path.resolve(__dirname, '../../../uploads');
const chatUploadRoot = path.join(uploadRoot, 'chat');

router.use(authenticate);

router.get(
  '/',
  authorize('files', 'read'),
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (req.query.folder && req.query.folder !== 'all') {
      filter.folder = req.query.folder;
    }
    if (req.query.project) {
      filter.$or = [{ project: req.query.project }, { linkedId: req.query.project }];
    }
    if (req.query.linkedModel) {
      filter.linkedModel = req.query.linkedModel;
    }
    if (req.query.linkedId) {
      filter.linkedId = req.query.linkedId;
    }
    if (req.query.search) {
      filter.name = new RegExp(String(req.query.search).trim(), 'i');
    }
    if (req.query.type === 'images') {
      filter.mime = new RegExp('^image/', 'i');
    } else if (req.query.type === 'pdfs') {
      filter.mime = 'application/pdf';
    }

    if (req.user!.role === 'employee') {
      const visibilityFilter = [{ visibility: 'company' }, { uploadedBy: req.user!.id }];
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: visibilityFilter }];
        delete filter.$or;
      } else {
        filter.$or = visibilityFilter;
      }
    }

    const data = await paginate(DocumentFile, filter, req, ['uploadedBy', 'project']);
    res.json({ success: true, data });
  })
);

router.post(
  '/upload',
  authorize('files', 'create'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new NotFoundError('No file uploaded');
    const finalized = await finalizeUploadedFile(req.file);
    const meta = z
      .object({
        folder: z.string().optional(),
        visibility: z.enum(['company', 'private']).optional(),
        project: z.string().optional(),
        linkedModel: z.string().optional(),
        linkedId: z.string().optional(),
      })
      .parse(req.body);

    const doc = await DocumentFile.create({
      name: finalized.name,
      url: finalized.url,
      mime: finalized.mime,
      size: finalized.size,
      folder: meta.folder || (meta.project ? 'projects' : 'general'),
      visibility: meta.visibility || 'company',
      project: meta.project || (meta.linkedModel === 'Project' ? meta.linkedId : undefined),
      linkedModel: meta.linkedModel,
      linkedId: meta.linkedId,
      uploadedBy: req.user!.id,
    });

    await writeAudit({
      actor: req.user!.id,
      action: 'upload',
      entity: 'Document',
      entityId: doc._id.toString(),
      after: { name: doc.name, folder: doc.folder, project: doc.project },
      req,
    });

    const populated = await DocumentFile.findById(doc._id).populate('uploadedBy', 'name email avatar').populate('project', 'name');
    res.status(201).json({ success: true, data: populated || doc });
  })
);

router.delete(
  '/:id',
  authorize('files', 'read'),
  asyncHandler(async (req, res) => {
    const doc = await DocumentFile.findById(req.params.id);
    if (!doc) throw new NotFoundError('File not found');

    // Only creator, manager, or CEO can delete file
    if (
      req.user!.role === 'employee' &&
      doc.uploadedBy.toString() !== req.user!.id
    ) {
      throw new ForbiddenError('You can only delete files you uploaded');
    }

    await DocumentFile.findByIdAndDelete(req.params.id);

    // Try to remove file on disk if safe
    try {
      const filename = path.basename(doc.url);
      const full = path.join(uploadRoot, filename);
      if (fs.existsSync(full)) {
        fs.unlinkSync(full);
      }
    } catch {
      /* ignore file cleanup errors */
    }

    await writeAudit({
      actor: req.user!.id,
      action: 'delete',
      entity: 'Document',
      entityId: req.params.id,
      before: { name: doc.name, url: doc.url },
      req,
    });

    res.json({ success: true, data: { ok: true } });
  })
);

/**
 * Chat attachment download — membership-gated (chat:read), not files:read.
 * Looks up the attachment via ChatMessage so guessing filenames is not enough.
 */
router.get(
  '/chat/:filename',
  authorize('chat', 'read'),
  asyncHandler(async (req, res) => {
    const filename = path.basename(
      Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename
    );
    const needle = `/api/v1/files/chat/${filename}`;
    const message = await ChatMessage.findOne({
      'attachments.url': { $regex: filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$' },
      deletedForEveryoneAt: { $exists: false },
    })
      .select('conversation attachments')
      .lean();

    if (!message) throw new NotFoundError('File not found');

    const conversation = await Conversation.findById(message.conversation).select('members');
    if (!conversation || !conversation.members.some((m) => String(m) === req.user!.id)) {
      throw new ForbiddenError('Not a member of this conversation');
    }

    const attachment = (message.attachments || []).find(
      (a) => a.url === needle || a.url.endsWith(`/${filename}`) || a.url.includes(filename)
    );
    if (!attachment) throw new NotFoundError('File not found');

    if (attachment.url.startsWith('http://') || attachment.url.startsWith('https://')) {
      if (req.query.download === '1' || req.query.download === 'true') {
        res.setHeader('Content-Disposition', `attachment; filename="${attachment.name || filename}"`);
      }
      res.redirect(attachment.url);
      return;
    }

    const full = path.join(chatUploadRoot, filename);
    if (!fs.existsSync(full)) throw new NotFoundError('File not found');
    if (req.query.download === '1' || req.query.download === 'true') {
      res.download(full, attachment.name || filename);
      return;
    }
    res.sendFile(full);
  })
);

/** Authenticated file download/preview — not a public static URL */
router.get(
  '/:filename',
  authorize('files', 'read'),
  asyncHandler(async (req, res) => {
    const filename = path.basename(Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename);
    const localUrl = publicUploadPath(filename);
    const doc = await DocumentFile.findOne({
      $or: [{ url: localUrl }, { url: { $regex: filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$' } }],
    });
    if (doc) {
      if (
        req.user!.role === 'employee' &&
        doc.visibility === 'private' &&
        doc.uploadedBy.toString() !== req.user!.id
      ) {
        throw new ForbiddenError();
      }
      // Cloud-hosted files: redirect to the stored HTTPS URL after authz
      if (doc.url.startsWith('http://') || doc.url.startsWith('https://')) {
        if (req.query.download === '1' || req.query.download === 'true') {
          res.setHeader('Content-Disposition', `attachment; filename="${doc.name || filename}"`);
        }
        res.redirect(doc.url);
        return;
      }
    }
    const full = path.join(uploadRoot, filename);
    if (!fs.existsSync(full)) throw new NotFoundError('File not found');

    if (req.query.download === '1' || req.query.download === 'true') {
      res.download(full, doc?.name || filename);
      return;
    }

    res.sendFile(full);
  })
);

export default router;
