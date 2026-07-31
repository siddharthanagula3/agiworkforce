/**
 * @agiworkforce/utils
 *
 * Shared utility functions for the AGI Workforce platform.
 *
 * @packageDocumentation
 */

// Core utilities
export * from './signaling';

// UUIDv7 — client-generatable, time-ordered cloud identity for cross-device sync
export { uuidv7, isUuidV7, uuidV7TimestampMs, setUuidV7RandomSource } from './uuidv7';
export type { RandomBytesSource } from './uuidv7';

// Stable identity for retry-safe Managed Cloud chat operations.
export {
  createManagedChatIdempotencyKey,
  isManagedChatIdempotencyKey,
} from './managedChatIdempotency';
export type {
  ManagedChatIdempotencyIdentity,
  ManagedChatPurpose,
  ManagedChatSurface,
} from './managedChatIdempotency';

// Stable identity for retry-safe Managed Cloud image and video operations.
export {
  createManagedMediaIdempotencyKey,
  isManagedMediaIdempotencyKey,
  parseManagedMediaIdempotencyKey,
} from './managedMediaIdempotency';
export type {
  ManagedMediaIdempotencyIdentity,
  ManagedMediaOperation,
  ManagedMediaSurface,
} from './managedMediaIdempotency';

// Secret-redacting logger facade (FIX-024)
export { logger, redactSecrets, redactSecretsWithReport, scanSecrets } from './logger';
export type { LogLevel, SecretScanOptions, SecretScanResult } from './logger';

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

// Local -> BYOK handoff preview builder with redaction and hash evidence.
export { buildLocalToByokHandoffDraft, type HandoffTarget } from './privacyHandoff';
export type {
  BuildLocalToByokHandoffDraftParams,
  HandoffPreviewContextItem,
  LocalToByokHandoffPreview,
  RedactedHandoffContextItem,
} from './privacyHandoff';

// Path containment — single source of truth for "is candidate inside root".
// Replaces 5 inline implementations across apps/extension-vscode. Audit
// findings F-05, F-06, F-13.
export { resolveContained, isContainedIn } from './pathContainment';
export type { ContainmentResult } from './pathContainment';

// Trust boundary fencing for untrusted content injected into LLM prompts.
export {
  fenceUntrustedContent,
  fenceUntrustedMemoryContent,
  UNTRUSTED_MEMORY_CONTEXT_RULES,
} from './fence';

// Shared reasoning/thinking-block presentation logic (web ThinkingBlock,
// mobile ThinkingChip) — duration formatting + live verb-phrase inference.
export { formatThinkingDuration, deriveReasoningPhrase } from './reasoning';
