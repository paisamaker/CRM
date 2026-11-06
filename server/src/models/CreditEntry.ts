import mongoose, { Schema, type Document, type Types } from 'mongoose';

export const CREDIT_ENTRY_TYPES = [
  'disbursement',
  'repayment',
  'interest',
  'fee',
  'adjustment',
] as const;
export type CreditEntryType = (typeof CREDIT_ENTRY_TYPES)[number];

export interface ICreditEntry extends Document {
  facility: Types.ObjectId;
  entryNumber: number;
  type: CreditEntryType;
  amount: number;
  /** Only for adjustment: whether outstanding goes up or down */
  adjustmentDirection?: 'increase' | 'decrease';
  date: Date;
  paymentMethod?: string;
  note?: string;
  reference?: string;
  balanceAfter: number;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const creditEntrySchema = new Schema<ICreditEntry>(
  {
    facility: {
      type: Schema.Types.ObjectId,
      ref: 'CreditFacility',
      required: true,
      index: true,
    },
    entryNumber: { type: Number, required: true },
    type: { type: String, enum: CREDIT_ENTRY_TYPES, required: true },
    amount: { type: Number, required: true, min: 0.01 },
    adjustmentDirection: {
      type: String,
      enum: ['increase', 'decrease'],
    },
    date: { type: Date, required: true },
    paymentMethod: { type: String, trim: true },
    note: { type: String, trim: true },
    reference: { type: String, trim: true },
    balanceAfter: { type: Number, required: true, min: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

creditEntrySchema.index({ facility: 1, entryNumber: 1 }, { unique: true });
creditEntrySchema.index({ facility: 1, date: -1 });

export const CreditEntry = mongoose.model<ICreditEntry>('CreditEntry', creditEntrySchema);

export async function nextCreditEntryNumber(facilityId: string): Promise<number> {
  const last = await CreditEntry.findOne({ facility: facilityId })
    .sort({ entryNumber: -1 })
    .select('entryNumber')
    .lean();
  return (last?.entryNumber || 0) + 1;
}

/** Signed delta applied to outstanding balance (never touches main Transaction ledger). */
export function creditBalanceDelta(
  type: CreditEntryType,
  amount: number,
  adjustmentDirection?: 'increase' | 'decrease'
): number {
  const amt = Math.abs(Number(amount) || 0);
  if (type === 'disbursement' || type === 'interest' || type === 'fee') return amt;
  if (type === 'repayment') return -amt;
  if (type === 'adjustment') {
    if (adjustmentDirection === 'decrease') return -amt;
    return amt;
  }
  return 0;
}
