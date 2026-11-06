import { HandCoins } from 'lucide-react';
import { CreditTab } from './components/CreditTab';

export function CreditPage() {
  return (
    <div className="space-y-5 pb-12">
      <header className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)]">
        <div className="bg-[linear-gradient(120deg,var(--brand-soft)_0%,transparent_45%,var(--orange-soft)_100%)] px-5 py-5 sm:px-6">
          <div className="flex items-start gap-3">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-[var(--brand)]">
              <HandCoins className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] font-medium text-[var(--fg-secondary)]">Finance</div>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--fg)]">
                Credit &amp; Loans
              </h1>
              <p className="mt-1 max-w-xl text-sm text-[var(--fg-secondary)]">
                Separate Credit (lent / borrow, with or without interest) and Loan (full terms) —
                never counted in operating income, expenses, or P&amp;L.
              </p>
            </div>
          </div>
        </div>
      </header>
      <CreditTab />
    </div>
  );
}
