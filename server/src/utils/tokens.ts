import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env.js';
import type { Role } from '../config/permissions.js';

export interface AccessPayload {
  sub: string;
  email: string;
  role: Role;
  mfaVerified: boolean;
  /** 'mfa' = short-lived pre-MFA token; must not access general APIs */
  purpose?: 'access' | 'mfa';
}

export interface RefreshPayload {
  sub: string;
  type: 'refresh';
  mfaVerified: boolean;
}

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(
    { purpose: 'access', ...payload },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES as jwt.SignOptions['expiresIn'] }
  );
}

export function signMfaTempToken(payload: Omit<AccessPayload, 'mfaVerified' | 'purpose'>): string {
  return jwt.sign(
    { ...payload, mfaVerified: false, purpose: 'mfa' },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '10m' }
  );
}

export function signRefreshToken(userId: string, mfaVerified = true): string {
  return jwt.sign(
    { sub: userId, type: 'refresh', mfaVerified } satisfies RefreshPayload,
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES as jwt.SignOptions['expiresIn'] }
  );
}

export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessPayload;
}

export function verifyRefreshToken(token: string): RefreshPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshPayload;
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
