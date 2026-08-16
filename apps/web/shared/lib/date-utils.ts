
export function ensureValidDate(value: unknown): Date {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value;
  }

  if (value !== null && value !== undefined) {
    const parsed = new Date(value as string | number);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  console.error('[DateUtils] Invalid date value:', value, 'falling back to current date');

  return new Date();
}

export function formatDate(value: unknown, options?: Intl.DateTimeFormatOptions): string {
  const date = ensureValidDate(value);
  return date.toLocaleDateString(undefined, options);
}

export function formatDateTime(value: unknown, options?: Intl.DateTimeFormatOptions): string {
  const date = ensureValidDate(value);
  return date.toLocaleString(undefined, options);
}

export function getTimeAgo(value: unknown): string {
  const date = ensureValidDate(value);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 604800)} weeks ago`;
  if (seconds < 31536000) return `${Math.floor(seconds / 2592000)} months ago`;
  return `${Math.floor(seconds / 31536000)} years ago`;
}

export function isReasonableDate(value: unknown): boolean {
  const date = ensureValidDate(value);
  const now = new Date();

  const minDate = new Date('2020-01-01');
  const maxDate = new Date(now.getTime() + 10 * 365 * 24 * 60 * 60 * 1000);

  return date >= minDate && date <= maxDate;
}

export function sortByDate<T>(array: T[], dateField: keyof T, order: 'asc' | 'desc' = 'asc'): T[] {
  return [...array].sort((a, b) => {
    const aDate = ensureValidDate(a[dateField]);
    const bDate = ensureValidDate(b[dateField]);

    const diff = aDate.getTime() - bDate.getTime();
    return order === 'asc' ? diff : -diff;
  });
}
