import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize, requireRoles } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { Alert } from '../../models/Alert.js';
import { Notification } from '../../models/Notification.js';
import { paginate } from '../../utils/pagination.js';
import { NotFoundError } from '../../utils/AppError.js';
import { runAlertEngine } from '../../jobs/alertEngine.js';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  authorize('alerts', 'read'),
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (req.query.type) filter.type = req.query.type;
    if (req.query.severity) filter.severity = req.query.severity;
    if (req.query.status) filter.status = req.query.status;
    // Non-executives only see alerts assigned to them (or unscoped company alerts for managers)
    if (req.user!.role === 'employee' || req.user!.role === 'finance') {
      filter.user = req.user!.id;
    }
    const data = await paginate(Alert, filter, req);
    res.json({ success: true, data });
  })
);

router.get(
  '/notifications',
  authorize('notifications', 'read'),
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = { user: req.user!.id };
    if (req.query.unread === '1') filter.readAt = null;
    if (req.query.type) filter.type = String(req.query.type);
    const data = await paginate(Notification, filter, req);
    const unread = await Notification.countDocuments({ user: req.user!.id, readAt: null });
    res.json({ success: true, data: { ...data, unread } });
  })
);

router.patch(
  '/notifications/read',
  authorize('notifications', 'update'),
  asyncHandler(async (req, res) => {
    const body = z.object({ ids: z.array(z.string()).optional(), all: z.boolean().optional() }).parse(req.body);
    if (body.all) {
      await Notification.updateMany({ user: req.user!.id, readAt: null }, { readAt: new Date() });
    } else if (body.ids?.length) {
      await Notification.updateMany(
        { _id: { $in: body.ids }, user: req.user!.id },
        { readAt: new Date() }
      );
    }
    res.json({ success: true, data: { ok: true } });
  })
);

router.patch(
  '/notifications/:id/read',
  authorize('notifications', 'update'),
  asyncHandler(async (req, res) => {
    const note = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user!.id },
      { readAt: new Date() },
      { new: true }
    );
    if (!note) throw new NotFoundError('Notification not found');
    res.json({ success: true, data: note });
  })
);

router.post(
  '/run',
  requireRoles('ceo'),
  asyncHandler(async (_req, res) => {
    await runAlertEngine();
    res.json({ success: true, data: { ok: true } });
  })
);

router.patch(
  '/:id',
  authorize('alerts', 'update'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        status: z.enum(['open', 'snoozed', 'resolved']).optional(),
        snoozedUntil: z.coerce.date().optional(),
      })
      .parse(req.body);
    const update: Record<string, unknown> = { ...body };
    if (body.status === 'resolved') update.resolvedAt = new Date();
    const alert = await Alert.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!alert) throw new NotFoundError('Alert not found');
    res.json({ success: true, data: alert });
  })
);

export default router;
