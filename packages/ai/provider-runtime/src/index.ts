/**
 * @agiworkforce/provider-runtime
 *
 * Cross-provider LLM runtime infrastructure: retry generator with sticky
 * `RetryContext`, stream watchdog, latched session-stable headers,
 * 30+ branch error classifier, gateway fingerprinting, fallback chain
 * resolution, and message-history repair toolkit.
 *
 * This package is consumed by:
 *   - `packages/ai/providers/*`, every adapter, for `classifyError`,
 *     `toStreamErrorClassification` and `withStreamIdleWatchdog`. No adapter
 *     calls `withRetry`: an adapter retrying its own `stream()` would compete
 *     with the turn's deadline and failover budget, which it cannot see.
 *   - `apps/web/app/api/llm/`, the Next.js LLM routes, which own retry for a
 *     turn. The backoff runs at the stream-start seam in
 *     `chat/completions/lib/provider-deadlines.ts`, the one point where an
 *     attempt is known to have emitted nothing, and rotation runs above it in
 *     `chat/completions/lib/managed-failover.ts`.
 *   - `apps/extension` and `apps/mobile`, for the error taxonomy.
 *
 * @packageDocumentation
 */

export {
  CannotRetryError,
  FallbackTriggeredError,
  EmptyProviderResponseError,
  RouteBudgetExhaustedError,
  ROUTE_BUDGET_EXHAUSTED_ERROR_NAME,
  classifyError,
  isErrorCategory,
  toStreamErrorClassification,
  parseContextOverflow,
  DATA_POLICY_NO_ENDPOINT_CODE,
  SPENDING_CAP_PROVIDER_HINT,
  FREE_POOL_PROVIDER_HINT,
  type ClassifiedError,
  type ErrorCategory,
} from './errors';

export {
  withRetry,
  computeDelay,
  retryAfterExceedsCeiling,
  sleep,
  createRetryContext,
  DEFAULT_MAX_RETRIES,
  FLOOR_OUTPUT_TOKENS,
  MAX_OVERLOAD_RETRIES,
  BASE_DELAY_MS,
  MAX_BACKOFF_MS,
  MAX_SAME_PROVIDER_RETRIES_FOR_GROUNDED_REQUEST,
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
  deriveIdempotencyKey,
  meteredStepIdempotencyKey,
  toolInvocationIdempotencyKey,
  type IdempotencyKeyInput,
} from './idempotency';

export {
  CredentialFailoverState,
  isCredentialFailureCategory,
  type CredentialFailoverStateOptions,
} from './failover';

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

export {
  TRACEPARENT_HEADER,
  installProviderTracer,
  getProviderTracer,
  withProviderSpan,
  traceHeaders,
  type ProviderCallDescriptor,
  type ProviderTracer,
} from './tracing';
