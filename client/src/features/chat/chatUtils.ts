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
