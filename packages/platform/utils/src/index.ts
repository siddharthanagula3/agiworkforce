/**
 * @agiworkforce/utils
 *
 * Shared utility functions for the AGI Workforce platform.
 *
 * @packageDocumentation
 */

export * from './signaling';

export { uuidv7, isUuidV7, uuidV7TimestampMs, setUuidV7RandomSource } from './uuidv7';
export type { RandomBytesSource } from './uuidv7';

export {
  createManagedChatIdempotencyKey,
  isManagedChatIdempotencyKey,
} from './managedChatIdempotency';
export type {
  ManagedChatIdempotencyIdentity,
  ManagedChatPurpose,
  ManagedChatSurface,
} from './managedChatIdempotency';

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

export { logger, redactSecrets, redactSecretsWithReport, scanSecrets } from './logger';
export type { LogLevel, SecretScanOptions, SecretScanResult } from './logger';

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

export {
  runWithRetryPolicy,
  classifyRetryError,
  computeRetryDelayMs,
  createRetryBudget,
  retryBudgetFor,
  resetRetryBudgets,
  readRetryAfterMs,
  RetryStoppedError,
  RetryAbortedError,
  RETRY_POLICY_DEFAULTS,
  type RetryPolicy,
  type RetryBudget,
  type RetryClassification,
  type RetryDisposition,
  type RetryStopReason,
  type RetryTelemetryEvent,
} from './retryPolicy';

export {
  INTERACTION_DEBOUNCE_MS,
  SEARCH_INPUT_DEBOUNCE_MS,
  FILTER_INPUT_DEBOUNCE_MS,
  REGISTRY_DISCOVERY_DEBOUNCE_MS,
  AUTOSAVE_DEBOUNCE_MS,
  type InteractionDebounceKind,
} from './interactionTimings';

export {
  CircuitBreaker,
  CircuitOpenError,
  DependencyOverloadedError,
  DependencyTimeoutError,
  circuitBreakerSnapshots,
  getCircuitBreaker,
  isDependencyUnavailableError,
  resetCircuitBreakers,
} from './circuitBreaker';

export type {
  CircuitBreakerOptions,
  CircuitBreakerSnapshot,
  CircuitLease,
  CircuitState,
  CircuitStateChange,
  LeaseOptions as CircuitLeaseOptions,
  DependencyRejection,
  DependencyRejectionReason,
  ExecuteOptions as CircuitBreakerExecuteOptions,
} from './circuitBreaker';

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

export * from './voice';

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

export { measureAsync, measureSync, PerformanceTracker } from './performance';

export type { MeasureResult, PerformanceMetrics } from './performance';

export { SENSITIVE_FILE_PATTERNS, isSensitiveFile, matchSensitivePattern } from './sensitiveFiles';

export { buildLocalToByokHandoffDraft, type HandoffTarget } from './privacyHandoff';
export type {
  BuildLocalToByokHandoffDraftParams,
  HandoffPreviewContextItem,
  LocalToByokHandoffPreview,
  RedactedHandoffContextItem,
} from './privacyHandoff';

export {
  fenceUntrustedContent,
  fenceUntrustedMemoryContent,
  UNTRUSTED_MEMORY_CONTEXT_RULES,
} from './fence';

export { formatThinkingDuration, deriveReasoningPhrase } from './reasoning';

export { normalizeDisplayName, resolveAccountDisplayName, accountInitial } from './displayName';
