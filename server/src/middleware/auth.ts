import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/tokens.js';
import { UnauthorizedError, ForbiddenError } from '../utils/AppError.js';
import { User } from '../models/User.js';
import { can, type Action, type Resource, type Role } from '../config/permissions.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  name: string;
  mfaVerified: boolean;
  purpose: 'access' | 'mfa';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const MFA_PENDING_PATHS = [
  '/api/v1/auth/mfa/setup',
  '/api/v1/auth/mfa/confirm',
  '/api/v1/auth/mfa/verify',
  '/api/v1/auth/logout',
  '/api/v1/auth/me',
];

export const authenticate = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ')
    ? header.slice(7)
    : typeof req.query.token === 'string'
      ? req.query.token
      : undefined;
  if (!token) throw new UnauthorizedError('Missing access token');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw new UnauthorizedError('Invalid or expired access token');
  }

  const user = await User.findById(payload.sub).select('email role name status mfa.enabled');
  if (!user || user.status === 'disabled') throw new UnauthorizedError('Account disabled or not found');
  if (user.status === 'locked') throw new UnauthorizedError('Account is locked');

  const purpose = payload.purpose || 'access';
  const mfaVerified = !!payload.mfaVerified;

  // Pre-MFA tokens cannot access general APIs
  if (purpose === 'mfa' || !mfaVerified) {
    const allowed = MFA_PENDING_PATHS.some((p) => req.originalUrl.startsWith(p));
    if (!allowed) {
      throw new ForbiddenError('MFA verification required');
    }
  }

  // If user has MFA enabled, access tokens must be MFA-verified
  if (user.mfa?.enabled && !mfaVerified && purpose !== 'mfa') {
    throw new ForbiddenError('MFA verification required');
  }

  req.user = {
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    name: user.name,
    mfaVerified,
    purpose,
  };
  next();
});

export function requireMfa(req: Request, _res: Response, next: NextFunction) {
  if (!req.user?.mfaVerified) {
    throw new ForbiddenError('MFA verification required');
  }
  next();
}

export function authorize(resource: Resource, action: Action) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new UnauthorizedError();
    if (!can(req.user.role, resource, action)) {
      throw new ForbiddenError(`You do not have permission to ${action} ${resource}`);
    }
    next();
  };
}

export function requireRoles(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new UnauthorizedError();
    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError('Insufficient role');
    }
    next();
  };
}

/** Employees may only mutate tasks they are assigned to (or created). */
export function assertTaskAccess(
  task: { assignees?: { toString(): string }[]; createdBy?: { toString(): string } },
  user: AuthUser,
  mode: 'read' | 'write' = 'write'
) {
  if (user.role !== 'employee') return;
  const uid = user.id;
  const assigned = (task.assignees || []).some((a) => a.toString() === uid);
  const created = task.createdBy?.toString() === uid;
  if (mode === 'read' && !assigned && !created) throw new ForbiddenError('Not your task');
  if (mode === 'write' && !assigned && !created) throw new ForbiddenError('Not your task');
}
