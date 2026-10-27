import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { authenticate, authorize } from '../../middleware/auth.js';
import { upload, publicUploadPath, finalizeUploadedFile } from '../../middleware/upload.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { Project } from '../../models/Project.js';
import { Task } from '../../models/Task.js';
import { User } from '../../models/User.js';
import { DocumentFile } from '../../models/Document.js';
import { paginate } from '../../utils/pagination.js';
import { AppError, ForbiddenError, NotFoundError } from '../../utils/AppError.js';
import { writeAudit } from '../../utils/audit.js';

const router = Router();
router.use(authenticate);

const projectSchema = z.object({
  name: z.string().min(1),
  client: z.string().optional(),
  members: z.array(z.string()).optional(),
  budget: z.number().min(0).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  status: z.enum(['planned', 'active', 'on_hold', 'completed', 'cancelled']).optional(),
  progress: z.number().min(0).max(100).optional(),
  tags: z.array(z.string()).optional(),
  description: z.string().optional(),
});

function paramId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

router.get(
  '/',
  authorize('projects', 'read'),
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.client) filter.client = req.query.client;
    if (req.query.search) filter.name = new RegExp(String(req.query.search), 'i');
    // Employees only see projects they own or are assigned to
    if (req.user!.role === 'employee') {
      filter.$or = [{ owner: req.user!.id }, { members: req.user!.id }];
    }
    const data = await paginate(Project, filter, req, ['owner', 'client', 'members', 'attachments.uploadedBy']);
    res.json({ success: true, data });
  })
);

router.post(
  '/',
  authorize('projects', 'create'),
  asyncHandler(async (req, res) => {
    const body = projectSchema.parse(req.body);
    const project = await Project.create({ ...body, owner: req.user!.id, members: body.members || [] });
    try {
      const { ensureProjectFolders } = await import('../../services/projectFolders.js');
      await ensureProjectFolders(String(project._id), project.name, req.user!.id);
    } catch (err) {
      // Project remains usable; folders can be reconciled later via admin endpoint
      console.warn('[projects] folder bootstrap failed', err);
    }
    await writeAudit({
      actor: req.user!.id,
      action: 'create',
      entity: 'Project',
      entityId: project._id.toString(),
      after: project,
      req,
    });
    res.status(201).json({ success: true, data: project });
  })
);

/**
 * Assign employees to a project and create To-Do workflow tasks on the board.
 */
router.post(
  '/:id/assign',
  authorize('projects', 'update'),
  asyncHandler(async (req, res) => {
    const id = paramId(req.params.id);
    const body = z
      .object({
        memberIds: z.array(z.string()).min(1),
        createTasks: z.boolean().optional().default(true),
        taskTitle: z.string().optional(),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().default('medium'),
        dueDate: z.coerce.date().optional(),
      })
      .parse(req.body);

    const project = await Project.findById(id);
    if (!project) throw new NotFoundError('Project not found');

    const users = await User.find({
      _id: { $in: body.memberIds },
      status: 'active',
      role: { $in: ['employee', 'manager', 'finance'] },
    }).select('_id name email');

    if (!users.length) throw new AppError('No valid active employees selected', 400);

    const existing = new Set(project.members.map(String));
    const newlyAdded: string[] = [];
    for (const u of users) {
      const uid = String(u._id);
      if (!existing.has(uid)) {
        existing.add(uid);
        newlyAdded.push(uid);
      }
    }
    project.members = [...existing].map((mid) => new mongoose.Types.ObjectId(mid));
    await project.save();

    const createdTasks = [];
    if (body.createTasks) {
      for (const u of users) {
        const title = body.taskTitle?.trim() || `Work on ${project.name}`;
        // Avoid duplicate open assignment tasks for same user+project
        const existingTask = await Task.findOne({
          project: project._id,
          assignees: u._id,
          status: { $ne: 'completed' },
          title,
        });
        if (existingTask) {
          createdTasks.push(existingTask);
          continue;
        }
        const task = await Task.create({
          title,
          description: `Assigned to work on project "${project.name}". Update status as you progress (To-Do → In Progress → Review → Completed).`,
          project: project._id,
          assignees: [u._id],
          priority: body.priority,
          status: 'todo',
          dueDate: body.dueDate || project.endDate,
          createdBy: req.user!.id,
          watchers: [req.user!.id, u._id],
        });
        createdTasks.push(task);

      }
      const { notifyUsers } = await import('../../utils/notify.js');
      await notifyUsers(
        users.map((u) => String(u._id)),
        {
          type: 'project_assignment',
          title: 'Project assigned',
          message: `You were assigned to project "${project.name}". Open Tasks to update your workflow.`,
          link: `/tasks?project=${project._id}`,
        }
      );
    } else {
      const { notifyUsers } = await import('../../utils/notify.js');
      await notifyUsers(
        users.map((u) => String(u._id)),
        {
          type: 'project_assignment',
          title: 'Added to project',
          message: `You were added to project "${project.name}".`,
          link: `/projects`,
        }
      );
    }

    await writeAudit({
      actor: req.user!.id,
      action: 'assign_members',
      entity: 'Project',
      entityId: id,
      after: { members: project.members, tasksCreated: createdTasks.length, newlyAdded },
      req,
    });

    const populated = await Project.findById(id)
      .populate('owner', 'name email')
      .populate('members', 'name email role')
      .populate('client', 'name company')
      .lean();

    res.json({
      success: true,
      data: {
        project: populated,
        tasksCreated: createdTasks.length,
        newlyAdded: newlyAdded.length,
      },
    });
  })
);

router.get(
  '/:id',
  authorize('projects', 'read'),
  asyncHandler(async (req, res) => {
    const id = paramId(req.params.id);
    const project = await Project.findById(id)
      .populate('owner', 'name email')
      .populate('client', 'name company')
      .populate('members', 'name email role')
      .populate('attachments.uploadedBy', 'name email avatar')
      .lean();
    if (!project) throw new NotFoundError('Project not found');
    if (req.user!.role === 'employee') {
      const ownerId = String((project.owner as { _id?: unknown })?._id || project.owner);
      const isMember = (project.members || []).some(
        (m: { _id?: unknown }) => String(m._id || m) === req.user!.id
      );
      if (ownerId !== req.user!.id && !isMember) {
        throw new NotFoundError('Project not found');
      }
    }
    const [tasks, workflowFiles] = await Promise.all([
      Task.find({ project: id }).select('status priority dueDate attachments').lean(),
      DocumentFile.find({
        $or: [{ project: id }, { linkedId: id }],
      })
        .populate('uploadedBy', 'name email avatar')
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    res.json({
      success: true,
      data: {
        ...project,
        workflowFiles,
        taskStats: {
          total: tasks.length,
          completed: tasks.filter((t) => t.status === 'completed').length,
          overdue: tasks.filter((t) => t.dueDate && t.status !== 'completed' && t.dueDate < new Date()).length,
        },
      },
    });
  })
);

router.post(
  '/:id/attachments',
  upload.array('files', 10),
  asyncHandler(async (req, res) => {
    const id = paramId(req.params.id);
    const project = await Project.findById(id);
    if (!project) throw new NotFoundError('Project not found');

    if (req.user!.role === 'employee') {
      const ownerId = String((project.owner as { _id?: unknown })?._id || project.owner);
      const isMember = (project.members || []).some(
        (m: { _id?: unknown }) => String(m._id || m) === req.user!.id
      );
      if (ownerId !== req.user!.id && !isMember) {
        throw new ForbiddenError('Not a member of this project');
      }
    }

    const files = (req.files as Express.Multer.File[]) || (req.file ? [req.file] : []);
    if (!files.length) throw new AppError('No files uploaded', 400);

    const root = await DocumentFile.findOne({ projectFolderKey: `${id}:root` }).select('_id');
    const createdAttachments = [];
    for (const f of files) {
      const finalized = await finalizeUploadedFile(f);
      const attachment = {
        name: finalized.name,
        url: finalized.url,
        size: finalized.size,
        mime: finalized.mime,
        uploadedBy: new mongoose.Types.ObjectId(req.user!.id),
        createdAt: new Date(),
      };
      project.attachments.push(attachment);
      createdAttachments.push(attachment);

      await DocumentFile.create({
        name: finalized.name,
        url: finalized.url,
        mime: finalized.mime,
        size: finalized.size,
        folder: 'projects',
        kind: 'file',
        visibility: 'project',
        project: project._id,
        parentId: root?._id,
        linkedModel: 'Project',
        linkedId: project._id,
        owner: req.user!.id,
        uploadedBy: req.user!.id,
        storageProvider: finalized.url.startsWith('http') ? 'cloudinary' : 'local',
      });
    }

    await project.save();

    await writeAudit({
      actor: req.user!.id,
      action: 'upload_attachments',
      entity: 'Project',
      entityId: id,
      after: { count: files.length, fileNames: files.map((f) => f.originalname) },
      req,
    });

    const updated = await Project.findById(id)
      .populate('attachments.uploadedBy', 'name email avatar')
      .lean();

    res.status(201).json({
      success: true,
      data: {
        attachments: updated?.attachments || project.attachments,
      },
    });
  })
);

router.delete(
  '/:id/attachments/:attachmentId',
  asyncHandler(async (req, res) => {
    const id = paramId(req.params.id);
    const attachmentId = paramId(req.params.attachmentId);
    const project = await Project.findById(id);
    if (!project) throw new NotFoundError('Project not found');

    const attIndex = project.attachments.findIndex(
      (a) => a._id?.toString() === attachmentId
    );
    if (attIndex === -1) throw new NotFoundError('Attachment not found');

    const att = project.attachments[attIndex];
    if (
      req.user!.role === 'employee' &&
      att.uploadedBy?.toString() !== req.user!.id
    ) {
      throw new ForbiddenError('You can only delete files you uploaded');
    }

    project.attachments.splice(attIndex, 1);
    await project.save();

    await DocumentFile.findOneAndDelete({ url: att.url });

    res.json({ success: true, data: { ok: true, attachments: project.attachments } });
  })
);

router.patch(
  '/:id',
  authorize('projects', 'update'),
  asyncHandler(async (req, res) => {
    const id = paramId(req.params.id);
    const body = projectSchema.partial().parse(req.body);
    const before = await Project.findById(id).lean();
    if (!before) throw new NotFoundError('Project not found');
    const project = await Project.findByIdAndUpdate(id, body, { new: true });
    if (body.name && project) {
      try {
        const { ensureProjectFolders } = await import('../../services/projectFolders.js');
        await ensureProjectFolders(id, project.name, req.user!.id);
      } catch {
        /* non-fatal */
      }
    }
    await writeAudit({
      actor: req.user!.id,
      action: 'update',
      entity: 'Project',
      entityId: id,
      before,
      after: project,
      req,
    });
    res.json({ success: true, data: project });
  })
);

router.delete(
  '/:id',
  authorize('projects', 'delete'),
  asyncHandler(async (req, res) => {
    const id = paramId(req.params.id);
    const project = await Project.findByIdAndDelete(id);
    if (!project) throw new NotFoundError('Project not found');
    res.json({ success: true, data: { ok: true } });
  })
);

export default router;
