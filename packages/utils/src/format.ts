/**
 * Formatting Utilities
 *
 * Shared formatting functions for dates, numbers, bytes, and currencies.
 * These utilities provide consistent formatting across all applications.
 *
 * @module format
 * @packageDocumentation
 */

/**
 * Format a date using the user's locale.
 *
 * @param date - Date to format (string, number timestamp, or Date object)
 * @param options - Intl.DateTimeFormat options
 * @returns Formatted date string
 *
 * @example
 * ```typescript
 * formatDate(new Date()); // "January 15, 2026"
 * formatDate('2026-01-15', { dateStyle: 'short' }); // "1/15/26"
 * ```
 */
export function formatDate(
  date: string | number | Date,
  options: Intl.DateTimeFormatOptions = {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  },
): string {
  return new Intl.DateTimeFormat('en-US', options).format(new Date(date));
}

/**
 * Format a date with time.
 *
 * @param date - Date to format
 * @returns Formatted date and time string
 *
 * @example
 * ```typescript
 * formatDateTime(new Date()); // "January 15, 2026, 2:30 PM"
 * ```
 */
export function formatDateTime(date: string | number | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(date));
}

/**
 * Format a relative time (e.g., "2 hours ago", "in 3 days").
 *
 * @param date - Date to compare against now
 * @returns Relative time string
 *
 * @example
 * ```typescript
 * formatRelativeTime(Date.now() - 3600000); // "1 hour ago"
 * formatRelativeTime(Date.now() + 86400000); // "in 1 day"
 * ```
 */
export function formatRelativeTime(date: string | number | Date): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffMs = then - now;
  const diffSecs = Math.round(diffMs / 1000);
  const diffMins = Math.round(diffSecs / 60);
  const diffHours = Math.round(diffMins / 60);
  const diffDays = Math.round(diffHours / 24);

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  if (Math.abs(diffSecs) < 60) {
    return rtf.format(diffSecs, 'second');
  }
  if (Math.abs(diffMins) < 60) {
    return rtf.format(diffMins, 'minute');
  }
  if (Math.abs(diffHours) < 24) {
    return rtf.format(diffHours, 'hour');
  }
  return rtf.format(diffDays, 'day');
}

/**
 * Format a currency amount.
 *
 * @param amount - Amount to format
 * @param currency - ISO 4217 currency code (default: 'USD')
 * @returns Formatted currency string
 *
 * @example
 * ```typescript
 * formatCurrency(99.99); // "$99.99"
 * formatCurrency(1234.56, 'EUR'); // "EUR 1,234.56"
 * ```
 */
export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Format a number with locale-specific thousands separators.
 *
 * @param num - Number to format
 * @param options - Intl.NumberFormat options
 * @returns Formatted number string
 *
 * @example
 * ```typescript
 * formatNumber(1234567); // "1,234,567"
 * formatNumber(0.123, { style: 'percent' }); // "12%"
 * ```
 */
export function formatNumber(num: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat('en-US', options).format(num);
}

/**
 * Format bytes into a human-readable string.
 *
 * @param bytes - Number of bytes
 * @param decimals - Decimal places (default: 2)
 * @returns Formatted size string (e.g., "1.5 MB")
 *
 * @example
 * ```typescript
 * formatBytes(0); // "0 Bytes"
 * formatBytes(1024); // "1 KB"
 * formatBytes(1536, 1); // "1.5 KB"
 * formatBytes(1073741824); // "1 GB"
 * ```
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const index = Math.min(i, sizes.length - 1);

  return `${parseFloat((bytes / Math.pow(k, index)).toFixed(dm))} ${sizes[index]}`;
}

/**
 * Format a duration in milliseconds to a human-readable string.
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted duration string
 *
 * @example
 * ```typescript
 * formatDuration(500); // "500ms"
 * formatDuration(5000); // "5.0s"
 * formatDuration(65000); // "1m 5s"
 * formatDuration(3665000); // "1h 1m 5s"
 * ```
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const m = minutes % 60;
    const s = seconds % 60;
    return `${hours}h ${m}m ${s}s`;
  }

  if (minutes > 0) {
    const s = seconds % 60;
    return `${minutes}m ${s}s`;
  }

  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Format a percentage.
 *
 * @param value - Value between 0 and 1 (or 0-100 if isPercentage is true)
 * @param decimals - Decimal places (default: 0)
 * @param isPercentage - Whether value is already a percentage (default: false)
 * @returns Formatted percentage string
 *
 * @example
 * ```typescript
 * formatPercent(0.5); // "50%"
 * formatPercent(0.123, 1); // "12.3%"
 * formatPercent(75, 0, true); // "75%"
 * ```
 */
export function formatPercent(value: number, decimals = 0, isPercentage = false): string {
  const percentage = isPercentage ? value : value * 100;
  return `${percentage.toFixed(decimals)}%`;
}

/**
 * Truncate a string to a maximum length with ellipsis.
 *
 * @param str - String to truncate
 * @param maxLength - Maximum length including ellipsis
 * @param ellipsis - Ellipsis string (default: '...')
 * @returns Truncated string
 *
 * @example
 * ```typescript
 * truncate('Hello, World!', 8); // "Hello..."
 * truncate('Short', 10); // "Short"
 * ```
 */
export function truncate(str: string, maxLength: number, ellipsis = '...'): string {
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength - ellipsis.length)}${ellipsis}`;
}

/**
 * Format a file name by truncating the middle if too long.
 *
 * @param filename - File name to format
 * @param maxLength - Maximum length
 * @returns Formatted file name
 *
 * @example
 * ```typescript
 * formatFileName('very-long-document-name.pdf', 20);
 * // "very-lo...ame.pdf"
 * ```
 */
export function formatFileName(filename: string, maxLength: number): string {
  if (filename.length <= maxLength) return filename;

  const extIndex = filename.lastIndexOf('.');
  if (extIndex === -1) {
    return truncate(filename, maxLength);
  }

  const ext = filename.slice(extIndex);
  const name = filename.slice(0, extIndex);

  if (ext.length >= maxLength - 3) {
    return truncate(filename, maxLength);
  }

  const availableLength = maxLength - ext.length - 3;
  const halfLength = Math.floor(availableLength / 2);

  return `${name.slice(0, halfLength)}...${name.slice(-halfLength)}${ext}`;
}
