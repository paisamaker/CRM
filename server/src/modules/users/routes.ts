import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize, requireRoles } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { User } from '../../models/User.js';
import { paginate } from '../../utils/pagination.js';
import { NotFoundError, AppError } from '../../utils/AppError.js';
import { writeAudit } from '../../utils/audit.js';
import { ROLES } from '../../config/permissions.js';
import { hashPassword, validatePassword } from '../../utils/password.js';
import { randomToken } from '../../utils/tokens.js';
import { getSettings } from '../../models/Settings.js';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  authorize('users', 'read'),
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (req.query.role) filter.role = req.query.role;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.search) {
      filter.$or = [
        { name: new RegExp(String(req.query.search), 'i') },
        { email: new RegExp(String(req.query.search), 'i') },
      ];
    }
    const data = await paginate(User, filter, req);
    res.json({ success: true, data });
  })
);

router.get(
  '/:id',
  authorize('users', 'read'),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id).lean();
    if (!user) throw new NotFoundError('User not found');
    res.json({ success: true, data: user });
  })
);

router.patch(
  '/:id',
  authorize('users', 'update'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(2).optional(),
        department: z.string().optional(),
        status: z.enum(['active', 'disabled']).optional(),
        avatar: z.string().optional(),
        phone: z.string().max(40).optional(),
        designation: z.string().max(120).optional(),
        joiningDate: z.coerce.date().optional().nullable(),
        manager: z.string().optional().nullable(),
        employeeId: z.string().max(40).optional(),
      })
      .parse(req.body);
    const before = await User.findById(req.params.id).lean();
    if (!before) throw new NotFoundError('User not found');
    const user = await User.findByIdAndUpdate(req.params.id, body, { new: true });
    await writeAudit({
      actor: req.user!.id,
      action: 'update',
      entity: 'User',
      entityId: req.params.id,
      before,
      after: user,
      req,
    });
    res.json({ success: true, data: user });
  })
);

router.patch(
  '/:id/role',
  requireRoles('ceo'),
  authorize('users', 'manage'),
  asyncHandler(async (req, res) => {
    const { role } = z.object({ role: z.enum(ROLES) }).parse(req.body);
    if (req.params.id === req.user!.id) throw new AppError('Cannot change your own role', 400);
    const before = await User.findById(req.params.id).lean();
    if (!before) throw new NotFoundError('User not found');
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
    await writeAudit({
      actor: req.user!.id,
      action: 'role_change',
      entity: 'User',
      entityId: req.params.id,
      before: { role: before.role },
      after: { role },
      req,
    });
    const userId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { notifyUsers } = await import('../../utils/notify.js');
    await notifyUsers([userId], {
      type: 'role_change',
      title: 'Your role was updated',
      message: `Your role changed from ${before.role} to ${role}`,
      link: '/dashboard',
    });
    res.json({ success: true, data: user });
  })
);

/** Soft-disable account (keeps record; can reactivate). */
router.post(
  '/:id/deactivate',
  authorize('users', 'delete'),
  asyncHandler(async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (id === req.user!.id) throw new AppError('Cannot deactivate yourself', 400);

    const target = await User.findById(id);
    if (!target) throw new NotFoundError('User not found');

    if (req.user!.role !== 'ceo') {
      if (target.role === 'ceo' || target.role === 'manager') {
        throw new AppError('Managers can only deactivate employee or finance accounts', 403, 'FORBIDDEN');
      }
    }

    target.status = 'disabled';
    target.refreshTokens = [];
    await target.save();

    await writeAudit({
      actor: req.user!.id,
      action: 'disable',
      entity: 'User',
      entityId: id,
      after: { status: 'disabled', role: target.role, email: target.email },
      req,
    });
    res.json({ success: true, data: target });
  })
);

/**
 * Permanent delete — removes the user document.
 * Requires body.confirmEmail to match the target email.
 */
router.delete(
  '/:id',
  authorize('users', 'delete'),
  asyncHandler(async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (id === req.user!.id) throw new AppError('Cannot delete yourself', 400);

    const body = z
      .object({
        confirmEmail: z.string().email(),
        permanent: z.literal(true),
      })
      .parse(req.body);

    const target = await User.findById(id);
    if (!target) throw new NotFoundError('User not found');

    if (req.user!.role !== 'ceo') {
      if (target.role === 'ceo' || target.role === 'manager') {
        throw new AppError('Managers can only permanently delete employee or finance accounts', 403, 'FORBIDDEN');
      }
    }

    if (target.email.toLowerCase() !== body.confirmEmail.toLowerCase()) {
      throw new AppError('Confirmation email does not match this user', 400, 'CONFIRM_MISMATCH');
    }

    const snapshot = {
      email: target.email,
      name: target.name,
      role: target.role,
      employeeId: target.employeeId,
      status: target.status,
    };

    await User.deleteOne({ _id: target._id });

    await writeAudit({
      actor: req.user!.id,
      action: 'permanent_delete',
      entity: 'User',
      entityId: id,
      before: snapshot,
      req,
    });

    res.json({
      success: true,
      data: { deleted: true, id, ...snapshot },
    });
  })
);

/** Generate a one-time temporary password (hashed in DB; plaintext returned once). */
router.post(
  '/:id/reset-password',
  authorize('users', 'manage'),
  asyncHandler(async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (id === req.user!.id) throw new AppError('Use change-password for your own account', 400);

    const user = await User.findById(id).select('+passwordHash +passwordHistory');
    if (!user) throw new NotFoundError('User not found');

    if (req.user!.role !== 'ceo') {
      if (user.role === 'ceo' || user.role === 'manager') {
        throw new AppError('Managers can only reset passwords for employee or finance accounts', 403, 'FORBIDDEN');
      }
    }

    const tempPassword = `${randomToken(10)}Aa1!`;
    const passwordHash = await hashPassword(tempPassword);
    user.passwordHash = passwordHash;
    user.passwordHistory = [...(user.passwordHistory || []), passwordHash].slice(-5);
    user.passwordChangedAt = new Date();
    user.refreshTokens = [];
    user.mustChangePassword = true;
    // Invited users become login-ready after admin sets a password
    if (user.status === 'invited' || user.status === 'locked') {
      user.status = 'active';
      user.inviteToken = undefined;
      user.inviteExpires = undefined;
    }
    await user.save();

    await writeAudit({
      actor: req.user!.id,
      action: 'admin_password_reset',
      entity: 'User',
      entityId: id,
      after: { role: user.role, status: user.status },
      req,
    });

    res.json({
      success: true,
      data: {
        ok: true,
        tempPassword,
        email: user.email,
        name: user.name,
        status: user.status,
        message: 'Share this temporary password securely. It is not stored in plaintext. User can log in now.',
      },
    });
  })
);

/**
 * Admin sets a chosen login password for an employee.
 * Activates invited accounts so they can sign in immediately.
 */
router.post(
  '/:id/set-password',
  authorize('users', 'manage'),
  asyncHandler(async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (id === req.user!.id) throw new AppError('Use change-password for your own account', 400);

    const body = z
      .object({
        password: z.string().min(6),
        activate: z.boolean().optional().default(true),
      })
      .parse(req.body);

    const user = await User.findById(id).select('+passwordHash +passwordHistory +inviteToken');
    if (!user) throw new NotFoundError('User not found');

    if (req.user!.role !== 'ceo') {
      if (user.role === 'ceo' || user.role === 'manager') {
        throw new AppError('Managers can only set passwords for employee or finance accounts', 403, 'FORBIDDEN');
      }
    }

    if (user.status === 'disabled') {
      throw new AppError('Reactivate the account before setting a login password', 400, 'ACCOUNT_DISABLED');
    }

    const settings = await getSettings();
    validatePassword(body.password, settings.passwordPolicy);

    const passwordHash = await hashPassword(body.password);
    user.passwordHash = passwordHash;
    user.passwordHistory = [...(user.passwordHistory || []), passwordHash].slice(
      -settings.passwordPolicy.historyCount
    );
    user.passwordChangedAt = new Date();
    user.refreshTokens = [];
    user.mustChangePassword = false;
    user.failedAttempts = 0;
    user.lockUntil = undefined;

    if (body.activate && (user.status === 'invited' || user.status === 'locked')) {
      user.status = 'active';
      user.inviteToken = undefined;
      user.inviteExpires = undefined;
    }

    await user.save();

    await writeAudit({
      actor: req.user!.id,
      action: 'admin_set_password',
      entity: 'User',
      entityId: id,
      after: { status: user.status, role: user.role },
      req,
    });

    res.json({
      success: true,
      data: {
        ok: true,
        email: user.email,
        name: user.name,
        status: user.status,
        message: 'Password set. Employee can log in with this password.',
      },
    });
  })
);

/** Reactivate a disabled account */
router.post(
  '/:id/reactivate',
  authorize('users', 'update'),
  asyncHandler(async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const target = await User.findById(id);
    if (!target) throw new NotFoundError('User not found');

    if (req.user!.role !== 'ceo' && (target.role === 'ceo' || target.role === 'manager')) {
      throw new AppError('Managers can only reactivate employee or finance accounts', 403, 'FORBIDDEN');
    }

    target.status = 'active';
    await target.save();
    await writeAudit({
      actor: req.user!.id,
      action: 'reactivate',
      entity: 'User',
      entityId: id,
      req,
    });
    res.json({ success: true, data: target });
  })
);

export default router;
