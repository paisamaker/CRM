import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { Client } from '../../models/Client.js';
import { paginate } from '../../utils/pagination.js';
import { NotFoundError } from '../../utils/AppError.js';
import { writeAudit } from '../../utils/audit.js';

const router = Router();
router.use(authenticate);

const clientSchema = z.object({
  name: z.string().min(1),
  company: z.string().min(1),
  contact: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  status: z.enum(['active', 'inactive', 'churned', 'prospect']).optional(),
  industry: z.string().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  onboardedAt: z.coerce.date().optional(),
});

router.get(
  '/',
  authorize('clients', 'read'),
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.search) {
      filter.$or = [
        { name: new RegExp(String(req.query.search), 'i') },
        { company: new RegExp(String(req.query.search), 'i') },
        { email: new RegExp(String(req.query.search), 'i') },
      ];
    }
    const data = await paginate(Client, filter, req, 'owner');
    res.json({ success: true, data });
  })
);

router.post(
  '/',
  authorize('clients', 'create'),
  asyncHandler(async (req, res) => {
    const body = clientSchema.parse(req.body);
    const client = await Client.create({
      ...body,
      email: body.email || undefined,
      owner: req.user!.id,
      lastActivityAt: new Date(),
    });
    await writeAudit({
      actor: req.user!.id,
      action: 'create',
      entity: 'Client',
      entityId: client._id.toString(),
      after: client,
      req,
    });
    res.status(201).json({ success: true, data: client });
  })
);

router.get(
  '/:id',
  authorize('clients', 'read'),
  asyncHandler(async (req, res) => {
    const client = await Client.findById(req.params.id).populate('owner', 'name email').lean();
    if (!client) throw new NotFoundError('Client not found');
    res.json({ success: true, data: client });
  })
);

router.patch(
  '/:id',
  authorize('clients', 'update'),
  asyncHandler(async (req, res) => {
    const body = clientSchema.partial().parse(req.body);
    const before = await Client.findById(req.params.id).lean();
    if (!before) throw new NotFoundError('Client not found');
    const client = await Client.findByIdAndUpdate(
      req.params.id,
      { ...body, lastActivityAt: new Date() },
      { new: true }
    );
    await writeAudit({
      actor: req.user!.id,
      action: 'update',
      entity: 'Client',
      entityId: req.params.id,
      before,
      after: client,
      req,
    });
    res.json({ success: true, data: client });
  })
);

router.delete(
  '/:id',
  authorize('clients', 'delete'),
  asyncHandler(async (req, res) => {
    const client = await Client.findByIdAndDelete(req.params.id);
    if (!client) throw new NotFoundError('Client not found');
    await writeAudit({
      actor: req.user!.id,
      action: 'delete',
      entity: 'Client',
      entityId: req.params.id,
      before: client,
      req,
    });
    res.json({ success: true, data: { ok: true } });
  })
);

export default router;
