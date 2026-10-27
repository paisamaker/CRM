import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import mongoose from 'mongoose';
import { authenticate, authorize } from '../../middleware/auth.js';
import { upload, publicUploadPath, finalizeUploadedFile } from '../../middleware/upload.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { DocumentFile } from '../../models/Document.js';
import { ChatMessage } from '../../models/ChatMessage.js';
import { Conversation } from '../../models/Conversation.js';
import { Project } from '../../models/Project.js';
import { AppError, ForbiddenError, NotFoundError } from '../../utils/AppError.js';
import { writeAudit } from '../../utils/audit.js';
import {
  assertFileAccess,
  buildAccessibleFilesFilter,
  getEffectiveAccess,
  isFileAdmin,
  loadDocument,
} from '../../services/filePermissions.js';
import { reconcileMissingProjectFolders } from '../../services/projectFolders.js';
import type { Role } from '../../config/permissions.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadRoot = path.resolve(__dirname, '../../../uploads');
const chatUploadRoot = path.join(uploadRoot, 'chat');

router.use(authenticate);

function paramId(value: string | string[] | undefined): string {
  if (!value) return '';
  return Array.isArray(value) ? value[0] : value;
}

function andMatch(base: Record<string, unknown>, extra: Record<string, unknown>) {
  return { $and: [base, extra] };
}

function safeContentDisposition(filename: string, asAttachment: boolean) {
  const cleaned = filename.replace(/[\r\n"]/g, '_').slice(0, 180) || 'download';
  const type = asAttachment ? 'attachment' : 'inline';
  return `${type}; filename="${cleaned}"`;
}

function applyPreviewHeaders(res: import('express').Response, mime: string, name: string, download: boolean) {
  const dangerous =
    /^text\/html/i.test(mime) ||
    /^image\/svg/i.test(mime) ||
    /^application\/xhtml/i.test(mime) ||
    /\.svg$/i.test(name) ||
    /\.html?$/i.test(name);
  // Force download for executable-in-browser types so they never run in app origin
  const forceAttach = download || dangerous;
  res.setHeader('Content-Disposition', safeContentDisposition(name, forceAttach));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (dangerous) {
    res.setHeader('Content-Type', 'application/octet-stream');
  } else if (mime) {
    res.setHeader('Content-Type', mime);
  }
}

/** Overview metrics for the current user's accessible library */
router.get(
  '/overview',
  authorize('files', 'read'),
  asyncHandler(async (req, res) => {
    const base = await buildAccessibleFilesFilter(req.user!.id, req.user!.role as Role);
    const fileBase = andMatch(base, { kind: { $ne: 'folder' } });

    const [total, images, documents, videos, recent, storageAgg, projects] = await Promise.all([
      DocumentFile.countDocuments(fileBase),
      DocumentFile.countDocuments(andMatch(fileBase, { mime: /^image\//i })),
      DocumentFile.countDocuments(
        andMatch(fileBase, {
          $or: [
            { mime: 'application/pdf' },
            { mime: /word|sheet|excel|msword|officedocument|text\//i },
          ],
        })
      ),
      DocumentFile.countDocuments(andMatch(fileBase, { mime: /^video\//i })),
      DocumentFile.find(fileBase)
        .sort({ createdAt: -1 })
        .limit(8)
        .populate('uploadedBy', 'name avatar')
        .populate('project', 'name')
        .lean(),
      DocumentFile.aggregate([
        { $match: fileBase as any },
        { $group: { _id: null, bytes: { $sum: '$size' } } },
      ]),
      Project.find(
        isFileAdmin(req.user!.role as Role)
          ? {}
          : { $or: [{ owner: req.user!.id }, { members: req.user!.id }] }
      )
        .select('name status')
        .sort({ updatedAt: -1 })
        .limit(40)
        .lean(),
    ]);

    res.json({
      success: true,
      data: {
        total,
        images,
        documents,
        videos,
        storageBytes: storageAgg[0]?.bytes || 0,
        recent,
        projects,
      },
    });
  })
);

/** List files/folders with permission-aware filters */
router.get(
  '/',
  authorize('files', 'read'),
  asyncHandler(async (req, res) => {
    const view = String(req.query.view || 'all');
    const parentId = req.query.parentId ? String(req.query.parentId) : '';
    const projectId = req.query.project ? String(req.query.project) : '';
    const search = String(req.query.search || '').trim();
    const type = String(req.query.type || '');
    const sort = String(req.query.sort || '-updatedAt');
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);

    const accessFilter = await buildAccessibleFilesFilter(req.user!.id, req.user!.role as Role, {
      trash: view === 'trash',
      starred: view === 'starred',
      sharedWithMe: view === 'shared',
      myFiles: view === 'mine',
    });

    const and: Record<string, unknown>[] = [accessFilter];

    if (view === 'folders') and.push({ kind: 'folder' });
    else if (view === 'media') and.push({ mime: /^(image|video|audio)\//i, kind: { $ne: 'folder' } });
    else if (view === 'documents') {
      and.push({
        kind: { $ne: 'folder' },
        $or: [{ mime: 'application/pdf' }, { mime: /word|sheet|excel|officedocument|text\//i }],
      });
    } else if (view === 'projects' || projectId) {
      and.push({ project: projectId || { $exists: true, $ne: null } });
      if (projectId) and.push({ project: projectId });
    }

    if (parentId) {
      if (!mongoose.isValidObjectId(parentId)) throw new AppError('Invalid folder', 400);
      const parent = await loadDocument(parentId);
      await assertFileAccess(parent, req.user!.id, req.user!.role as Role, 'view');
      and.push({ parentId });
    } else if (!search && !projectId && view === 'all') {
      // Root listing: items without parent (or legacy flat docs)
      and.push({
        $or: [{ parentId: null }, { parentId: { $exists: false } }],
      });
    }

    if (req.query.folder && req.query.folder !== 'all') {
      and.push({ folder: String(req.query.folder) });
    }
    if (search) {
      and.push({ name: new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') });
    }
    if (type === 'images') and.push({ mime: /^image\//i });
    else if (type === 'pdfs') and.push({ mime: 'application/pdf' });
    else if (type === 'videos') and.push({ mime: /^video\//i });
    else if (type === 'audio') and.push({ mime: /^audio\//i });

    const filter = and.length === 1 ? and[0] : { $and: and };
    const sortObj: Record<string, 1 | -1> = {};
    if (sort.startsWith('-')) sortObj[sort.slice(1)] = -1;
    else sortObj[sort] = 1;
    // Folders first
    const items = await DocumentFile.find(filter)
      .sort({ kind: -1, ...sortObj })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('uploadedBy', 'name email avatar role')
      .populate('owner', 'name email avatar')
      .populate('project', 'name status')
      .populate('shares.user', 'name email avatar')
      .lean();

    const total = await DocumentFile.countDocuments(filter);

    const withAccess = await Promise.all(
      items.map(async (item) => {
        const access = await getEffectiveAccess(item as any, req.user!.id, req.user!.role as Role);
        return { ...item, accessLevel: access.level };
      })
    );

    res.json({
      success: true,
      data: {
        items: withAccess,
        total,
        page,
        pages: Math.ceil(total / limit) || 1,
        limit,
      },
    });
  })
);

/** Create folder */
router.post(
  '/folders',
  authorize('files', 'create'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().trim().min(1).max(120),
        parentId: z.string().optional(),
        project: z.string().optional(),
        visibility: z.enum(['private', 'project', 'shared', 'company']).optional(),
      })
      .parse(req.body);

    let parentId: string | undefined;
    let project = body.project;
    let visibility = body.visibility || 'private';

    if (body.parentId) {
      const parent = await loadDocument(body.parentId);
      await assertFileAccess(parent, req.user!.id, req.user!.role as Role, 'upload');
      parentId = body.parentId;
      project = project || (parent!.project ? String(parent!.project) : undefined);
      if (parent!.visibility === 'project') visibility = 'project';
    }

    const folder = await DocumentFile.create({
      name: body.name,
      kind: 'folder',
      url: '',
      mime: 'inode/directory',
      size: 0,
      folder: project ? 'projects' : 'general',
      folderType: project ? 'project_sub' : 'general',
      parentId,
      project,
      linkedModel: project ? 'Project' : undefined,
      linkedId: project,
      owner: req.user!.id,
      uploadedBy: req.user!.id,
      visibility,
    });

    await writeAudit({
      actor: req.user!.id,
      action: 'create_folder',
      entity: 'Document',
      entityId: String(folder._id),
      after: { name: folder.name, parentId, project },
      req,
    });

    const populated = await DocumentFile.findById(folder._id)
      .populate('uploadedBy', 'name email avatar')
      .populate('project', 'name')
      .lean();
    res.status(201).json({ success: true, data: populated });
  })
);

/** Upload file into optional folder / project */
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
        visibility: z.enum(['private', 'project', 'shared', 'company']).optional(),
        project: z.string().optional(),
        parentId: z.string().optional(),
        linkedModel: z.string().optional(),
        linkedId: z.string().optional(),
      })
      .parse(req.body);

    let parentId = meta.parentId;
    let project = meta.project || (meta.linkedModel === 'Project' ? meta.linkedId : undefined);
    let visibility = meta.visibility || (project ? 'project' : 'private');

    if (parentId) {
      const parent = await loadDocument(parentId);
      await assertFileAccess(parent, req.user!.id, req.user!.role as Role, 'upload');
      project = project || (parent!.project ? String(parent!.project) : undefined);
      if (parent!.visibility === 'project') visibility = 'project';
    }

    const doc = await DocumentFile.create({
      name: finalized.name,
      url: finalized.url,
      mime: finalized.mime,
      size: finalized.size,
      kind: 'file',
      folder: meta.folder || (project ? 'projects' : 'general'),
      parentId,
      project,
      linkedModel: meta.linkedModel || (project ? 'Project' : undefined),
      linkedId: meta.linkedId || project,
      visibility,
      owner: req.user!.id,
      uploadedBy: req.user!.id,
      storageProvider: finalized.url.startsWith('http') ? 'cloudinary' : 'local',
    });

    await writeAudit({
      actor: req.user!.id,
      action: 'upload',
      entity: 'Document',
      entityId: doc._id.toString(),
      after: { name: doc.name, folder: doc.folder, project: doc.project, parentId },
      req,
    });

    const populated = await DocumentFile.findById(doc._id)
      .populate('uploadedBy', 'name email avatar')
      .populate('project', 'name')
      .lean();
    res.status(201).json({ success: true, data: populated || doc });
  })
);

/** Metadata for a single file/folder (permission-gated) */
router.get(
  '/item/:id',
  authorize('files', 'read'),
  asyncHandler(async (req, res) => {
    const doc = await DocumentFile.findById(paramId(req.params.id))
      .populate('uploadedBy', 'name email avatar role')
      .populate('owner', 'name email avatar')
      .populate('project', 'name status')
      .populate('shares.user', 'name email avatar')
      .populate('parentId', 'name kind');
    if (!doc) throw new NotFoundError('File not found');
    await assertFileAccess(doc, req.user!.id, req.user!.role as Role, 'view');
    const access = await getEffectiveAccess(doc, req.user!.id, req.user!.role as Role);
    res.json({ success: true, data: { ...doc.toObject(), accessLevel: access.level } });
  })
);

/** Rename / move / archive / visibility */
router.patch(
  '/item/:id',
  authorize('files', 'read'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().trim().min(1).max(255).optional(),
        parentId: z.string().nullable().optional(),
        visibility: z.enum(['private', 'project', 'shared', 'company']).optional(),
        starred: z.boolean().optional(),
        archive: z.boolean().optional(),
        restore: z.boolean().optional(),
      })
      .parse(req.body);

    const doc = await loadDocument(paramId(req.params.id));
    if (!doc) throw new NotFoundError('File not found');

    if (body.restore) {
      await assertFileAccess(doc, req.user!.id, req.user!.role as Role, 'delete');
      doc.trashedAt = undefined;
      doc.trashedBy = undefined;
    } else if (body.starred !== undefined) {
      await assertFileAccess(doc, req.user!.id, req.user!.role as Role, 'view');
      const uid = req.user!.id;
      const has = doc.starredBy.some((id) => String(id) === uid);
      if (body.starred && !has) doc.starredBy.push(uid as any);
      if (!body.starred && has) doc.starredBy = doc.starredBy.filter((id) => String(id) !== uid);
    } else if (body.archive !== undefined) {
      await assertFileAccess(doc, req.user!.id, req.user!.role as Role, 'manage');
      doc.archivedAt = body.archive ? new Date() : undefined;
    } else {
      await assertFileAccess(doc, req.user!.id, req.user!.role as Role, 'rename');
      if (body.name) doc.name = body.name;
      if (body.visibility) {
        const visOwnerId = doc.owner
          ? String((doc.owner as { _id?: unknown })._id ?? doc.owner)
          : '';
        if (!isFileAdmin(req.user!.role as Role) && visOwnerId !== req.user!.id) {
          throw new ForbiddenError('Only owner or admin can change visibility');
        }
        doc.visibility = body.visibility;
      }
      if (body.parentId !== undefined) {
        await assertFileAccess(doc, req.user!.id, req.user!.role as Role, 'move');
        if (body.parentId) {
          const parent = await loadDocument(body.parentId);
          await assertFileAccess(parent, req.user!.id, req.user!.role as Role, 'upload');
          if (String(parent!._id) === String(doc._id)) throw new AppError('Cannot move into itself', 400);
          doc.parentId = parent!._id as any;
          if (parent!.project) doc.project = parent!.project;
        } else {
          doc.parentId = undefined;
        }
      }
    }

    await doc.save();
    await writeAudit({
      actor: req.user!.id,
      action: 'update',
      entity: 'Document',
      entityId: String(doc._id),
      after: body,
      req,
    });

    const populated = await DocumentFile.findById(doc._id)
      .populate('uploadedBy', 'name email avatar')
      .populate('project', 'name')
      .lean();
    res.json({ success: true, data: populated });
  })
);

/** Soft-delete (trash) or permanent delete for admins */
router.delete(
  '/item/:id',
  authorize('files', 'read'),
  asyncHandler(async (req, res) => {
    const permanent = String(req.query.permanent || '') === '1';
    const doc = await loadDocument(paramId(req.params.id));
    if (!doc) throw new NotFoundError('File not found');
    await assertFileAccess(doc, req.user!.id, req.user!.role as Role, 'delete');

    if (permanent && isFileAdmin(req.user!.role as Role)) {
      if (doc.kind === 'file' && doc.url && !doc.url.startsWith('http')) {
        try {
          const filename = path.basename(doc.url);
          const full = path.join(uploadRoot, filename);
          if (fs.existsSync(full)) fs.unlinkSync(full);
        } catch {
          /* ignore */
        }
      }
      await DocumentFile.findByIdAndDelete(doc._id);
      await writeAudit({
        actor: req.user!.id,
        action: 'delete_permanent',
        entity: 'Document',
        entityId: paramId(req.params.id),
        before: { name: doc.name },
        req,
      });
      res.json({ success: true, data: { permanent: true } });
      return;
    }

    doc.trashedAt = new Date();
    doc.trashedBy = req.user!.id as any;
    await doc.save();
    await writeAudit({
      actor: req.user!.id,
      action: 'trash',
      entity: 'Document',
      entityId: String(doc._id),
      before: { name: doc.name },
      req,
    });
    res.json({ success: true, data: { trashed: true } });
  })
);

/** Share / revoke */
router.post(
  '/item/:id/share',
  authorize('files', 'read'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        userId: z.string().min(1),
        level: z.enum(['viewer', 'contributor', 'editor', 'manager']).default('viewer'),
        revoke: z.boolean().optional(),
      })
      .parse(req.body);

    const doc = await loadDocument(paramId(req.params.id));
    if (!doc) throw new NotFoundError('File not found');

    const ownerId = doc.owner ? String((doc.owner as { _id?: unknown })._id ?? doc.owner) : '';
    const uploaderId = doc.uploadedBy
      ? String((doc.uploadedBy as { _id?: unknown })._id ?? doc.uploadedBy)
      : '';
    const isOwner = ownerId === req.user!.id || uploaderId === req.user!.id;
    if (!isFileAdmin(req.user!.role as Role) && !isOwner) {
      await assertFileAccess(doc, req.user!.id, req.user!.role as Role, 'share');
    }
    if (body.level === 'manager' && !isFileAdmin(req.user!.role as Role)) {
      throw new ForbiddenError('Only admins can grant manager level');
    }

    doc.shares = (doc.shares || []).filter((s) => String(s.user) !== body.userId);
    if (!body.revoke) {
      doc.shares.push({
        user: body.userId as any,
        level: body.level,
        grantedBy: req.user!.id as any,
        grantedAt: new Date(),
      });
      if (doc.visibility === 'private') doc.visibility = 'shared';
    } else if (doc.shares.length === 0 && doc.visibility === 'shared' && !doc.project) {
      doc.visibility = 'private';
    }

    await doc.save();
    await writeAudit({
      actor: req.user!.id,
      action: body.revoke ? 'revoke_share' : 'share',
      entity: 'Document',
      entityId: String(doc._id),
      after: body,
      req,
    });

    const populated = await DocumentFile.findById(doc._id)
      .populate('shares.user', 'name email avatar')
      .populate('uploadedBy', 'name email avatar')
      .lean();
    res.json({ success: true, data: populated });
  })
);

/** Admin: reconcile missing project folders */
router.post(
  '/admin/reconcile-project-folders',
  authorize('files', 'read'),
  asyncHandler(async (req, res) => {
    if (!isFileAdmin(req.user!.role as Role)) throw new ForbiddenError();
    const fixed = await reconcileMissingProjectFolders();
    res.json({ success: true, data: { fixed } });
  })
);

/**
 * Chat attachment download — membership-gated (chat:read).
 */
router.get(
  '/chat/:filename',
  authorize('chat', 'read'),
  asyncHandler(async (req, res) => {
    const filename = path.basename(
      Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename
    );
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
      (a) => a.url.endsWith(`/${filename}`) || a.url.includes(filename)
    );
    if (!attachment) throw new NotFoundError('File not found');

    const wantDownload =
      req.query.download === '1' || req.query.download === 'true';
    if (attachment.url.startsWith('http://') || attachment.url.startsWith('https://')) {
      applyPreviewHeaders(
        res,
        attachment.mime || 'application/octet-stream',
        attachment.name || filename,
        wantDownload
      );
      res.redirect(attachment.url);
      return;
    }

    const full = path.join(chatUploadRoot, filename);
    if (!fs.existsSync(full)) throw new NotFoundError('File not found');
    applyPreviewHeaders(
      res,
      attachment.mime || 'application/octet-stream',
      attachment.name || filename,
      wantDownload
    );
    if (wantDownload) {
      res.download(full, attachment.name || filename);
      return;
    }
    res.sendFile(full);
  })
);

/** Authenticated file download/preview by storage filename */
router.get(
  '/:filename',
  authorize('files', 'read'),
  asyncHandler(async (req, res) => {
    const filename = path.basename(
      Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename
    );
    // Avoid capturing API subpaths as filenames
    if (['overview', 'folders', 'upload', 'item', 'admin', 'chat'].includes(filename)) {
      throw new NotFoundError('Not found');
    }

    const localUrl = publicUploadPath(filename);
    const doc = await DocumentFile.findOne({
      kind: { $ne: 'folder' },
      $or: [{ url: localUrl }, { url: { $regex: filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$' } }],
    });

    const wantDownload =
      req.query.download === '1' || req.query.download === 'true';

    if (doc) {
      await assertFileAccess(doc, req.user!.id, req.user!.role as Role, 'download');
      if (doc.url.startsWith('http://') || doc.url.startsWith('https://')) {
        applyPreviewHeaders(res, doc.mime, doc.name || filename, wantDownload);
        // Short-lived redirect only — Cloudinary URLs may remain reachable until CDN cache expires
        res.redirect(doc.url);
        return;
      }
    } else if (!isFileAdmin(req.user!.role as Role)) {
      // Do not serve orphan files to non-admins (ID / path guessing protection)
      throw new NotFoundError('File not found');
    }

    const full = path.join(uploadRoot, filename);
    if (!fs.existsSync(full)) throw new NotFoundError('File not found');

    applyPreviewHeaders(res, doc?.mime || 'application/octet-stream', doc?.name || filename, wantDownload);
    if (wantDownload) {
      res.download(full, doc?.name || filename);
      return;
    }
    res.sendFile(full);
  })
);

export default router;
