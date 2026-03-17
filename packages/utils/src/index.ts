/**
 * @agiworkforce/utils
 *
 * Shared utility functions for the AGI Workforce platform.
 *
 * @packageDocumentation
 */

// Core utilities
export * from './signaling';

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
