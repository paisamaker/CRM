import bcrypt from 'bcryptjs';
import { AppError } from './AppError.js';

export interface PasswordPolicy {
  minLength: number;
  requireUpper: boolean;
  requireLower: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
}

/** Simple company policy: 6+ characters with at least one capital letter. */
const DEFAULT_POLICY: PasswordPolicy = {
  minLength: 6,
  requireUpper: true,
  requireLower: false,
  requireNumber: false,
  requireSymbol: false,
};

export function validatePassword(password: string, policy: PasswordPolicy = DEFAULT_POLICY): void {
  const minLength = policy.minLength ?? DEFAULT_POLICY.minLength;
  if (password.length < minLength) {
    throw new AppError(`Password must be at least ${minLength} characters`, 400, 'WEAK_PASSWORD');
  }
  if (policy.requireUpper !== false && !/[A-Z]/.test(password)) {
    throw new AppError('Password must include at least one capital letter', 400, 'WEAK_PASSWORD');
  }
  if (policy.requireLower && !/[a-z]/.test(password)) {
    throw new AppError('Password must include a lowercase letter', 400, 'WEAK_PASSWORD');
  }
  if (policy.requireNumber && !/[0-9]/.test(password)) {
    throw new AppError('Password must include a number', 400, 'WEAK_PASSWORD');
  }
  if (policy.requireSymbol && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    throw new AppError('Password must include a symbol', 400, 'WEAK_PASSWORD');
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function isPasswordReused(
  password: string,
  history: string[] = [],
  count = 5
): Promise<boolean> {
  const recent = history.slice(-count);
  for (const hash of recent) {
    if (await comparePassword(password, hash)) return true;
  }
  return false;
}
