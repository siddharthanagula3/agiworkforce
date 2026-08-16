/**
 * Error Handling Utilities
 *
 * @deprecated This module re-exports from @shared/lib/error-utils for backward compatibility.
 * Please import directly from '@shared/lib/error-utils' for new code.
 *
 * Migration: Replace imports from '@shared/utils/error-handling' with '@shared/lib/error-utils'
 */

export {
  ErrorCodes,
  type ErrorCode,
  AppError,
  TimeoutError,

  isRetryableError,
  getErrorMessage,
  parseErrorMessage,
  getTechnicalErrorMessage,
  toAppError,

  TimeoutPresets,
  withTimeout,
  fetchWithTimeout,
  type FetchWithTimeoutOptions,

  type RetryOptions,
  type NormalizedRetryConfig,
  normalizeRetryConfig,
  computeBackoffMs,
  sleep,
  retryWithBackoff,
  getRetryDelay,

  withErrorHandling,
  safeJsonParse,
} from '@shared/lib/error-utils';
