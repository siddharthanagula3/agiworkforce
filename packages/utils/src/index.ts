/**
 * @agiworkforce/utils
 *
 * Shared utility functions for the AGI Workforce platform.
 *
 * @packageDocumentation
 */

// Core utilities
export * from './signaling';

// Secret-redacting logger facade (FIX-024)
export { logger, redactSecrets } from './logger';
export type { LogLevel } from './logger';

// Formatting utilities
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
} from './format';

// Validation utilities
export {
  validateEmail,
  validateUrl,
  validateFilePath,
  validatePassword,
  validateApiKey,
  validateJson,
  validateSqlQuery,
  sanitizeCommandArgs,
  checkForInjection,
  type ValidationResult,
  type PasswordValidationResult,
} from './validation';

// Async utilities
export {
  sleep,
  sleepWithAbort,
  debounce,
  throttle,
  retry,
  retryWithStrategy,
  retryStrategies,
  makeRetriable,
  withTimeout,
  retryBatch,
  RetryError,
  AbortError,
  type RetryOptions,
} from './async';

// Error handling utilities
export {
  AppError,
  createError,
  isAppError,
  toAppError,
  getFriendlyError,
  formatErrorForChat,
  getErrorMessage,
  withErrorHandling,
  ErrorCode,
} from './errors';

export type { ApiError, FriendlyError, ErrorCodeValue } from './errors';

// Voice utilities
export * from './voice';

// Crypto utilities
export {
  generateToken,
  generateUUID,
  sha256,
  sha1,
  generateNumericCode,
  generateShortId,
  hmacSha256,
  timingSafeEqual,
} from './crypto';

// Performance instrumentation utilities
export { measureAsync, measureSync, PerformanceTracker } from './performance';

export type { MeasureResult, PerformanceMetrics } from './performance';

// Sensitive-file denylist — files that must never cross trust boundaries
// (LLM context, telemetry, agent reads). Audit findings F-07, F-09.
export { SENSITIVE_FILE_PATTERNS, isSensitiveFile, matchSensitivePattern } from './sensitiveFiles';

// Path containment — single source of truth for "is candidate inside root".
// Replaces 5 inline implementations across apps/extension-vscode. Audit
// findings F-05, F-06, F-13.
export { resolveContained, isContainedIn } from './pathContainment';
export type { ContainmentResult } from './pathContainment';
