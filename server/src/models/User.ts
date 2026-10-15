import mongoose, { Schema, type Document, type Types } from 'mongoose';
import { ROLES, type Role } from '../config/permissions.js';

export interface IUser extends Document {
  _id: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  department: string;
  employeeId?: string;
  phone?: string;
  designation?: string;
  joiningDate?: Date;
  manager?: Types.ObjectId;
  /** Monthly compensation configured by admin (CEO/finance) */
  salary?: {
    base: number;
    stipend: number;
    incentive: number;
    currency: string;
    payCycle: 'monthly' | 'biweekly' | 'weekly';
    effectiveFrom?: Date;
    bankAccountLast4?: string;
    notes?: string;
  };
  status: 'active' | 'invited' | 'disabled' | 'locked';
  mfa: {
    enabled: boolean;
    secret?: string;
    backupCodes: string[];
  };
  passwordHistory: string[];
  passwordChangedAt?: Date;
  mustChangePassword?: boolean;
  lastLogin?: Date;
  failedAttempts: number;
  lockUntil?: Date;
  avatar?: string;
  refreshTokens: { token: string; createdAt: Date; userAgent?: string; ip?: string }[];
  inviteToken?: string;
  inviteExpires?: Date;
  resetToken?: string;
  resetExpires?: Date;
  googleId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true, default: 'employee' },
    department: { type: String, default: 'General' },
    employeeId: { type: String, unique: true, sparse: true, index: true },
    phone: String,
    designation: String,
    joiningDate: Date,
    manager: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    salary: {
      base: { type: Number, default: 0, min: 0 },
      stipend: { type: Number, default: 0, min: 0 },
      incentive: { type: Number, default: 0, min: 0 },
      currency: { type: String, default: 'INR' },
      payCycle: { type: String, enum: ['monthly', 'biweekly', 'weekly'], default: 'monthly' },
      effectiveFrom: Date,
      bankAccountLast4: String,
      notes: String,
    },
    status: {
      type: String,
      enum: ['active', 'invited', 'disabled', 'locked'],
      default: 'active',
    },
    mfa: {
      enabled: { type: Boolean, default: false },
      secret: { type: String, select: false },
      backupCodes: { type: [String], default: [], select: false },
    },
    passwordHistory: { type: [String], default: [], select: false },
    passwordChangedAt: Date,
    mustChangePassword: { type: Boolean, default: false },
    lastLogin: Date,
    failedAttempts: { type: Number, default: 0 },
    lockUntil: Date,
    avatar: String,
    refreshTokens: [
      {
        token: String,
        createdAt: { type: Date, default: Date.now },
        userAgent: String,
        ip: String,
      },
    ],
    inviteToken: { type: String, select: false },
    inviteExpires: Date,
    resetToken: { type: String, select: false },
    resetExpires: Date,
    googleId: { type: String, sparse: true },
  },
  { timestamps: true }
);

userSchema.index({ role: 1, status: 1 });
userSchema.index({ department: 1 });

export const User = mongoose.model<IUser>('User', userSchema);
