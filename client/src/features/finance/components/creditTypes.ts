export type CreditKind = 'credit' | 'loan';
export type CreditDirection = 'borrowed' | 'lent';
export type CreditFacilityStatus = 'active' | 'closed' | 'defaulted';
export type CreditEntryType = 'disbursement' | 'repayment' | 'interest' | 'fee' | 'adjustment';

export interface CreditFacilityItem {
  _id: string;
  facilityNumber: number;
  title: string;
  kind: CreditKind;
  direction: CreditDirection;
  hasInterest: boolean;
  partyName: string;
  principalAmount: number;
  outstandingBalance: number;
  interestRate?: number;
  tenureMonths?: number;
  emiAmount?: number;
  processingFee?: number;
  loanPurpose?: string;
  collateral?: string;
  lenderType?: string;
  startDate: string;
  dueDate?: string;
  status: CreditFacilityStatus;
  paymentMethod?: string;
  reference?: string;
  notes?: string;
  currency?: string;
  createdBy?: { _id: string; name?: string; email?: string } | string;
  closedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreditEntryItem {
  _id: string;
  facility: string;
  entryNumber: number;
  type: CreditEntryType;
  amount: number;
  adjustmentDirection?: 'increase' | 'decrease';
  date: string;
  paymentMethod?: string;
  note?: string;
  reference?: string;
  balanceAfter: number;
  createdBy?: { _id: string; name?: string; email?: string } | string;
  createdAt?: string;
}

export interface CreditSummary {
  totalFacilities: number;
  activeFacilities: number;
  creditOutstanding: number;
  creditLentOutstanding: number;
  creditBorrowedOutstanding: number;
  loanOutstanding: number;
  borrowedOutstanding: number;
  lentOutstanding: number;
  borrowedPrincipal: number;
  lentPrincipal: number;
  excludedFromMainFinance: boolean;
}

export const ENTRY_TYPE_LABELS: Record<CreditEntryType, string> = {
  disbursement: 'Disbursement',
  repayment: 'Repayment',
  interest: 'Interest',
  fee: 'Fee',
  adjustment: 'Adjustment',
};
