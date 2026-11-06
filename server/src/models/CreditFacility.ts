import mongoose, { Schema, type Document, type Types } from 'mongoose';

export const CREDIT_KINDS = ['credit', 'loan'] as const;
export type CreditKind = (typeof CREDIT_KINDS)[number];

export const CREDIT_DIRECTIONS = ['borrowed', 'lent'] as const;
export type CreditDirection = (typeof CREDIT_DIRECTIONS)[number];

export const CREDIT_FACILITY_STATUSES = ['active', 'closed', 'defaulted'] as const;
export type CreditFacilityStatus = (typeof CREDIT_FACILITY_STATUSES)[number];

export interface ICreditFacility extends Document {
  facilityNumber: number;
  title: string;
  /** credit = informal/credit line; loan = formal loan with full terms */
  kind: CreditKind;
  /** borrowed = we owe them; lent = they owe us */
  direction: CreditDirection;
  /** Whether this facility carries interest */
  hasInterest: boolean;
  partyName: string;
  principalAmount: number;
  outstandingBalance: number;
  /** Annual interest rate %, when hasInterest */
  interestRate?: number;
  /** Loan-only terms */
  tenureMonths?: number;
  emiAmount?: number;
  processingFee?: number;
  loanPurpose?: string;
  collateral?: string;
  lenderType?: string;
  startDate: Date;
  dueDate?: Date;
  status: CreditFacilityStatus;
  paymentMethod?: string;
  reference?: string;
  notes?: string;
  currency: string;
  createdBy: Types.ObjectId;
  closedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const creditFacilitySchema = new Schema<ICreditFacility>(
  {
    facilityNumber: { type: Number, required: true, unique: true, index: true },
    title: { type: String, required: true, trim: true },
    kind: {
      type: String,
      enum: CREDIT_KINDS,
      required: true,
      default: 'credit',
      index: true,
    },
    direction: { type: String, enum: CREDIT_DIRECTIONS, required: true, index: true },
    hasInterest: { type: Boolean, default: false },
    partyName: { type: String, required: true, trim: true },
    principalAmount: { type: Number, required: true, min: 0 },
    outstandingBalance: { type: Number, required: true, min: 0, default: 0 },
    interestRate: { type: Number, min: 0 },
    tenureMonths: { type: Number, min: 0 },
    emiAmount: { type: Number, min: 0 },
    processingFee: { type: Number, min: 0 },
    loanPurpose: { type: String, trim: true },
    collateral: { type: String, trim: true },
    lenderType: { type: String, trim: true },
    startDate: { type: Date, required: true },
    dueDate: { type: Date },
    status: {
      type: String,
      enum: CREDIT_FACILITY_STATUSES,
      default: 'active',
      index: true,
    },
    paymentMethod: { type: String, trim: true },
    reference: { type: String, trim: true },
    notes: { type: String, trim: true },
    currency: { type: String, default: 'INR' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    closedAt: { type: Date },
  },
  { timestamps: true }
);

creditFacilitySchema.index({ status: 1, kind: 1, direction: 1, createdAt: -1 });
creditFacilitySchema.index({ partyName: 1 });

export const CreditFacility = mongoose.model<ICreditFacility>(
  'CreditFacility',
  creditFacilitySchema
);

export async function nextCreditFacilityNumber(): Promise<number> {
  const last = await CreditFacility.findOne()
    .sort({ facilityNumber: -1 })
    .select('facilityNumber')
    .lean();
  return (last?.facilityNumber || 1000) + 1;
}
