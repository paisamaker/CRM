/**
 * Formats duration in minutes to readable "Xh Ym" format (e.g. 7h 45m)
 */
export function formatDurationMinutes(minutes: number): string {
  if (!minutes || minutes <= 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Formats an ISO timestamp to readable time string (e.g. 09:30 AM)
 */
export function formatTime(isoString?: string | Date | null): string {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

/**
 * Formats YYYY-MM-DD to human-readable string (e.g. Monday, 12 Oct 2026)
 */
export function formatDateReadable(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(`${dateStr}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/**
 * Color mapping for the 5 activity intensity levels
 */
export const ACTIVITY_COLORS = {
  0: '#EAECF0', // Neutral empty
  1: '#D8F3E8', // Low
  2: '#86D9B5', // Medium
  3: '#35B879', // High
  4: '#087F5B', // Maximum
} as const;

export interface CalendarDayCell {
  date: string; // YYYY-MM-DD
  weekIndex: number;
  dayOfWeek: number; // 0 = Mon, 6 = Sun
  month: number; // 0..11
  isCurrentYear: boolean;
  isToday: boolean;
  isFuture: boolean;
  isWeekend: boolean;
}

export interface MonthLabel {
  name: string;
  weekIndex: number;
}

/**
 * Generates the full 52-53 week calendar grid for a given year.
 * Weeks run Monday (row 0) to Sunday (row 6).
 */
export function generateYearCalendarGrid(year: number) {
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days: CalendarDayCell[] = [];
  const monthLabels: MonthLabel[] = [];

  // Determine starting offset: Monday is 0, Sunday is 6
  // JS getDay(): 0 is Sunday, 1 is Monday ... 6 is Saturday
  const startDayOfWeek = (startDate.getDay() + 6) % 7;

  let currentWeekIndex = 0;
  let lastLabeledMonth = -1;

  // Fill in any leading days from previous year's final week
  if (startDayOfWeek > 0) {
    for (let i = 0; i < startDayOfWeek; i++) {
      const prevDate = new Date(year, 0, 1 - (startDayOfWeek - i));
      const dateKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(
        prevDate.getDate()
      ).padStart(2, '0')}`;
      days.push({
        date: dateKey,
        weekIndex: 0,
        dayOfWeek: i,
        month: prevDate.getMonth(),
        isCurrentYear: false,
        isToday: prevDate.getTime() === today.getTime(),
        isFuture: prevDate.getTime() > today.getTime(),
        isWeekend: i >= 5,
      });
    }
  }

  // Iterate every day in the year
  const iter = new Date(startDate);
  while (iter <= endDate) {
    const dayOfWeek = (iter.getDay() + 6) % 7;
    const currentMonth = iter.getMonth();
    const dateKey = `${year}-${String(currentMonth + 1).padStart(2, '0')}-${String(
      iter.getDate()
    ).padStart(2, '0')}`;

    // Place month label at the first appearance of each month
    if (currentMonth !== lastLabeledMonth && iter.getDate() <= 14) {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      monthLabels.push({
        name: monthNames[currentMonth],
        weekIndex: currentWeekIndex,
      });
      lastLabeledMonth = currentMonth;
    }

    days.push({
      date: dateKey,
      weekIndex: currentWeekIndex,
      dayOfWeek,
      month: currentMonth,
      isCurrentYear: true,
      isToday: iter.getTime() === today.getTime(),
      isFuture: iter.getTime() > today.getTime(),
      isWeekend: dayOfWeek >= 5,
    });

    if (dayOfWeek === 6) {
      currentWeekIndex++;
    }

    iter.setDate(iter.getDate() + 1);
  }

  // Fill in trailing days to complete the final week up to Sunday
  const lastCell = days[days.length - 1];
  if (lastCell && lastCell.dayOfWeek < 6) {
    const needed = 6 - lastCell.dayOfWeek;
    for (let i = 1; i <= needed; i++) {
      const nextDate = new Date(year + 1, 0, i);
      const dateKey = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(
        nextDate.getDate()
      ).padStart(2, '0')}`;
      days.push({
        date: dateKey,
        weekIndex: currentWeekIndex,
        dayOfWeek: lastCell.dayOfWeek + i,
        month: 0,
        isCurrentYear: false,
        isToday: nextDate.getTime() === today.getTime(),
        isFuture: true,
        isWeekend: lastCell.dayOfWeek + i >= 5,
      });
    }
  }

  const totalWeeks = currentWeekIndex + 1;

  return { days, totalWeeks, monthLabels };
}
