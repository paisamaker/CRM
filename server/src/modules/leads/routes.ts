import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { Lead, LEAD_STAGES } from '../../models/Lead.js';
import { Client } from '../../models/Client.js';
import { paginate } from '../../utils/pagination.js';
import { NotFoundError, AppError } from '../../utils/AppError.js';
import { writeAudit } from '../../utils/audit.js';

const router = Router();
router.use(authenticate);

const leadSchema = z.object({
  name: z.string().min(1),
  company: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  source: z.string().optional(),
  stage: z.enum(LEAD_STAGES).optional(),
  value: z.number().min(0).optional(),
  nextFollowUp: z.coerce.date().optional(),
  lostReason: z.string().optional(),
  notes: z.string().optional(),
  owner: z.string().optional(),
});

router.get(
  '/',
  authorize('leads', 'read'),
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (req.query.stage) filter.stage = req.query.stage;
    if (req.query.owner) filter.owner = req.query.owner;
    if (req.query.search) {
      filter.$or = [
        { name: new RegExp(String(req.query.search), 'i') },
        { company: new RegExp(String(req.query.search), 'i') },
      ];
    }
    const data = await paginate(Lead, filter, req, 'owner');
    res.json({ success: true, data });
  })
);

router.get(
  '/board',
  authorize('leads', 'read'),
  asyncHandler(async (_req, res) => {
    const leads = await Lead.find({ stage: { $nin: [] } })
      .populate('owner', 'name email')
      .sort('-updatedAt')
      .lean();
    const board = LEAD_STAGES.reduce(
      (acc, stage) => {
        acc[stage] = leads.filter((l) => l.stage === stage);
        return acc;
      },
      {} as Record<string, typeof leads>
    );
    res.json({ success: true, data: board });
  })
);

router.post(
  '/',
  authorize('leads', 'create'),
  asyncHandler(async (req, res) => {
    const body = leadSchema.parse(req.body);
    const lead = await Lead.create({
      ...body,
      email: body.email || undefined,
      owner: body.owner || req.user!.id,
      lastActivityAt: new Date(),
      activity: [
        {
          type: 'created',
          message: 'Lead created',
          by: req.user!.id,
          at: new Date(),
        },
      ],
    });
    await writeAudit({
      actor: req.user!.id,
      action: 'create',
      entity: 'Lead',
      entityId: lead._id.toString(),
      after: lead,
      req,
    });
    const ownerId = String(lead.owner);
    if (ownerId && ownerId !== req.user!.id) {
      const { notifyUsers } = await import('../../utils/notify.js');
      await notifyUsers([ownerId], {
        type: 'lead_assigned',
        title: 'Lead assigned to you',
        message: `"${lead.name}" was assigned to you`,
        link: '/leads',
      });
    }
    res.status(201).json({ success: true, data: lead });
  })
);

router.patch(
  '/:id',
  authorize('leads', 'update'),
  asyncHandler(async (req, res) => {
    const body = leadSchema.partial().parse(req.body);
    const before = await Lead.findById(req.params.id);
    if (!before) throw new NotFoundError('Lead not found');
    if (body.stage && body.stage !== before.stage) {
      before.activity.push({
        type: 'stage_change',
        message: `Stage changed from ${before.stage} to ${body.stage}`,
        by: req.user!.id as unknown as import('mongoose').Types.ObjectId,
        at: new Date(),
        meta: { from: before.stage, to: body.stage },
      });
    }
    const prevOwner = String(before.owner || '');
    Object.assign(before, body, { lastActivityAt: new Date() });
    const lead = await before.save();
    await writeAudit({
      actor: req.user!.id,
      action: 'update',
      entity: 'Lead',
      entityId: req.params.id,
      before,
      after: lead,
      req,
    });
    const nextOwner = String(lead.owner || '');
    if (body.owner && nextOwner && nextOwner !== prevOwner && nextOwner !== req.user!.id) {
      const { notifyUsers } = await import('../../utils/notify.js');
      await notifyUsers([nextOwner], {
        type: 'lead_assigned',
        title: 'Lead assigned to you',
        message: `"${lead.name}" was assigned to you`,
        link: '/leads',
      });
    }
    res.json({ success: true, data: lead });
  })
);

router.post(
  '/:id/convert',
  authorize('leads', 'update'),
  asyncHandler(async (req, res) => {
    const lead = await Lead.findById(req.params.id);
    if (!lead) throw new NotFoundError('Lead not found');
    if (lead.convertedClient) throw new AppError('Lead already converted', 400);

    const client = await Client.create({
      name: lead.name,
      company: lead.company || lead.name,
      email: lead.email,
      phone: lead.phone,
      owner: lead.owner,
      status: 'active',
      onboardedAt: new Date(),
      lastActivityAt: new Date(),
    });

    lead.stage = 'won';
    lead.convertedClient = client._id;
    lead.lastActivityAt = new Date();
    lead.activity.push({
      type: 'converted',
      message: `Converted to client ${client.company}`,
      by: req.user!.id as unknown as import('mongoose').Types.ObjectId,
      at: new Date(),
      meta: { clientId: client._id },
    });
    await lead.save();

    await writeAudit({
      actor: req.user!.id,
      action: 'convert',
      entity: 'Lead',
      entityId: lead._id.toString(),
      after: { clientId: client._id },
      req,
    });

    res.json({ success: true, data: { lead, client } });
  })
);

router.delete(
  '/:id',
  authorize('leads', 'delete'),
  asyncHandler(async (req, res) => {
    const lead = await Lead.findByIdAndDelete(req.params.id);
    if (!lead) throw new NotFoundError('Lead not found');
    res.json({ success: true, data: { ok: true } });
  })
);

export default router;
