import { BankAccount } from '../models/BankAccount.js';
import { roundMoney, toCents } from './money.js';

export type LedgerDirection = 'credit' | 'debit';

/**
 * Atomically adjust a bank account balance using $inc (avoids lost updates
 * under concurrent payments). Credits increase balance; debits decrease it.
 */
export async function adjustBankBalance(opts: {
  bankAccountId?: string | null;
  amount: number;
  direction: LedgerDirection;
  preferPrimary?: boolean;
}): Promise<{ accountId: string; balance: number } | null> {
  const amount = roundMoney(opts.amount);
  if (!amount || amount <= 0) return null;

  const deltaCents = opts.direction === 'credit' ? toCents(amount) : -toCents(amount);
  const delta = deltaCents / 100;

  let accountId = opts.bankAccountId?.trim() || '';
  if (!accountId && opts.preferPrimary !== false) {
    const primary = await BankAccount.findOne({ isPrimary: true, status: 'active' }).select('_id');
    if (!primary) return null;
    accountId = String(primary._id);
  }
  if (!accountId) return null;

  const updated = await BankAccount.findOneAndUpdate(
    { _id: accountId, status: 'active' },
    { $inc: { balance: delta } },
    { new: true }
  ).select('_id balance');

  if (!updated) return null;
  return { accountId: String(updated._id), balance: roundMoney(updated.balance) };
}

export function directionForTxType(type: string): LedgerDirection {
  return type === 'revenue' ? 'credit' : 'debit';
}
