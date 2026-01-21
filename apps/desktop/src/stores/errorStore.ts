/**
 * Error Store - DEPRECATED
 *
 * This store has been consolidated into the unified UI store.
 * This file re-exports from ui.ts for backwards compatibility.
 *
 * @deprecated Import from './ui' instead
 */

export {
  useUIStore as default,
  useErrorStore,
  // Types
  type ErrorSeverity,
  type AppError,
  type ErrorStatistics,
  // Selectors
  selectErrors,
  selectToasts,
  selectUndismissedErrors,
} from './ui';
