import type { Request, Response } from 'express';
import { env } from '../../config/env.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as authService from './service.js';
import {
  changePasswordSchema,
  forgotSchema,
  googleSchema,
  inviteAcceptSchema,
  inviteSchema,
  loginSchema,
  mfaDisableSchema,
  mfaVerifySchema,
  resetSchema,
  updateProfileSchema,
} from './validation.js';
import { publicUploadPath, upload } from '../../middleware/upload.js';
import { uploadImageToCloudinary } from '../../utils/cloudinary.js';
import { DocumentFile } from '../../models/Document.js';
import { getSettings } from '../../models/Settings.js';
import { comparePassword, hashPassword, isPasswordReused, validatePassword } from '../../utils/password.js';
import { User } from '../../models/User.js';
import { AppError, UnauthorizedError } from '../../utils/AppError.js';
import { writeAudit } from '../../utils/audit.js';
import { PERMISSIONS } from '../../config/permissions.js';

const REFRESH_COOKIE = 'sm_refresh';

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE || env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/api/v1/auth',
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
}

export const login = asyncHandler(async (req: Request, res: Response) => {
  const body = loginSchema.parse(req.body);
  const result = await authService.login(body.email, body.password, req);
  if ('accessToken' in result && result.accessToken) {
    setRefreshCookie(res, result.refreshToken);
  }
  res.json({ success: true, data: result });
});

export const verifyMfa = asyncHandler(async (req: Request, res: Response) => {
  const body = mfaVerifySchema.parse(req.body);
  const result = await authService.verifyMfa(body.tempToken, body.code, req);
  setRefreshCookie(res, result.refreshToken);
  res.json({ success: true, data: result });
});

export const setupMfa = asyncHandler(async (req: Request, res: Response) => {
  const data = await authService.setupMfa(req.user!.id);
  res.json({ success: true, data });
});

export const confirmMfa = asyncHandler(async (req: Request, res: Response) => {
  const code = String(req.body.code || '');
  const data = await authService.confirmMfaSetup(req.user!.id, code);
  res.json({ success: true, data });
});

export const disableMfa = asyncHandler(async (req: Request, res: Response) => {
  const body = mfaDisableSchema.parse(req.body);
  const data = await authService.disableMfa(req.user!.id, body.password, body.code);
  res.json({ success: true, data });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE] || req.body.refreshToken;
  if (!token) throw new UnauthorizedError('Missing refresh token');
  const result = await authService.refresh(token, req);
  setRefreshCookie(res, result.refreshToken);
  res.json({ success: true, data: result });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (req.user) await authService.logout(req.user.id, token);
  clearRefreshCookie(res);
  res.json({ success: true, data: { ok: true } });
});

export const logoutAll = asyncHandler(async (req: Request, res: Response) => {
  await authService.logoutAll(req.user!.id);
  clearRefreshCookie(res);
  res.json({ success: true, data: { ok: true } });
});

export const forgot = asyncHandler(async (req: Request, res: Response) => {
  const body = forgotSchema.parse(req.body);
  const data = await authService.forgotPassword(body.email);
  res.json({ success: true, data });
});

export const reset = asyncHandler(async (req: Request, res: Response) => {
  const body = resetSchema.parse(req.body);
  const data = await authService.resetPassword(body.token, body.password);
  res.json({ success: true, data });
});

export const acceptInvite = asyncHandler(async (req: Request, res: Response) => {
  const body = inviteAcceptSchema.parse(req.body);
  const data = await authService.acceptInvite(body.token, body.name, body.password);
  res.json({ success: true, data });
});

export const invite = asyncHandler(async (req: Request, res: Response) => {
  const body = inviteSchema.parse(req.body);
  const data = await authService.inviteUser({
    ...body,
    invitedBy: req.user!.id,
    invitedByRole: req.user!.role,
    req,
  });
  res.status(201).json({ success: true, data });
});

export const google = asyncHandler(async (req: Request, res: Response) => {
  const body = googleSchema.parse(req.body);
  const result = await authService.googleLogin(body.idToken, req);
  if ('accessToken' in result && result.accessToken) {
    setRefreshCookie(res, result.refreshToken);
  }
  res.json({ success: true, data: result });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.me(req.user!.id);
  res.json({
    success: true,
    data: {
      user,
      permissions: PERMISSIONS[user.role],
    },
  });
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const body = updateProfileSchema.parse(req.body);
  const user = await authService.updateProfile(req.user!.id, body, req);
  res.json({ success: true, data: { user } });
});

export const uploadAvatar = [
  upload.single('avatar'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw new AppError('No image uploaded', 400);
    if (!req.file.mimetype.startsWith('image/')) {
      throw new AppError('Avatar must be an image (JPEG, PNG, or WebP)', 400, 'INVALID_FILE_TYPE');
    }

    let url = publicUploadPath(req.file.filename);
    const cloudRes = await uploadImageToCloudinary(req.file.path, 'starmedia/avatars');
    if (cloudRes?.secure_url) {
      url = cloudRes.secure_url;
    }

    await DocumentFile.create({
      name: req.file.originalname,
      url,
      mime: req.file.mimetype,
      size: req.file.size,
      folder: 'avatars',
      visibility: 'company',
      linkedModel: 'User',
      linkedId: req.user!.id,
      uploadedBy: req.user!.id,
    });
    const user = await authService.updateProfile(req.user!.id, { avatar: url }, req);
    res.json({ success: true, data: { user, url } });
  }),
];

export const deleteAvatar = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.updateProfile(req.user!.id, { avatar: '' }, req);
  res.json({ success: true, data: { user } });
});

export const sessions = asyncHandler(async (req: Request, res: Response) => {
  const data = await authService.getSessions(req.user!.id);
  res.json({ success: true, data });
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const body = changePasswordSchema.parse(req.body);
  const settings = await getSettings();
  validatePassword(body.newPassword, settings.passwordPolicy);
  const user = await User.findById(req.user!.id).select('+passwordHash +passwordHistory');
  if (!user) throw new AppError('User not found', 404);
  if (!(await comparePassword(body.currentPassword, user.passwordHash))) {
    throw new UnauthorizedError('Current password is incorrect');
  }
  if (await isPasswordReused(body.newPassword, user.passwordHistory, settings.passwordPolicy.historyCount)) {
    throw new AppError('Cannot reuse one of your last passwords', 400, 'PASSWORD_REUSED');
  }
  const passwordHash = await hashPassword(body.newPassword);
  user.passwordHash = passwordHash;
  user.passwordHistory = [...user.passwordHistory, passwordHash].slice(-settings.passwordPolicy.historyCount);
  user.passwordChangedAt = new Date();
  await user.save();
  await writeAudit({ actor: user._id, action: 'password_change', entity: 'User', entityId: user._id.toString(), req });
  res.json({ success: true, data: { ok: true } });
});
