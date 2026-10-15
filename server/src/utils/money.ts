/** Integer-cent helpers to avoid float drift in financial math. */

export function toCents(amount: number): number {
  return Math.round(Number(amount || 0) * 100);
}

export function fromCents(cents: number): number {
  return Math.round(Number(cents || 0)) / 100;
}

export function roundMoney(amount: number): number {
  return fromCents(toCents(amount));
}

export function addMoney(...amounts: number[]): number {
  return fromCents(amounts.reduce((sum, a) => sum + toCents(a), 0));
}

export function subMoney(a: number, b: number): number {
  return fromCents(toCents(a) - toCents(b));
}

export function pctSafe(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return (numerator / denominator) * 100;
}
