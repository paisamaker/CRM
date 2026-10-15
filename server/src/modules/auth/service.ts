import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { OAuth2Client } from 'google-auth-library';
import type { Request } from 'express';
import { env, isAllowedEmail } from '../../config/env.js';
import { MFA_REQUIRED_ROLES, type Role } from '../../config/permissions.js';
import { User, type IUser } from '../../models/User.js';
import { getSettings } from '../../models/Settings.js';
import {
  comparePassword,
  hashPassword,
  isPasswordReused,
  validatePassword,
} from '../../utils/password.js';
import {
  hashToken,
  randomToken,
  signAccessToken,
  signMfaTempToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../../utils/tokens.js';
import { differenceInDays } from 'date-fns';
import { AppError, ForbiddenError, NotFoundError, UnauthorizedError } from '../../utils/AppError.js';
import { writeAudit } from '../../utils/audit.js';
import { sendEmail } from '../../utils/mailer.js';

const googleClient = env.GOOGLE_CLIENT_ID ? new OAuth2Client(env.GOOGLE_CLIENT_ID) : null;

function assertDomain(email: string) {
  if (!isAllowedEmail(email)) {
    throw new AppError(
      `Only company email domains are allowed (${env.allowedDomains.join(', ')})`,
      403,
      'DOMAIN_NOT_ALLOWED'
    );
  }
}

/** Next free SM#### id (avoids collisions after deletes / manual IDs). */
async function nextEmployeeId(): Promise<string> {
  const users = await User.find({ employeeId: { $regex: /^SM\d+$/i } })
    .select('employeeId')
    .lean();
  let max = 0;
  for (const u of users) {
    const n = parseInt(String(u.employeeId).replace(/^SM/i, ''), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  for (let i = max + 1; i < max + 1000; i++) {
    const candidate = `SM${String(i).padStart(4, '0')}`;
    const taken = await User.findOne({ employeeId: candidate }).select('_id').lean();
    if (!taken) return candidate;
  }
  return `SM${Date.now().toString().slice(-6)}`;
}

function sanitizeUser(user: IUser) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
    employeeId: user.employeeId,
    phone: user.phone,
    designation: user.designation,
    joiningDate: user.joiningDate,
    status: user.status,
    avatar: user.avatar,
    mfaEnabled: user.mfa?.enabled ?? false,
    lastLogin: user.lastLogin,
    passwordChangedAt: user.passwordChangedAt,
  };
}

export async function updateProfile(
  userId: string,
  input: {
    name?: string;
    phone?: string;
    designation?: string;
    department?: string;
    avatar?: string | null;
  },
  req?: Request
) {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);

  if (input.name !== undefined) user.name = input.name.trim();
  if (input.phone !== undefined) user.phone = input.phone.trim() || undefined;
  if (input.designation !== undefined) user.designation = input.designation.trim() || undefined;
  if (input.department !== undefined && input.department.trim()) {
    user.department = input.department.trim();
  }
  if (input.avatar !== undefined) {
    user.avatar = input.avatar || undefined;
  }

  await user.save();
  await writeAudit({
    actor: userId,
    action: 'update_profile',
    entity: 'User',
    entityId: userId,
    after: {
      name: user.name,
      phone: user.phone,
      designation: user.designation,
      department: user.department,
      hasAvatar: !!user.avatar,
    },
    req,
  });
  return sanitizeUser(user);
}

async function issueTokens(user: IUser, mfaVerified: boolean, req?: Request) {
  const accessToken = signAccessToken({
    sub: user._id.toString(),
    email: user.email,
    role: user.role,
    mfaVerified,
    purpose: 'access',
  });
  const refreshToken = signRefreshToken(user._id.toString(), mfaVerified);
  const hashed = hashToken(refreshToken);
  user.refreshTokens = [
    ...(user.refreshTokens || []).slice(-9),
    {
      token: hashed,
      createdAt: new Date(),
      userAgent: req?.get('user-agent') || undefined,
      ip: req?.ip,
    },
  ];
  user.lastLogin = new Date();
  await user.save();
  return { accessToken, refreshToken, user: sanitizeUser(user) };
}

export async function login(email: string, password: string, req?: Request) {
  assertDomain(email);
  const settings = await getSettings();
  const user = await User.findOne({ email: email.toLowerCase() }).select(
    '+passwordHash +mfa.secret +mfa.backupCodes +passwordHistory'
  );
  if (!user) throw new UnauthorizedError('Invalid email or password');

  if (user.lockUntil && user.lockUntil > new Date()) {
    throw new AppError('Account locked due to failed attempts. Try again later.', 423, 'ACCOUNT_LOCKED');
  }

  if (user.status === 'disabled') throw new ForbiddenError('Account is disabled');
  if (user.status === 'invited') throw new ForbiddenError('Please accept your invite first');

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    user.failedAttempts += 1;
    if (user.failedAttempts >= settings.passwordPolicy.maxFailedAttempts) {
      user.lockUntil = new Date(Date.now() + settings.passwordPolicy.lockMinutes * 60 * 1000);
      user.status = 'locked';
      user.failedAttempts = 0;
    }
    await user.save();
    throw new UnauthorizedError('Invalid email or password');
  }

  user.failedAttempts = 0;
  user.lockUntil = undefined;
  if (user.status === 'locked') user.status = 'active';

  // Password expiry (configurable)
  if (
    settings.passwordPolicy.expiryDays > 0 &&
    user.passwordChangedAt &&
    differenceInDays(new Date(), user.passwordChangedAt) >= settings.passwordPolicy.expiryDays
  ) {
    throw new AppError(
      'Password expired. Reset your password to continue.',
      403,
      'PASSWORD_EXPIRED'
    );
  }

  const needsMfa =
    user.mfa.enabled ||
    MFA_REQUIRED_ROLES.includes(user.role) ||
    (user.role === 'employee' && !settings.mfaOptionalForEmployees);

  if (needsMfa && user.mfa.enabled) {
    const tempToken = signMfaTempToken({
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    });
    await user.save();
    return { requiresMfa: true as const, tempToken, user: sanitizeUser(user) };
  }

  // Role requires MFA but not configured yet — allow session and prompt setup in UI
  const tokens = await issueTokens(user, true, req);
  await writeAudit({ actor: user._id, action: 'login', entity: 'User', entityId: user._id.toString(), req });
  return {
    requiresMfa: false as const,
    requiresMfaSetup: needsMfa && !user.mfa.enabled,
    ...tokens,
  };
}

export async function verifyMfa(tempToken: string, code: string, req?: Request) {
  let payload;
  try {
    payload = verifyAccessToken(tempToken);
  } catch {
    throw new UnauthorizedError('Invalid MFA session');
  }

  const user = await User.findById(payload.sub).select('+mfa.secret +mfa.backupCodes +passwordHash');
  if (!user) throw new UnauthorizedError();

  let ok = false;
  if (user.mfa.secret && authenticator.verify({ token: code, secret: user.mfa.secret })) {
    ok = true;
  } else {
    const hashed = hashToken(code);
    const idx = user.mfa.backupCodes.findIndex((c) => c === hashed);
    if (idx >= 0) {
      user.mfa.backupCodes.splice(idx, 1);
      ok = true;
    }
  }
  if (!ok) throw new UnauthorizedError('Invalid MFA code');

  const tokens = await issueTokens(user, true, req);
  await writeAudit({ actor: user._id, action: 'mfa_verify', entity: 'User', entityId: user._id.toString(), req });
  return tokens;
}

export async function setupMfa(userId: string) {
  const user = await User.findById(userId).select('+mfa.secret +mfa.backupCodes');
  if (!user) throw new NotFoundError('User not found');

  const secret = authenticator.generateSecret();
  user.mfa.secret = secret;
  user.mfa.enabled = false;
  await user.save();

  const otpauth = authenticator.keyuri(user.email, env.MFA_ISSUER, secret);
  const qrCode = await QRCode.toDataURL(otpauth);
  return { secret, qrCode, otpauth };
}

export async function confirmMfaSetup(userId: string, code: string) {
  const user = await User.findById(userId).select('+mfa.secret +mfa.backupCodes');
  if (!user?.mfa.secret) throw new AppError('MFA setup not started', 400);

  if (!authenticator.verify({ token: code, secret: user.mfa.secret })) {
    throw new AppError('Invalid MFA code', 400, 'INVALID_MFA');
  }

  const backupCodes = Array.from({ length: 10 }, () => randomToken(4).slice(0, 8).toUpperCase());
  user.mfa.enabled = true;
  user.mfa.backupCodes = backupCodes.map((c) => hashToken(c));
  await user.save();

  await writeAudit({ actor: user._id, action: 'mfa_enable', entity: 'User', entityId: user._id.toString() });
  return { backupCodes };
}

export async function disableMfa(userId: string, password: string, code: string) {
  const user = await User.findById(userId).select('+passwordHash +mfa.secret +mfa.backupCodes');
  if (!user) throw new NotFoundError();
  if (!(await comparePassword(password, user.passwordHash))) {
    throw new UnauthorizedError('Invalid password');
  }
  if (!user.mfa.secret || !authenticator.verify({ token: code, secret: user.mfa.secret })) {
    throw new AppError('Invalid MFA code', 400, 'INVALID_MFA');
  }
  user.mfa = { enabled: false, secret: undefined, backupCodes: [] };
  await user.save();
  await writeAudit({ actor: user._id, action: 'mfa_disable', entity: 'User', entityId: user._id.toString() });
  return { ok: true };
}

export async function refresh(refreshToken: string, req?: Request) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new UnauthorizedError('Invalid refresh token');
  }
  const hashed = hashToken(refreshToken);
  const user = await User.findById(payload.sub).select('+mfa.secret');
  if (!user) throw new UnauthorizedError();
  const exists = user.refreshTokens.some((t) => t.token === hashed);
  if (!exists) throw new UnauthorizedError('Refresh token revoked');

  // Preserve MFA verification state from refresh token (do not escalate)
  let mfaVerified = payload.mfaVerified !== false;
  if (user.mfa?.enabled && payload.mfaVerified === false) {
    throw new UnauthorizedError('MFA required — please sign in again');
  }

  // Rotate
  user.refreshTokens = user.refreshTokens.filter((t) => t.token !== hashed);
  return issueTokens(user, mfaVerified, req);
}

export async function logout(userId: string, refreshToken?: string) {
  const user = await User.findById(userId);
  if (!user) return;
  if (refreshToken) {
    const hashed = hashToken(refreshToken);
    user.refreshTokens = user.refreshTokens.filter((t) => t.token !== hashed);
  } else {
    user.refreshTokens = [];
  }
  await user.save();
}

export async function logoutAll(userId: string) {
  await User.findByIdAndUpdate(userId, { refreshTokens: [] });
}

export async function inviteUser(opts: {
  email: string;
  role: Role;
  name?: string;
  department?: string;
  phone?: string;
  designation?: string;
  joiningDate?: Date;
  manager?: string;
  employeeId?: string;
  invitedBy: string;
  invitedByRole?: Role;
  req?: Request;
}) {
  assertDomain(opts.email);
  // Only CEO may invite another CEO; managers cannot escalate to ceo
  if (opts.role === 'ceo' && opts.invitedByRole !== 'ceo') {
    throw new ForbiddenError('Only the CEO can invite another CEO');
  }
  const existing = await User.findOne({ email: opts.email.toLowerCase() });
  if (existing) throw new AppError('User already exists', 409, 'USER_EXISTS');

  let employeeId = opts.employeeId?.trim();
  if (employeeId) {
    const idTaken = await User.findOne({ employeeId });
    if (idTaken) throw new AppError('Employee ID already in use', 409, 'EMPLOYEE_ID_EXISTS');
  } else {
    employeeId = await nextEmployeeId();
  }

  const token = randomToken();
  const passwordHash = await hashPassword(randomToken(16) + 'Aa1!');
  const user = await User.create({
    name: opts.name || opts.email.split('@')[0],
    email: opts.email.toLowerCase(),
    passwordHash,
    role: opts.role,
    department: opts.department || 'General',
    phone: opts.phone,
    designation: opts.designation,
    joiningDate: opts.joiningDate,
    manager: opts.manager || undefined,
    employeeId,
    status: 'invited',
    inviteToken: hashToken(token),
    inviteExpires: new Date(Date.now() + 48 * 60 * 60 * 1000),
  });

  const clientBase = env.clientOrigins[0] || env.CLIENT_URL.split(',')[0];
  const link = `${clientBase}/accept-invite?token=${token}`;
  await sendEmail({
    to: user.email,
    subject: 'You are invited to STAR MEDIA CRM',
    html: `<p>You have been invited as <b>${opts.role}</b>.</p><p><a href="${link}">Accept invite</a> (expires in 48 hours)</p>`,
  });

  await writeAudit({
    actor: opts.invitedBy,
    action: 'invite',
    entity: 'User',
    entityId: user._id.toString(),
    after: { email: user.email, role: user.role },
    req: opts.req,
  });

  const { notifyCeos } = await import('../../utils/notify.js');
  await notifyCeos({
    type: 'user_invite',
    title: 'New user invited',
    message: `${user.email} was invited as ${user.role}`,
    link: '/users',
    email: false,
  });

  return { user: sanitizeUser(user), inviteLink: link };
}

export async function acceptInvite(token: string, name: string, password: string) {
  const settings = await getSettings();
  validatePassword(password, settings.passwordPolicy);
  const hashed = hashToken(token);
  const user = await User.findOne({ inviteToken: hashed }).select('+passwordHash +passwordHistory +inviteToken');
  if (!user || !user.inviteExpires || user.inviteExpires < new Date()) {
    throw new AppError('Invite is invalid or expired', 400, 'INVALID_INVITE');
  }

  const passwordHash = await hashPassword(password);
  user.name = name;
  user.passwordHash = passwordHash;
  user.passwordHistory = [passwordHash];
  user.passwordChangedAt = new Date();
  user.status = 'active';
  user.inviteToken = undefined;
  user.inviteExpires = undefined;
  await user.save();
  return sanitizeUser(user);
}

export async function forgotPassword(email: string) {
  assertDomain(email);
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) return { ok: true }; // don't reveal
  const token = randomToken();
  user.resetToken = hashToken(token);
  user.resetExpires = new Date(Date.now() + 60 * 60 * 1000);
  await user.save();
  const clientBase = env.clientOrigins[0] || env.CLIENT_URL.split(',')[0];
  const link = `${clientBase}/reset-password?token=${token}`;
  await sendEmail({
    to: user.email,
    subject: 'Reset your STAR MEDIA CRM password',
    html: `<p><a href="${link}">Reset password</a> (expires in 1 hour)</p>`,
  });
  return { ok: true, resetLink: env.NODE_ENV === 'development' ? link : undefined };
}

export async function resetPassword(token: string, password: string) {
  const settings = await getSettings();
  validatePassword(password, settings.passwordPolicy);
  const user = await User.findOne({ resetToken: hashToken(token) }).select(
    '+passwordHash +passwordHistory +resetToken'
  );
  if (!user || !user.resetExpires || user.resetExpires < new Date()) {
    throw new AppError('Reset token invalid or expired', 400, 'INVALID_RESET');
  }
  if (await isPasswordReused(password, user.passwordHistory, settings.passwordPolicy.historyCount)) {
    throw new AppError('Cannot reuse one of your last passwords', 400, 'PASSWORD_REUSED');
  }
  const passwordHash = await hashPassword(password);
  user.passwordHash = passwordHash;
  user.passwordHistory = [...user.passwordHistory, passwordHash].slice(-settings.passwordPolicy.historyCount);
  user.passwordChangedAt = new Date();
  user.resetToken = undefined;
  user.resetExpires = undefined;
  user.failedAttempts = 0;
  user.lockUntil = undefined;
  if (user.status === 'locked') user.status = 'active';
  await user.save();
  return { ok: true };
}

export async function googleLogin(idToken: string, req?: Request) {
  if (!googleClient || !env.GOOGLE_CLIENT_ID) {
    throw new AppError('Google OAuth is not configured', 501, 'OAUTH_NOT_CONFIGURED');
  }
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload?.email) throw new UnauthorizedError('Invalid Google token');

  const email = payload.email.toLowerCase();
  assertDomain(email);
  const hd = (payload.hd || email.split('@')[1] || '').toLowerCase();
  if (!env.allowedDomains.includes(hd)) {
    throw new ForbiddenError('Google account must be on an allowed Workspace domain');
  }

  let user = await User.findOne({ email }).select('+passwordHash +mfa.secret +mfa.backupCodes');
  if (!user) {
    throw new AppError(
      'No account found. Ask an admin to invite you first.',
      403,
      'NOT_INVITED'
    );
  }
  if (!user.googleId) {
    user.googleId = payload.sub;
    await user.save();
  }

  if (user.mfa.enabled) {
    const tempToken = signMfaTempToken({
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    });
    return { requiresMfa: true as const, tempToken, user: sanitizeUser(user) };
  }

  const tokens = await issueTokens(user, true, req);
  await writeAudit({ actor: user._id, action: 'login_google', entity: 'User', entityId: user._id.toString(), req });
  return { requiresMfa: false as const, ...tokens };
}

export async function getSessions(userId: string) {
  const user = await User.findById(userId);
  if (!user) throw new NotFoundError();
  return user.refreshTokens.map((t, i) => ({
    id: i,
    createdAt: t.createdAt,
    userAgent: t.userAgent,
    ip: t.ip,
  }));
}

export async function me(userId: string) {
  const user = await User.findById(userId);
  if (!user) throw new NotFoundError();
  return sanitizeUser(user);
}
