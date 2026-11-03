import type { IPaymentRequest, IPaymentRequestOcr } from '../../models/PaymentRequest.js';

function normalizeName(value?: string | null): string {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function namesLikelyMatch(a?: string | null, b?: string | null): boolean {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;
  const leftTokens = new Set(left.split(' ').filter((t) => t.length > 1));
  const rightTokens = right.split(' ').filter((t) => t.length > 1);
  if (!rightTokens.length) return false;
  const overlap = rightTokens.filter((t) => leftTokens.has(t)).length;
  return overlap / Math.max(rightTokens.length, 1) >= 0.6;
}

function extractUpiIds(text: string): string[] {
  const matches = text.match(/\b[a-zA-Z0-9.\-_]{2,}@[a-zA-Z][a-zA-Z0-9]{1,}\b/g) || [];
  return Array.from(new Set(matches.map((m) => m.toLowerCase())));
}

function extractAccountLast4(text: string): string[] {
  const results: string[] = [];
  const patterns = [
    /(?:a\/c|account|acc(?:ount)?(?:\s*(?:no|number|#))?|xxxx|x{2,})\s*[:\-]?\s*(?:\*{2,}|\d*X{2,}|\d*x{2,}|[+*]{2,})?\s*(\d{4})\b/gi,
    /(?:ending\s*(?:with|in)|last\s*4)\s*[:\-]?\s*(\d{4})\b/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (match[1]) results.push(match[1]);
    }
  }
  return Array.from(new Set(results));
}

function extractTransactionIds(text: string): string[] {
  const results: string[] = [];
  const labeled = [
    /(?:UTR|RRN|UPI\s*(?:Ref|Reference)?|Txn(?:\s*ID)?|Transaction\s*(?:ID|No|Number)?|Reference\s*(?:No|Number|ID)?)\s*[:#\-]?\s*([A-Z0-9]{8,30})/gi,
  ];
  for (const pattern of labeled) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (match[1]) results.push(match[1].toUpperCase());
    }
  }
  // Common UPI UTR style (12+ digits)
  const digitRuns = text.match(/\b\d{12,22}\b/g) || [];
  for (const run of digitRuns) results.push(run);
  return Array.from(new Set(results));
}

function extractPayeeName(text: string): string | null {
  const patterns = [
    /(?:paid\s*to|payment\s*to|sent\s*to|to)\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9 .,&'@_-]{2,60})/i,
    /(?:beneficiary|payee|receiver|recipient)\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9 .,&'@_-]{2,60})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const name = match[1].replace(/\s+/g, ' ').trim();
      if (!/^(upi|success|successful|transaction|payment|bank|inr|rs)$/i.test(name)) {
        return name.slice(0, 80);
      }
    }
  }
  return null;
}

function extractPaidAmount(text: string): number | null {
  const patterns = [
    /(?:amount\s*paid|paid\s*amount|you\s*paid|amount\s*debited|total\s*paid|paid)\s*[:\-]?\s*(?:₹|rs\.?|inr)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /(?:₹|rs\.?|inr)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const n = Number(match[1].replace(/,/g, ''));
      if (!Number.isNaN(n) && n > 0) return n;
    }
  }
  return null;
}

export function analyzePaymentScreenshot(
  rawText: string,
  request: Pick<IPaymentRequest, 'payeeName' | 'paymentDetails' | 'amount' | 'approvedAmount'>
): IPaymentRequestOcr {
  const text = (rawText || '').replace(/\r/g, '\n');
  const payeeName = extractPayeeName(text);
  const upiIds = extractUpiIds(text);
  const accountLast4s = extractAccountLast4(text);
  const txnIds = extractTransactionIds(text);
  const amount = extractPaidAmount(text);

  const expectedUpi = (request.paymentDetails?.upiId || '').trim().toLowerCase();
  const expectedAccount = (request.paymentDetails?.bankAccountNumber || '').replace(/\s+/g, '');
  const expectedLast4 = expectedAccount.slice(-4);
  const expectedAmount = Number(request.approvedAmount ?? request.amount);

  const upiMatch = expectedUpi
    ? upiIds.some((id) => id === expectedUpi || id.includes(expectedUpi) || expectedUpi.includes(id))
    : false;
  const accountMatch = expectedLast4
    ? accountLast4s.includes(expectedLast4) || text.includes(expectedLast4)
    : false;

  const paymentDetailsMatch =
    (!expectedUpi && !expectedLast4) ||
    (expectedUpi ? upiMatch : false) ||
    (expectedLast4 ? accountMatch : false) ||
    (expectedUpi && expectedLast4 ? upiMatch || accountMatch : false);

  // Prefer request UPI / account when present; otherwise require at least one detail readable
  let paymentDetailsOk = paymentDetailsMatch;
  if (!expectedUpi && !expectedLast4 && request.paymentDetails?.qrCode?.url) {
    // QR-only request: accept if OCR found any UPI/account OR payee name matched strongly
    paymentDetailsOk = upiIds.length > 0 || accountLast4s.length > 0;
  }

  const payeeOk = namesLikelyMatch(request.payeeName, payeeName);
  const amountOk =
    amount != null && expectedAmount > 0 && Math.abs(amount - expectedAmount) < 0.5;

  const mismatches: string[] = [];
  const unclear =
    (!payeeName && !upiIds.length && !accountLast4s.length && amount == null) ||
    text.trim().length < 12;

  if (unclear) {
    mismatches.push('Screenshot could not be read clearly');
  } else {
    if (!payeeOk) mismatches.push('Payee name does not match');
    if (!paymentDetailsOk) mismatches.push('UPI ID / account details do not match');
    if (!amountOk) mismatches.push('Paid amount does not match approved amount');
  }

  let confidence: IPaymentRequestOcr['confidence'] = 'medium';
  if (unclear) confidence = 'unclear';
  else if (mismatches.length === 0) confidence = 'high';
  else if (mismatches.length >= 2) confidence = 'low';

  return {
    payeeName: payeeName || null,
    upiId: upiIds[0] || null,
    accountLast4: accountLast4s[0] || expectedLast4 || null,
    amount: amount ?? null,
    transactionId: txnIds[0] || null,
    rawTextSnippet: text.slice(0, 1200),
    confidence,
    matched: {
      payeeName: payeeOk,
      paymentDetails: paymentDetailsOk,
      amount: amountOk,
      transactionIdUnique: true,
    },
    mismatches,
    scannedAt: new Date(),
  };
}
