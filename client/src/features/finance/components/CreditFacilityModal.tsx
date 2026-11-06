import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronLeft, Landmark } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Label, Select, Textarea } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import type { CreditDirection, CreditFacilityItem, CreditKind } from './creditTypes';

interface Props {
  open: boolean;
  onClose: () => void;
  editing?: CreditFacilityItem | null;
  /** Prefill kind when opening create from Credit / Loan shortcut */
  defaultKind?: CreditKind;
  /** Prefill direction; for credit shortcuts skips to direction/interest flow start */
  defaultDirection?: CreditDirection;
}

type Step = 'kind' | 'direction' | 'interest' | 'details';

const emptyForm = {
  title: '',
  kind: 'credit' as CreditKind,
  direction: 'lent' as CreditDirection,
  hasInterest: false,
  partyName: '',
  principalAmount: '',
  interestRate: '',
  tenureMonths: '',
  emiAmount: '',
  processingFee: '',
  loanPurpose: '',
  collateral: '',
  lenderType: 'Bank',
  startDate: new Date().toISOString().slice(0, 10),
  dueDate: '',
  paymentMethod: 'Bank Transfer',
  reference: '',
  notes: '',
  recordInitialDisbursement: true,
};

function ChoiceCard({
  selected,
  title,
  hint,
  onClick,
}: {
  selected: boolean;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl border px-3 py-3 text-left transition',
        selected
          ? 'border-sky-300 bg-sky-50 text-sky-900 shadow-sm'
          : 'border-[var(--border)] bg-[var(--bg)] text-[var(--fg-secondary)] hover:bg-[var(--bg-subtle)]'
      )}
    >
      <div className="text-sm font-semibold text-[var(--fg)]">{title}</div>
      <div className="mt-0.5 text-[11px] opacity-80">{hint}</div>
    </button>
  );
}

export function CreditFacilityModal({
  open,
  onClose,
  editing,
  defaultKind = 'credit',
  defaultDirection,
}: Props) {
  const qc = useQueryClient();
  const isEdit = !!editing?._id;
  const [step, setStep] = useState<Step>('kind');
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setStep('details');
      setForm({
        ...emptyForm,
        title: editing.title || '',
        kind: editing.kind || 'credit',
        direction: editing.direction,
        hasInterest: !!editing.hasInterest || editing.interestRate != null,
        partyName: editing.partyName || '',
        principalAmount: String(editing.principalAmount ?? ''),
        interestRate: editing.interestRate != null ? String(editing.interestRate) : '',
        tenureMonths: editing.tenureMonths != null ? String(editing.tenureMonths) : '',
        emiAmount: editing.emiAmount != null ? String(editing.emiAmount) : '',
        processingFee: editing.processingFee != null ? String(editing.processingFee) : '',
        loanPurpose: editing.loanPurpose || '',
        collateral: editing.collateral || '',
        lenderType: editing.lenderType || 'Bank',
        startDate: editing.startDate
          ? String(editing.startDate).slice(0, 10)
          : new Date().toISOString().slice(0, 10),
        dueDate: editing.dueDate ? String(editing.dueDate).slice(0, 10) : '',
        paymentMethod: editing.paymentMethod || 'Bank Transfer',
        reference: editing.reference || '',
        notes: editing.notes || '',
        recordInitialDisbursement: true,
      });
    } else {
      const direction =
        defaultDirection || (defaultKind === 'loan' ? 'borrowed' : 'lent');
      // Shortcut from Lent / Borrow cards: skip kind, start at interest step
      const startStep: Step =
        defaultKind === 'loan'
          ? 'details'
          : defaultDirection
            ? 'interest'
            : 'kind';
      setStep(startStep);
      setForm({
        ...emptyForm,
        kind: defaultKind,
        direction,
        hasInterest: defaultKind === 'loan',
        startDate: new Date().toISOString().slice(0, 10),
      });
    }
  }, [open, editing, defaultKind, defaultDirection]);

  const stepTitle = useMemo(() => {
    if (isEdit) return 'Edit facility';
    if (step === 'kind') return 'Credit or Loan?';
    if (step === 'direction') return 'Lent or Borrow?';
    if (step === 'interest') return 'Interest?';
    return form.kind === 'loan' ? 'Loan details' : 'Credit details';
  }, [isEdit, step, form.kind]);

  const stepDescription = useMemo(() => {
    if (isEdit) return 'Update facility details. Still separate from main finance P&amp;L.';
    if (step === 'kind') return 'Choose whether this is informal credit or a formal loan.';
    if (step === 'direction')
      return 'First choose if you lent money; otherwise choose borrow if you took credit.';
    if (step === 'interest') return 'Does this credit carry interest, or is it interest-free?';
    return 'Fill in the remaining details. Nothing here is counted in main finance.';
  }, [isEdit, step]);

  const canContinueDetails =
    !!form.title.trim() &&
    !!form.partyName.trim() &&
    Number(form.principalAmount) >= 0 &&
    !!form.startDate &&
    (!form.hasInterest || Number(form.interestRate) >= 0) &&
    (form.kind !== 'loan' ||
      (!!form.tenureMonths &&
        Number(form.tenureMonths) > 0 &&
        (!form.hasInterest || Number(form.interestRate) > 0)));

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title.trim(),
        kind: form.kind,
        direction: form.direction,
        hasInterest: form.hasInterest,
        partyName: form.partyName.trim(),
        principalAmount: Number(form.principalAmount) || 0,
        interestRate: form.hasInterest ? Number(form.interestRate) || 0 : null,
        tenureMonths: form.tenureMonths === '' ? null : Number(form.tenureMonths),
        emiAmount: form.emiAmount === '' ? null : Number(form.emiAmount),
        processingFee: form.processingFee === '' ? null : Number(form.processingFee),
        loanPurpose: form.loanPurpose || null,
        collateral: form.collateral || null,
        lenderType: form.kind === 'loan' ? form.lenderType || null : null,
        startDate: form.startDate,
        dueDate: form.dueDate || null,
        paymentMethod: form.paymentMethod || null,
        reference: form.reference || null,
        notes: form.notes || null,
        recordInitialDisbursement: form.recordInitialDisbursement,
      };

      if (isEdit) {
        return (
          await api.patch(`/finance/credit/facilities/${editing!._id}`, {
            title: payload.title,
            partyName: payload.partyName,
            hasInterest: payload.hasInterest,
            interestRate: payload.interestRate,
            tenureMonths: payload.tenureMonths,
            emiAmount: payload.emiAmount,
            processingFee: payload.processingFee,
            loanPurpose: payload.loanPurpose,
            collateral: payload.collateral,
            lenderType: payload.lenderType,
            dueDate: payload.dueDate,
            paymentMethod: payload.paymentMethod,
            reference: payload.reference,
            notes: payload.notes,
          })
        ).data;
      }
      return (await api.post('/finance/credit/facilities', payload)).data;
    },
    onSuccess: () => {
      toast.success(
        isEdit
          ? 'Facility updated'
          : form.kind === 'loan'
            ? 'Loan created'
            : 'Credit facility created'
      );
      qc.invalidateQueries({ queryKey: ['credit-facilities'] });
      qc.invalidateQueries({ queryKey: ['credit-summary'] });
      onClose();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const goBack = () => {
    if (step === 'details') {
      if (form.kind === 'loan') setStep('kind');
      else setStep('interest');
      return;
    }
    if (step === 'interest') {
      setStep('direction');
      return;
    }
    if (step === 'direction') {
      setStep('kind');
    }
  };

  const footer = (() => {
    if (isEdit || step === 'details') {
      return (
        <>
          {!isEdit ? (
            <Button variant="outline" disabled={save.isPending} onClick={goBack}>
              <ChevronLeft className="h-3.5 w-3.5" /> Back
            </Button>
          ) : (
            <Button variant="outline" disabled={save.isPending} onClick={onClose}>
              Cancel
            </Button>
          )}
          <Button
            disabled={save.isPending || !canContinueDetails}
            onClick={() => save.mutate()}
            className="gap-1.5"
          >
            <Landmark className="h-3.5 w-3.5" />
            {save.isPending ? 'Saving…' : isEdit ? 'Save changes' : form.kind === 'loan' ? 'Create loan' : 'Create credit'}
          </Button>
        </>
      );
    }

    return (
      <>
        <Button variant="outline" onClick={step === 'kind' ? onClose : goBack}>
          {step === 'kind' ? 'Cancel' : (
            <>
              <ChevronLeft className="h-3.5 w-3.5" /> Back
            </>
          )}
        </Button>
        <Button
          onClick={() => {
            if (step === 'kind') {
              if (form.kind === 'loan') {
                setForm((f) => ({ ...f, direction: 'borrowed', hasInterest: true }));
                setStep('details');
              } else {
                setForm((f) => ({ ...f, direction: 'lent' }));
                setStep('direction');
              }
              return;
            }
            if (step === 'direction') {
              setStep('interest');
              return;
            }
            if (step === 'interest') setStep('details');
          }}
        >
          Continue
        </Button>
      </>
    );
  })();

  return (
    <Modal
      open={open}
      onClose={() => !save.isPending && onClose()}
      title={stepTitle}
      description={stepDescription}
      size="md"
      preventDismiss={save.isPending}
      footer={footer}
    >
      <div className="space-y-4 text-sm">
        {!isEdit && step !== 'kind' ? (
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            <span className="rounded-full bg-sky-100 px-2 py-0.5 font-semibold text-sky-800">
              {form.kind === 'loan' ? 'Loan' : 'Credit'}
            </span>
            {form.kind === 'credit' ? (
              <>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                  {form.direction === 'lent' ? 'Lent' : 'Borrowed'}
                </span>
                {(step === 'interest' || step === 'details') && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">
                    {form.hasInterest ? 'With interest' : 'Without interest'}
                  </span>
                )}
              </>
            ) : null}
          </div>
        ) : null}

        {step === 'kind' && !isEdit ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <ChoiceCard
              selected={form.kind === 'credit'}
              title="Credit"
              hint="Informal credit — first choose lent or borrow, then interest."
              onClick={() => setForm((f) => ({ ...f, kind: 'credit', direction: 'lent' }))}
            />
            <ChoiceCard
              selected={form.kind === 'loan'}
              title="Loan"
              hint="Formal loan — enter full loan terms (tenure, EMI, lender, etc.)."
              onClick={() =>
                setForm((f) => ({ ...f, kind: 'loan', direction: 'borrowed', hasInterest: true }))
              }
            />
          </div>
        ) : null}

        {step === 'direction' && !isEdit ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <ChoiceCard
              selected={form.direction === 'lent'}
              title="Lent"
              hint="You gave credit — they owe you."
              onClick={() => setForm((f) => ({ ...f, direction: 'lent' }))}
            />
            <ChoiceCard
              selected={form.direction === 'borrowed'}
              title="Borrow"
              hint="You took credit — you owe them."
              onClick={() => setForm((f) => ({ ...f, direction: 'borrowed' }))}
            />
          </div>
        ) : null}

        {step === 'interest' && !isEdit ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <ChoiceCard
              selected={form.hasInterest}
              title="With interest"
              hint="You’ll enter an interest rate in the next step."
              onClick={() => setForm((f) => ({ ...f, hasInterest: true }))}
            />
            <ChoiceCard
              selected={!form.hasInterest}
              title="Without interest"
              hint="Interest-free credit — no rate required."
              onClick={() => setForm((f) => ({ ...f, hasInterest: false, interestRate: '' }))}
            />
          </div>
        ) : null}

        {(step === 'details' || isEdit) && (
          <div className="space-y-3">
            <div>
              <Label>Title</Label>
              <Input
                className="mt-1"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder={
                  form.kind === 'loan'
                    ? 'e.g. HDFC working capital loan'
                    : form.direction === 'lent'
                      ? 'e.g. Credit to vendor ABC'
                      : 'e.g. Short credit from friend'
                }
              />
            </div>

            <div>
              <Label>
                {form.kind === 'loan'
                  ? 'Lender'
                  : form.direction === 'lent'
                    ? 'Borrower (who received credit)'
                    : 'Creditor (who gave credit)'}
              </Label>
              <Input
                className="mt-1"
                value={form.partyName}
                onChange={(e) => setForm((f) => ({ ...f, partyName: e.target.value }))}
                placeholder="Person or institution"
              />
            </div>

            {form.kind === 'loan' ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Lender type</Label>
                  <Select
                    className="mt-1"
                    value={form.lenderType}
                    onChange={(e) => setForm((f) => ({ ...f, lenderType: e.target.value }))}
                  >
                    {['Bank', 'NBFC', 'Person', 'Friend / Family', 'Other'].map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Loan purpose</Label>
                  <Input
                    className="mt-1"
                    value={form.loanPurpose}
                    onChange={(e) => setForm((f) => ({ ...f, loanPurpose: e.target.value }))}
                    placeholder="Working capital, asset…"
                  />
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{form.kind === 'loan' ? 'Loan amount' : 'Amount'}</Label>
                <Input
                  className="mt-1"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.principalAmount}
                  onChange={(e) => setForm((f) => ({ ...f, principalAmount: e.target.value }))}
                  disabled={isEdit}
                />
              </div>
              <div>
                <Label>Start date</Label>
                <Input
                  className="mt-1"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                  disabled={isEdit}
                />
              </div>
            </div>

            {(form.hasInterest || form.kind === 'loan') && (
              <div className="grid grid-cols-2 gap-3">
                {form.kind === 'loan' ? (
                  <div className="col-span-2">
                    <Label>Interest</Label>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      <ChoiceCard
                        selected={form.hasInterest}
                        title="With interest"
                        hint="Enter annual rate %"
                        onClick={() => setForm((f) => ({ ...f, hasInterest: true }))}
                      />
                      <ChoiceCard
                        selected={!form.hasInterest}
                        title="Without interest"
                        hint="Interest-free loan"
                        onClick={() =>
                          setForm((f) => ({ ...f, hasInterest: false, interestRate: '' }))
                        }
                      />
                    </div>
                  </div>
                ) : null}
                {form.hasInterest ? (
                  <div>
                    <Label>Interest rate % / year</Label>
                    <Input
                      className="mt-1"
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.interestRate}
                      onChange={(e) => setForm((f) => ({ ...f, interestRate: e.target.value }))}
                      placeholder="e.g. 12"
                    />
                  </div>
                ) : null}
                <div>
                  <Label>Due / end date</Label>
                  <Input
                    className="mt-1"
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                  />
                </div>
              </div>
            )}

            {!form.hasInterest && form.kind === 'credit' ? (
              <div>
                <Label>Due date (optional)</Label>
                <Input
                  className="mt-1"
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
            ) : null}

            {form.kind === 'loan' ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Tenure (months)</Label>
                    <Input
                      className="mt-1"
                      type="number"
                      min={1}
                      value={form.tenureMonths}
                      onChange={(e) => setForm((f) => ({ ...f, tenureMonths: e.target.value }))}
                      placeholder="e.g. 24"
                    />
                  </div>
                  <div>
                    <Label>EMI amount (optional)</Label>
                    <Input
                      className="mt-1"
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.emiAmount}
                      onChange={(e) => setForm((f) => ({ ...f, emiAmount: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Processing fee (optional)</Label>
                    <Input
                      className="mt-1"
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.processingFee}
                      onChange={(e) => setForm((f) => ({ ...f, processingFee: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Collateral (optional)</Label>
                    <Input
                      className="mt-1"
                      value={form.collateral}
                      onChange={(e) => setForm((f) => ({ ...f, collateral: e.target.value }))}
                      placeholder="Property, gold…"
                    />
                  </div>
                </div>
              </>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Payment method</Label>
                <Select
                  className="mt-1"
                  value={form.paymentMethod}
                  onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))}
                >
                  {['Bank Transfer', 'UPI', 'Cash', 'Cheque', 'Credit Card', 'Other'].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Reference / A/C no.</Label>
                <Input
                  className="mt-1"
                  value={form.reference}
                  onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea
                className="mt-1 min-h-20"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Terms, reminders…"
              />
            </div>

            {!isEdit && (
              <label className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] text-sky-900">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={form.recordInitialDisbursement}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, recordInitialDisbursement: e.target.checked }))
                  }
                />
                <span>
                  Record initial disbursement for the amount (sets outstanding). Still excluded from
                  main finance.
                </span>
              </label>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
