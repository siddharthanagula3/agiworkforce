export {
  CannotRetryError,
  FallbackTriggeredError,
  EmptyProviderResponseError,
  classifyError,
  parseContextOverflow,
  SPENDING_CAP_PROVIDER_HINT,
  type ClassifiedError,
  type ErrorCategory,
} from './errors';

export {
  withRetry,
  computeDelay,
  sleep,
  createRetryContext,
  DEFAULT_MAX_RETRIES,
  FLOOR_OUTPUT_TOKENS,
  MAX_OVERLOAD_RETRIES,
  BASE_DELAY_MS,
  MAX_BACKOFF_MS,
  type RetryContext,
  type RetryOptions,
  type RetryEvent,
  type RetryOperation,
} from './retry';

export {
  withStreamIdleWatchdog,
  StreamIdleTimeoutError,
  EmptyStreamError,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  DEFAULT_STREAM_IDLE_WARNING_MS,
  type WatchdogOptions,
  type WatchdogHooks,
} from './watchdog';

export {
  validateBaseUrl,
  resolveValidatedBaseUrl,
  ALLOWED_MANAGED_PROVIDER_HOSTS,
  type ValidateBaseUrlOptions,
  type ValidateBaseUrlResult,
} from './base-url';

export {
  LatchedHeaderStore,
  defaultLatchedHeaderStore,
  applyLatchedHeaders,
  type LatchedHeaders,
} from './headers';

export { CredentialFailoverState } from './failover';

export {
  repairMessageHistory,
  ensureToolResultPairing,
  stripAnthropicOnlyFields,
  stripExcessMediaItems,
  DEFAULT_MAX_MEDIA_PER_REQUEST,
  type RepairMessage,
  type RepairBlock,
  type RepairOptions,
} from './history';

// ----- shared retry-after helpers (also re-exported here for consumer migration) -----
export { parseRetryAfter, parseRetryAfterFromError } from './retry-after-internal';

export {
  streamFromProvider,
  type StreamFromProviderOptions,
  type StreamIdleWatchdogOptions,
} from './client/streamFromProvider';
