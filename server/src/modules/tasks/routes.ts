import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { authenticate, authorize, assertTaskAccess, requireRoles } from '../../middleware/auth.js';
import { upload, publicUploadPath } from '../../middleware/upload.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { Task, TASK_PRIORITIES, TASK_STATUSES } from '../../models/Task.js';
import { DocumentFile } from '../../models/Document.js';
import { TimeLog } from '../../models/TimeLog.js';
import { AuditLog } from '../../models/AuditLog.js';
import { paginate } from '../../utils/pagination.js';
import { AppError, ForbiddenError, NotFoundError } from '../../utils/AppError.js';
import { writeAudit } from '../../utils/audit.js';
import { notifyUsers } from '../../utils/notify.js';
import { getIO } from '../../config/socket.js';
import { startOfDay, endOfDay, startOfWeek, endOfWeek } from 'date-fns';

function taskKeyFromId(id: { toString: () => string }) {
  return `SM-${id.toString().slice(-5).toUpperCase()}`;
}

async function ensureTaskKey(task: { _id: { toString: () => string }; key?: string | null }) {
  if (task.key) return task.key;
  const key = taskKeyFromId(task._id);
  await Task.findByIdAndUpdate(task._id, { key });
  return key;
}

const router = Router();
router.use(authenticate);

const taskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  project: z.string().optional(),
  parentTask: z.string().optional().nullable(),
  issueType: z.enum(['task', 'subtask']).optional(),
  assignees: z.array(z.string()).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  startDate: z.coerce.date().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  tags: z.array(z.string()).optional(),
  checklist: z.array(z.object({ text: z.string(), done: z.boolean().optional() })).optional(),
  dependsOn: z.array(z.string()).optional(),
  watchers: z.array(z.string()).optional(),
  progress: z.number().min(0).max(100).optional(),
});

async function syncParentProgress(parentId: string | undefined | null) {
  if (!parentId) return;
  const subs = await Task.find({ parentTask: parentId }).select('status').lean();
  if (!subs.length) return;
  const done = subs.filter((s) => s.status === 'completed').length;
  const progress = Math.round((done / subs.length) * 100);
  await Task.findByIdAndUpdate(parentId, { progress });
}

router.get(
  '/',
  authorize('tasks', 'read'),
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.priority) filter.priority = req.query.priority;
    if (req.query.project) filter.project = req.query.project;
    if (req.query.assignee) filter.assignees = req.query.assignee;
    if (req.user!.role === 'employee') filter.assignees = req.user!.id;
    if (req.query.search) filter.title = new RegExp(String(req.query.search), 'i');
    if (req.query.dueFrom || req.query.dueTo) {
      filter.dueDate = {};
      if (req.query.dueFrom) (filter.dueDate as Record<string, Date>).$gte = new Date(String(req.query.dueFrom));
      if (req.query.dueTo) (filter.dueDate as Record<string, Date>).$lte = new Date(String(req.query.dueTo));
    }
    const data = await paginate(Task, filter, req, ['assignees', 'project', 'createdBy']);
    res.json({ success: true, data });
  })
);

router.get(
  '/board',
  authorize('tasks', 'read'),
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {
      $and: [
        { $or: [{ parentTask: null }, { parentTask: { $exists: false } }] },
        { $or: [{ issueType: { $exists: false } }, { issueType: 'task' }, { issueType: null }] },
      ],
    };
    if (req.query.project) filter.project = req.query.project;
    if (req.user!.role === 'employee') filter.assignees = req.user!.id;
    const tasks = await Task.find(filter)
      .populate('assignees', 'name email avatar')
      .populate('project', 'name startDate endDate')
      .sort('dueDate')
      .lean();

    const ids = tasks.map((t) => t._id);
    const subtasks = ids.length
      ? await Task.find({ parentTask: { $in: ids } }).select('parentTask status').lean()
      : [];
    const subMap = new Map<string, { total: number; done: number }>();
    for (const s of subtasks) {
      const key = String(s.parentTask);
      const cur = subMap.get(key) || { total: 0, done: 0 };
      cur.total += 1;
      if (s.status === 'completed') cur.done += 1;
      subMap.set(key, cur);
    }

    const enriched = tasks.map((t) => ({
      ...t,
      key: t.key || taskKeyFromId(t._id),
      subtasks: subMap.get(String(t._id)) || { total: 0, done: 0 },
    }));

    const board = TASK_STATUSES.reduce(
      (acc, status) => {
        acc[status] = enriched.filter((t) => t.status === status);
        return acc;
      },
      {} as Record<string, typeof enriched>
    );
    res.json({ success: true, data: board });
  })
);

router.get(
  '/monitoring',
  authorize('tasks_monitoring', 'read'),
  asyncHandler(async (req, res) => {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const match: Record<string, unknown> = {};
    if (req.query.assignee) match.assignees = req.query.assignee;
    if (req.query.project) match.project = req.query.project;
    if (req.query.priority) match.priority = req.query.priority;

    const [total, today, completed, inProgress, pending, highPriority, deadlineAlerts, byAssignee] =
      await Promise.all([
        Task.countDocuments(match),
        Task.countDocuments({ ...match, dueDate: { $gte: todayStart, $lte: todayEnd } }),
        Task.countDocuments({ ...match, status: 'completed' }),
        Task.countDocuments({ ...match, status: 'in_progress' }),
        Task.countDocuments({ ...match, status: 'todo' }),
        Task.countDocuments({ ...match, priority: { $in: ['high', 'urgent'] }, status: { $ne: 'completed' } }),
        Task.countDocuments({
          ...match,
          status: { $ne: 'completed' },
          dueDate: { $lt: now },
        }),
        Task.aggregate([
          { $match: { ...match, status: { $ne: 'completed' } } },
          { $unwind: '$assignees' },
          { $group: { _id: '$assignees', count: { $sum: 1 } } },
          {
            $lookup: {
              from: 'users',
              localField: '_id',
              foreignField: '_id',
              as: 'user',
            },
          },
          { $unwind: '$user' },
          { $project: { name: '$user.name', count: 1 } },
          { $sort: { count: -1 } },
          { $limit: 20 },
        ]),
      ]);

    const todaySchedule = await Task.find({
      ...match,
      dueDate: { $gte: todayStart, $lte: todayEnd },
    })
      .populate('assignees', 'name email')
      .populate('project', 'name')
      .sort('priority')
      .lean();

    res.json({
      success: true,
      data: {
        tiles: { total, today, completed, inProgress, pending, highPriority, deadlineAlerts },
        workload: byAssignee,
        todaySchedule,
      },
    });
  })
);

router.post(
  '/',
  authorize('tasks', 'create'),
  asyncHandler(async (req, res) => {
    const body = taskSchema.parse(req.body);
    let parent: InstanceType<typeof Task> | null = null;
    if (body.parentTask) {
      parent = await Task.findById(body.parentTask);
      if (!parent) throw new NotFoundError('Parent task not found');
      if (parent.parentTask) throw new AppError('Cannot nest subtasks more than one level', 400);
      assertTaskAccess(parent, req.user!, 'write');
    }

    const task = await Task.create({
      ...body,
      project: body.project || parent?.project,
      parentTask: body.parentTask || undefined,
      issueType: body.parentTask ? 'subtask' : body.issueType || 'task',
      createdBy: req.user!.id,
      watchers: body.watchers || body.assignees || parent?.assignees?.map(String) || [],
      assignees: body.assignees?.length ? body.assignees : parent?.assignees || [],
    });
    task.key = taskKeyFromId(task._id);
    await task.save();

    if (task.parentTask) await syncParentProgress(String(task.parentTask));

    await writeAudit({
      actor: req.user!.id,
      action: 'create',
      entity: 'Task',
      entityId: task._id.toString(),
      after: task,
      req,
    });
    if (body.assignees?.length) {
      await notifyUsers(
        body.assignees.filter((id: string) => id !== req.user!.id),
        {
          type: 'task_assigned',
          title: 'New task assigned',
          message: `You were assigned: ${task.title}`,
          link: `/tasks?project=${task.project || ''}`,
        }
      );
    }
    res.status(201).json({ success: true, data: task });
  })
);

router.get(
  '/:id',
  authorize('tasks', 'read'),
  asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id)
      .populate('assignees', 'name email avatar')
      .populate('project', 'name startDate endDate')
      .populate('createdBy', 'name email avatar')
      .populate('comments.user', 'name email avatar')
      .populate('dependsOn', 'title status key')
      .populate('parentTask', 'title status key project')
      .populate('attachments.uploadedBy', 'name email avatar')
      .lean();
    if (!task) throw new NotFoundError('Task not found');
    if (
      req.user!.role === 'employee' &&
      !task.assignees.some((a: { _id: { toString: () => string } }) => a._id.toString() === req.user!.id)
    ) {
      throw new ForbiddenError();
    }

    const key = await ensureTaskKey(task);

    const subtasks = await Task.find({ parentTask: task._id })
      .populate('assignees', 'name email avatar')
      .populate('createdBy', 'name email')
      .sort('createdAt')
      .lean();

    for (const s of subtasks) {
      if (!s.key) {
        s.key = await ensureTaskKey(s);
      }
    }

    const [timeLogs, activity] = await Promise.all([
      TimeLog.find({ task: task._id })
        .populate('user', 'name email avatar')
        .sort({ start: -1 })
        .limit(30)
        .lean(),
      AuditLog.find({ entity: 'Task', entityId: String(task._id) })
        .populate('actor', 'name email')
        .sort({ createdAt: -1 })
        .limit(40)
        .lean(),
    ]);

    const loggedMinutes = timeLogs.reduce((sum, l) => sum + (l.minutes || 0), 0);

    res.json({
      success: true,
      data: {
        ...task,
        key,
        subtasks,
        subtaskStats: {
          total: subtasks.length,
          done: subtasks.filter((s) => s.status === 'completed').length,
        },
        timeLogs,
        loggedMinutes,
        activity,
      },
    });
  })
);

router.post(
  '/:id/attachments',
  authorize('tasks', 'update'),
  upload.array('files', 10),
  asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) throw new NotFoundError('Task not found');
    assertTaskAccess(task, req.user!, 'write');

    const files = (req.files as Express.Multer.File[]) || (req.file ? [req.file] : []);
    if (!files.length) throw new AppError('No files uploaded', 400);

    const createdAttachments = [];
    for (const f of files) {
      const url = publicUploadPath(f.filename);
      const attachment = {
        name: f.originalname,
        url,
        size: f.size,
        mime: f.mimetype,
        uploadedBy: new mongoose.Types.ObjectId(req.user!.id),
        createdAt: new Date(),
      };
      task.attachments.push(attachment);
      createdAttachments.push(attachment);

      await DocumentFile.create({
        name: f.originalname,
        url,
        mime: f.mimetype,
        size: f.size,
        folder: 'tasks',
        visibility: task.project ? 'project' : 'private',
        project: task.project,
        linkedModel: 'Task',
        linkedId: task._id,
        owner: req.user!.id,
        uploadedBy: req.user!.id,
      });
    }

    await task.save();

    await writeAudit({
      actor: req.user!.id,
      action: 'upload_attachments',
      entity: 'Task',
      entityId: req.params.id,
      after: { count: files.length, fileNames: files.map((f) => f.originalname) },
      req,
    });

    const populated = await Task.findById(task._id)
      .populate('attachments.uploadedBy', 'name email avatar')
      .lean();

    res.status(201).json({
      success: true,
      data: {
        attachments: populated?.attachments || task.attachments,
      },
    });
  })
);

router.delete(
  '/:id/attachments/:attachmentId',
  authorize('tasks', 'update'),
  asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) throw new NotFoundError('Task not found');
    assertTaskAccess(task, req.user!, 'write');

    const attachmentId = req.params.attachmentId;
    const attIndex = task.attachments.findIndex(
      (a) => a._id?.toString() === attachmentId
    );
    if (attIndex === -1) throw new NotFoundError('Attachment not found');

    const att = task.attachments[attIndex];
    if (
      req.user!.role === 'employee' &&
      att.uploadedBy?.toString() !== req.user!.id
    ) {
      throw new ForbiddenError('You can only delete files you uploaded');
    }

    task.attachments.splice(attIndex, 1);
    await task.save();

    await DocumentFile.findOneAndDelete({ url: att.url });

    res.json({ success: true, data: { ok: true, attachments: task.attachments } });
  })
);

/** Create a subtask under a parent task */
router.post(
  '/:id/subtasks',
  authorize('tasks', 'create'),
  asyncHandler(async (req, res) => {
    const parent = await Task.findById(req.params.id);
    if (!parent) throw new NotFoundError('Task not found');
    if (parent.parentTask || parent.issueType === 'subtask') {
      throw new AppError('Cannot add subtasks to a subtask', 400);
    }
    assertTaskAccess(parent, req.user!, 'write');

    const body = z
      .object({
        title: z.string().min(1),
        description: z.string().optional(),
        dueDate: z.coerce.date().optional().nullable(),
        startDate: z.coerce.date().optional().nullable(),
        assignees: z.array(z.string()).optional(),
        priority: z.enum(TASK_PRIORITIES).optional(),
        status: z.enum(TASK_STATUSES).optional(),
      })
      .parse(req.body);

    const sub = await Task.create({
      title: body.title,
      description: body.description,
      project: parent.project,
      parentTask: parent._id,
      issueType: 'subtask',
      priority: body.priority || parent.priority,
      status: body.status || 'todo',
      startDate: body.startDate || undefined,
      dueDate: body.dueDate || undefined,
      assignees: body.assignees?.length ? body.assignees : parent.assignees,
      createdBy: req.user!.id,
      watchers: parent.assignees,
    });
    sub.key = taskKeyFromId(sub._id);
    await sub.save();

    await syncParentProgress(String(parent._id));
    await writeAudit({
      actor: req.user!.id,
      action: 'create_subtask',
      entity: 'Task',
      entityId: String(parent._id),
      after: { subtaskId: sub._id.toString(), title: sub.title, key: sub.key },
      req,
    });
    await writeAudit({
      actor: req.user!.id,
      action: 'create',
      entity: 'Task',
      entityId: sub._id.toString(),
      after: sub,
      req,
    });

    const assigneeIds = (sub.assignees || []).map(String).filter((id) => id !== req.user!.id);
    await notifyUsers(assigneeIds, {
      type: 'task_assigned',
      title: 'New subtask assigned',
      message: `${req.user!.name || 'Someone'} assigned you subtask "${sub.title}" under "${parent.title}"`,
      link: `/tasks?project=${parent.project || ''}`,
    });

    const populated = await Task.findById(sub._id)
      .populate('assignees', 'name email avatar')
      .populate('createdBy', 'name email');
    res.status(201).json({ success: true, data: populated });
  })
);

router.patch(
  '/:id',
  authorize('tasks', 'update'),
  asyncHandler(async (req, res) => {
    const body = taskSchema.partial().parse(req.body);
    const before = await Task.findById(req.params.id);
    if (!before) throw new NotFoundError('Task not found');
    assertTaskAccess(before, req.user!, 'write');

    // Employees cannot reassign tasks to others
    if (req.user!.role === 'employee' && body.assignees) {
      delete (body as { assignees?: unknown }).assignees;
    }

    const isSubtask = !!(before.parentTask || before.issueType === 'subtask');
    if (body.status === 'completed' && before.status !== 'completed') {
      if (!isSubtask && req.user!.role !== 'ceo') {
        throw new ForbiddenError('Only CEO can mark parent tasks Completed after Review');
      }
      if (!isSubtask && before.status !== 'review' && req.user!.role !== 'ceo') {
        throw new AppError('Task must be in Review before Completed', 400);
      }
      body.progress = 100;
    }

    const update: Record<string, unknown> = { ...body };
    if (body.status === 'completed') update.completedAt = new Date();
    if (body.status === 'in_progress' && !before.startedAt) update.startedAt = new Date();

    const task = await Task.findByIdAndUpdate(req.params.id, update, { new: true }).populate(
      'assignees',
      'name email'
    );

    if (body.status && body.status !== before.status) {
      const ids = (task?.assignees || [])
        .map((a: { _id: { toString: () => string } }) => a._id.toString())
        .filter((id: string) => id !== req.user!.id);
      await notifyUsers(ids, {
        type: 'task_status',
        title: 'Task status updated',
        message: `"${task?.title}" is now ${body.status}`,
        link: `/tasks?project=${task?.project || ''}`,
      });
      try {
        getIO().emit('task:updated', { id: task?._id, status: body.status });
      } catch {
        /* ignore */
      }
    }

    if (body.assignees) {
      const beforeIds = new Set((before.assignees || []).map(String));
      const newlyAssigned = body.assignees.filter(
        (id: string) => !beforeIds.has(id) && id !== req.user!.id
      );
      if (newlyAssigned.length) {
        await notifyUsers(newlyAssigned, {
          type: 'task_assigned',
          title: 'Task assigned to you',
          message: `You were assigned: ${task?.title}`,
          link: `/tasks?project=${task?.project || ''}`,
        });
      }
    }

    if (before.parentTask) await syncParentProgress(String(before.parentTask));

    await writeAudit({
      actor: req.user!.id,
      action: 'update',
      entity: 'Task',
      entityId: req.params.id,
      before: before.toObject(),
      after: task,
      req,
    });
    res.json({ success: true, data: task });
  })
);

router.post(
  '/:id/status',
  authorize('tasks', 'update'),
  asyncHandler(async (req, res) => {
    const { status } = z.object({ status: z.enum(TASK_STATUSES) }).parse(req.body);
    req.body = { status };
    // reuse patch logic via direct call pattern — inline
    const before = await Task.findById(req.params.id);
    if (!before) throw new NotFoundError('Task not found');
    assertTaskAccess(before, req.user!, 'write');
    const isSubtask = !!(before.parentTask || before.issueType === 'subtask');
    if (status === 'completed') {
      if (!isSubtask && req.user!.role !== 'ceo') {
        throw new ForbiddenError('Only CEO can mark Completed');
      }
      if (!isSubtask && before.status !== 'review' && req.user!.role !== 'ceo') {
        throw new AppError('Task must be in Review before Completed', 400);
      }
    }
    before.status = status;
    if (status === 'completed') {
      before.completedAt = new Date();
      before.progress = 100;
    }
    if (status === 'in_progress' && !before.startedAt) {
      before.startedAt = new Date();
    }
    await before.save();
    if (before.parentTask) await syncParentProgress(String(before.parentTask));
    const assigneeIds = (before.assignees || []).map(String).filter((id) => id !== req.user!.id);
    await notifyUsers(assigneeIds, {
      type: 'task_status',
      title: 'Task status updated',
      message: `"${before.title}" is now ${status}`,
      link: `/tasks?project=${before.project || ''}`,
    });
    try {
      getIO().emit('task:updated', { id: before._id, status });
    } catch {
      /* ignore */
    }
    res.json({ success: true, data: before });
  })
);

router.post(
  '/:id/comments',
  authorize('tasks', 'update'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({ body: z.string().min(1), mentions: z.array(z.string()).optional() })
      .parse(req.body);
    const task = await Task.findById(req.params.id);
    if (!task) throw new NotFoundError('Task not found');
    assertTaskAccess(task, req.user!, 'write');
    task.comments.push({
      user: req.user!.id as unknown as import('mongoose').Types.ObjectId,
      body: body.body,
      mentions: (body.mentions || []) as unknown as import('mongoose').Types.ObjectId[],
      createdAt: new Date(),
    });
    await task.save();
    if (body.mentions?.length) {
      await notifyUsers(body.mentions, {
        type: 'mention',
        title: 'You were mentioned',
        message: `${req.user!.name} mentioned you on "${task.title}"`,
        link: `/tasks/${task._id}`,
      });
    }
    res.status(201).json({ success: true, data: task.comments[task.comments.length - 1] });
  })
);

router.delete(
  '/:id',
  authorize('tasks', 'delete'),
  requireRoles('ceo'),
  asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) throw new NotFoundError('Task not found');
    const parentId = task.parentTask ? String(task.parentTask) : null;
    await Task.deleteMany({ parentTask: task._id });
    await Task.findByIdAndDelete(task._id);
    if (parentId) await syncParentProgress(parentId);
    res.json({ success: true, data: { ok: true } });
  })
);

// Time logs nested under tasks module for convenience
router.get(
  '/time-logs/list',
  authorize('time_logs', 'read'),
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (req.user!.role === 'employee' || req.query.mine === '1') filter.user = req.user!.id;
    else if (req.query.user) filter.user = req.query.user;
    if (req.query.task) filter.task = req.query.task;
    const data = await paginate(TimeLog, filter, req, ['task', 'user']);
    res.json({ success: true, data });
  })
);

router.post(
  '/time-logs',
  authorize('time_logs', 'create'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        task: z.string(),
        start: z.coerce.date(),
        end: z.coerce.date().optional(),
        minutes: z.number().optional(),
        note: z.string().optional(),
      })
      .parse(req.body);
    let minutes = body.minutes || 0;
    if (body.end && body.start) {
      minutes = Math.max(0, Math.round((body.end.getTime() - body.start.getTime()) / 60000));
    }
    const log = await TimeLog.create({
      user: req.user!.id,
      task: body.task,
      start: body.start,
      end: body.end,
      minutes,
      note: body.note,
    });
    res.status(201).json({ success: true, data: log });
  })
);

router.post(
  '/time-logs/start',
  authorize('time_logs', 'create'),
  asyncHandler(async (req, res) => {
    const { task } = z.object({ task: z.string() }).parse(req.body);
    const existing = await TimeLog.findOne({ user: req.user!.id, end: null });
    if (existing) throw new AppError('Stop the active timer first', 400);
    const log = await TimeLog.create({
      user: req.user!.id,
      task,
      start: new Date(),
      minutes: 0,
    });
    res.status(201).json({ success: true, data: log });
  })
);

router.post(
  '/time-logs/:id/stop',
  authorize('time_logs', 'update'),
  asyncHandler(async (req, res) => {
    const log = await TimeLog.findById(req.params.id);
    if (!log) throw new NotFoundError('Time log not found');
    if (log.user.toString() !== req.user!.id && req.user!.role === 'employee') {
      throw new ForbiddenError();
    }
    log.end = new Date();
    log.minutes = Math.max(1, Math.round((log.end.getTime() - log.start.getTime()) / 60000));
    await log.save();
    res.json({ success: true, data: log });
  })
);

router.get(
  '/time-logs/summary',
  authorize('time_logs', 'read'),
  asyncHandler(async (req, res) => {
    const userId = req.user!.role === 'employee' ? req.user!.id : req.query.user || req.user!.id;
    const now = new Date();
    const [today, week] = await Promise.all([
      TimeLog.aggregate([
        {
          $match: {
            user: new (await import('mongoose')).default.Types.ObjectId(String(userId)),
            start: { $gte: startOfDay(now), $lte: endOfDay(now) },
          },
        },
        { $group: { _id: null, minutes: { $sum: '$minutes' } } },
      ]),
      TimeLog.aggregate([
        {
          $match: {
            user: new (await import('mongoose')).default.Types.ObjectId(String(userId)),
            start: { $gte: startOfWeek(now, { weekStartsOn: 1 }), $lte: endOfWeek(now, { weekStartsOn: 1 }) },
          },
        },
        { $group: { _id: null, minutes: { $sum: '$minutes' } } },
      ]),
    ]);
    res.json({
      success: true,
      data: {
        todayMinutes: today[0]?.minutes || 0,
        weekMinutes: week[0]?.minutes || 0,
      },
    });
  })
);

router.post(
  '/time-logs/submit',
  authorize('time_logs', 'update'),
  asyncHandler(async (req, res) => {
    const { ids } = z.object({ ids: z.array(z.string()).min(1) }).parse(req.body);
    await TimeLog.updateMany(
      { _id: { $in: ids }, user: req.user!.id },
      { submitted: true, submittedAt: new Date() }
    );
    res.json({ success: true, data: { ok: true } });
  })
);

export default router;
