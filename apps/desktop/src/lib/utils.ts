/**
 * Utility functions for the desktop application.
 *
 * This module provides commonly used utility functions. Where possible,
 * these re-export from @agiworkforce/utils for consistency.
 *
 * @module utils
 */

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Re-export common utilities from shared package
export {
  formatBytes,
  formatNumber,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  formatCurrency,
  formatDuration,
  formatPercent,
  formatFileName,
  truncate,
  sleep,
  debounce,
  throttle,
} from '@agiworkforce/utils';

/**
 * Combine class names with Tailwind CSS merge support.
 *
 * @param inputs - Class names to combine
 * @returns Merged class string
 *
 * @example
 * ```tsx
 * <div className={cn('p-4', isActive && 'bg-blue-500', className)} />
 * ```
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
