import { useAuthStore } from '@/stores/auth';

/** Resolve chat attachment URLs; append access token for same-origin authenticated media. */
export function resolveChatMediaUrl(url?: string): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:')) {
    return url;
  }
  const token = useAuthStore.getState().accessToken;
  const rawApiBase = import.meta.env.VITE_API_URL?.trim() || '';

  let origin = '';
  if (rawApiBase.startsWith('http://') || rawApiBase.startsWith('https://')) {
    try {
      const u = new URL(rawApiBase);
      origin = u.origin;
    } catch {
      origin = rawApiBase.replace(/\/api(\/v1)?\/?$/, '');
    }
  }

  // Ensure clean path
  let path = url.startsWith('/') ? url : `/${url}`;
  // If the path does not have /api/v1 or /api prefix, prepend /api/v1
  if (!path.startsWith('/api/v1') && !path.startsWith('/api/')) {
    path = `/api/v1${path}`;
  }

  const absolute = origin ? `${origin}${path}` : path;
  if (!token) return absolute;
  const sep = absolute.includes('?') ? '&' : '?';
  return `${absolute}${sep}token=${encodeURIComponent(token)}`;
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function linkifyText(text: string): Array<{ type: 'text' | 'link'; value: string }> {
  const parts: Array<{ type: 'text' | 'link'; value: string }> = [];
  const re = /(https?:\/\/[^\s<]+[^\s<.,;:!?"')\]])/gi;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push({ type: 'text', value: text.slice(last, match.index) });
    parts.push({ type: 'link', value: match[0] });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  if (!parts.length) parts.push({ type: 'text', value: text });
  return parts;
}

/**
 * Formats a message timestamp into a clean, human-readable time (e.g., "10:45 AM")
 */
export function formatChatTime(dateString?: string | Date | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/**
 * Formats conversation latest activity timestamp (e.g., "10:45 AM", "Yesterday", "Oct 10")
 */
export function formatConversationTimestamp(dateString?: string | Date | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return formatChatTime(date);
  }
  if (diffDays === 1) {
    return 'Yesterday';
  }
  if (diffDays < 7) {
    return new Intl.DateTimeFormat('en-IN', { weekday: 'short' }).format(date);
  }
  return new Intl.DateTimeFormat('en-IN', { month: 'short', day: 'numeric' }).format(date);
}

/**
 * Formats date separator labels for message lists (e.g., "Today", "Yesterday", "Friday, 9 October 2026")
 */
export function formatDateSeparator(dateString?: string | Date | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';

  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  }).format(date);
}

/**
 * Checks if two dates are on the same calendar day
 */
export function isSameDay(d1?: string | Date | null, d2?: string | Date | null): boolean {
  if (!d1 || !d2) return false;
  const date1 = new Date(d1);
  const date2 = new Date(d2);
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}
