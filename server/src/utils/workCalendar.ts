/** Company work calendar helpers — Sundays + configured holidays are non-working. */

export type CompanyHoliday = {
  date: string; // YYYY-MM-DD
  name: string;
  recurring?: boolean; // if true, matches MM-DD every year
};

/** JS getDay(): 0 = Sunday */
export function isSunday(date: Date): boolean {
  return date.getDay() === 0;
}

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Expand holidays for a calendar year (supports recurring MM-DD). */
export function holidayMapForYear(
  holidays: CompanyHoliday[] | undefined | null,
  year: number
): Map<string, string> {
  const map = new Map<string, string>();
  for (const h of holidays || []) {
    if (!h?.date || !h?.name) continue;
    const raw = String(h.date).slice(0, 10);
    if (h.recurring) {
      const md = raw.slice(5); // MM-DD
      if (/^\d{2}-\d{2}$/.test(md)) {
        map.set(`${year}-${md}`, h.name);
      }
    } else if (raw.startsWith(`${year}-`)) {
      map.set(raw, h.name);
    }
  }
  return map;
}

export function isCompanyHoliday(
  dateOrKey: Date | string,
  holidayMap: Map<string, string>
): string | undefined {
  const key = typeof dateOrKey === 'string' ? dateOrKey.slice(0, 10) : toDateKey(dateOrKey);
  return holidayMap.get(key);
}

/** True if the day counts as an expected work day (not Sunday, not holiday). */
export function isExpectedWorkDay(date: Date, holidayMap: Map<string, string>): boolean {
  if (isSunday(date)) return false;
  if (isCompanyHoliday(date, holidayMap)) return false;
  return true;
}

/** Count expected working days from start..end inclusive. */
export function countExpectedWorkDays(
  start: Date,
  end: Date,
  holidayMap: Map<string, string>
): number {
  let n = 0;
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cur <= last) {
    if (isExpectedWorkDay(cur, holidayMap)) n += 1;
    cur.setDate(cur.getDate() + 1);
  }
  return n;
}
