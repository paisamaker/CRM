import { formatInTimeZone } from 'date-fns-tz';
import { env } from '../config/env.js';

export function companyDateKey(date = new Date(), timezone = env.DEFAULT_TIMEZONE): string {
  return formatInTimeZone(date, timezone, 'yyyy-MM-dd');
}

export function companyNowLabel(date = new Date(), timezone = env.DEFAULT_TIMEZONE): string {
  return formatInTimeZone(date, timezone, 'yyyy-MM-dd HH:mm:ss zzz');
}
