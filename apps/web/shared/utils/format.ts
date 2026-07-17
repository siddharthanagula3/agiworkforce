/**
 * Formatting utilities for the web application.
 *
 * This module re-exports formatting functions from @agiworkforce/utils
 * for consistency across the codebase.
 *
 * @module format
 */

// Re-export from shared utils package
export {
  formatDate,
  formatDateTime,
  formatRelativeTime,
  formatCurrency,
  formatNumber,
  formatBytes,
  formatDuration,
  formatPercent,
  truncate,
  formatFileName,
} from '@agiworkforce/utils';
