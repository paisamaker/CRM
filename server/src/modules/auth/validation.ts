import { z } from 'zod';
import { ROLES } from '../../config/permissions.js';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const mfaVerifySchema = z.object({
  tempToken: z.string().min(1),
  code: z.string().min(6).max(12),
});

export const inviteAcceptSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(2).max(100),
  password: z.string().min(6),
});

export const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(ROLES),
  name: z.string().min(2).optional(),
  department: z.string().optional(),
  phone: z.string().max(40).optional(),
  designation: z.string().max(120).optional(),
  joiningDate: z.coerce.date().optional(),
  manager: z.string().optional(),
  employeeId: z.string().max(40).optional(),
});

export const forgotSchema = z.object({
  email: z.string().email(),
});

export const resetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

export const googleSchema = z.object({
  idToken: z.string().min(1),
});

export const mfaDisableSchema = z.object({
  password: z.string().min(1),
  code: z.string().min(6),
});

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  phone: z.string().max(40).optional().or(z.literal('')),
  designation: z.string().max(120).optional().or(z.literal('')),
  department: z.string().max(80).optional(),
  avatar: z.string().max(2_000_000).optional().nullable(),
});
