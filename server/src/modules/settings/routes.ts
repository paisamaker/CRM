import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize, requireRoles } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getSettings, Settings } from '../../models/Settings.js';
import { AuditLog } from '../../models/AuditLog.js';
import { paginate } from '../../utils/pagination.js';
import { writeAudit } from '../../utils/audit.js';
import { env } from '../../config/env.js';
import { PERMISSIONS } from '../../config/permissions.js';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  authorize('settings', 'read'),
  asyncHandler(async (_req, res) => {
    const settings = await getSettings();
    res.json({
      success: true,
      data: {
        settings,
        meta: {
          companyName: env.COMPANY_NAME,
          permissions: PERMISSIONS,
        },
      },
    });
  })
);

router.patch(
  '/',
  requireRoles('ceo'),
  authorize('settings', 'manage'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        allowedDomains: z.array(z.string()).optional(),
        approvalRules: z
          .object({
            autoApproveUnder: z.number().optional(),
            alwaysCeoAbove: z.number().optional(),
            requireReasonOnReject: z.boolean().optional(),
          })
          .optional(),
        alertThresholds: z.record(z.any()).optional(),
        passwordPolicy: z.record(z.any()).optional(),
        company: z
          .object({
            name: z.string().optional(),
            currency: z.string().optional(),
            timezone: z.string().optional(),
            logo: z.string().optional(),
            address: z.string().optional(),
          })
          .optional(),
        cloudinary: z
          .object({
            cloudName: z.string().optional(),
            apiKey: z.string().optional(),
            apiSecret: z.string().optional(),
          })
          .optional(),
        mfaOptionalForEmployees: z.boolean().optional(),
      })
      .parse(req.body);

    const before = await getSettings();
    const settings = await Settings.findByIdAndUpdate(before._id, body, { new: true });
    await writeAudit({
      actor: req.user!.id,
      action: 'update',
      entity: 'Settings',
      entityId: before._id.toString(),
      before,
      after: settings,
      req,
    });
    res.json({ success: true, data: settings });
  })
);

router.get(
  '/audit-logs',
  requireRoles('ceo'),
  authorize('audit', 'read'),
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (req.query.entity) filter.entity = req.query.entity;
    if (req.query.actor) filter.actor = req.query.actor;
    if (req.query.action) filter.action = req.query.action;
    const data = await paginate(AuditLog, filter, req, 'actor');
    res.json({ success: true, data });
  })
);

export default router;
