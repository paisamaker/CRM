import mongoose, { Schema, type Document } from 'mongoose';
import { memoryCache } from '../utils/cache.js';

export interface ISettings extends Document {
  allowedDomains: string[];
  approvalRules: {
    autoApproveUnder: number;
    alwaysCeoAbove: number;
    requireReasonOnReject: boolean;
  };
  alertThresholds: {
    overdueInvoiceDays: number[];
    clientFollowUpDays: number;
    projectDeadlineWarningDays: number;
    taskEscalateManagerDays: number;
    taskEscalateCeoDays: number;
    performanceWindowDays: number;
    contractRenewalDays: number[];
    payrollDueDays: number;
    approvalPendingHours: number;
    approvalCriticalAmount: number;
  };
  passwordPolicy: {
    minLength: number;
    requireUpper: boolean;
    requireLower: boolean;
    requireNumber: boolean;
    requireSymbol: boolean;
    expiryDays: number;
    historyCount: number;
    maxFailedAttempts: number;
    lockMinutes: number;
  };
  company: {
    name: string;
    currency: string;
    timezone: string;
    logo?: string;
    address?: string;
  };
  cloudinary?: {
    cloudName?: string;
    apiKey?: string;
    apiSecret?: string;
  };
  mfaOptionalForEmployees: boolean;
  invoicePrefix: string;
  invoiceCounter: number;
}

const settingsSchema = new Schema<ISettings>(
  {
    allowedDomains: { type: [String], default: ['starmediainfluencer.com'] },
    approvalRules: {
      autoApproveUnder: { type: Number, default: 5000 },
      alwaysCeoAbove: { type: Number, default: 5000 },
      requireReasonOnReject: { type: Boolean, default: true },
    },
    alertThresholds: {
      overdueInvoiceDays: { type: [Number], default: [7, 15, 30] },
      clientFollowUpDays: { type: Number, default: 14 },
      projectDeadlineWarningDays: { type: Number, default: 3 },
      taskEscalateManagerDays: { type: Number, default: 1 },
      taskEscalateCeoDays: { type: Number, default: 3 },
      performanceWindowDays: { type: Number, default: 14 },
      contractRenewalDays: { type: [Number], default: [30, 15, 7] },
      payrollDueDays: { type: Number, default: 5 },
      approvalPendingHours: { type: Number, default: 24 },
      approvalCriticalAmount: { type: Number, default: 100000 },
    },
    passwordPolicy: {
      minLength: { type: Number, default: 6 },
      requireUpper: { type: Boolean, default: true },
      requireLower: { type: Boolean, default: false },
      requireNumber: { type: Boolean, default: false },
      requireSymbol: { type: Boolean, default: false },
      expiryDays: { type: Number, default: 0 },
      historyCount: { type: Number, default: 5 },
      maxFailedAttempts: { type: Number, default: 5 },
      lockMinutes: { type: Number, default: 15 },
    },
    company: {
      name: { type: String, default: 'STAR MEDIA' },
      currency: { type: String, default: 'INR' },
      timezone: { type: String, default: 'Asia/Kolkata' },
      logo: String,
      address: String,
    },
    cloudinary: {
      cloudName: String,
      apiKey: String,
      apiSecret: String,
    },
    mfaOptionalForEmployees: { type: Boolean, default: true },
    invoicePrefix: { type: String, default: 'INV' },
    invoiceCounter: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Settings = mongoose.model<ISettings>('Settings', settingsSchema);

const SIMPLE_PASSWORD_POLICY = {
  minLength: 6,
  requireUpper: true,
  requireLower: false,
  requireNumber: false,
  requireSymbol: false,
};

export async function getSettings(): Promise<ISettings> {
  const cached = memoryCache.get<ISettings>('system_settings');
  if (cached) return cached;

  let doc = await Settings.findOne();
  if (!doc) {
    doc = await Settings.create({});
  }

  // Keep company DB policy aligned with the simple login rules
  const p = doc.passwordPolicy;
  if (
    !p ||
    p.minLength !== SIMPLE_PASSWORD_POLICY.minLength ||
    p.requireUpper !== SIMPLE_PASSWORD_POLICY.requireUpper ||
    p.requireLower !== SIMPLE_PASSWORD_POLICY.requireLower ||
    p.requireNumber !== SIMPLE_PASSWORD_POLICY.requireNumber ||
    p.requireSymbol !== SIMPLE_PASSWORD_POLICY.requireSymbol
  ) {
    doc.passwordPolicy = {
      ...p,
      ...SIMPLE_PASSWORD_POLICY,
      expiryDays: p?.expiryDays ?? 0,
      historyCount: p?.historyCount ?? 5,
      maxFailedAttempts: p?.maxFailedAttempts ?? 5,
      lockMinutes: p?.lockMinutes ?? 15,
    };
    await doc.save();
  }

  memoryCache.set('system_settings', doc, 60);
  return doc;
}
