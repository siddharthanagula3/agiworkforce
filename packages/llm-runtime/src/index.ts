/**
 * @agiworkforce/llm-runtime
 *
 * Cross-provider LLM runtime infrastructure: retry generator with sticky
 * `RetryContext`, stream watchdog, latched session-stable headers,
 * 30+ branch error classifier, gateway fingerprinting, fallback chain
 * resolution, and message-history repair toolkit.
 *
 * This package is consumed by:
 *   - `services/api-gateway/` — server-side LLM proxy.
 *   - `apps/web/app/api/llm/` — Next.js LLM routes (where applicable).
 *   - `apps/desktop/src-tauri/src/llm/` — Tauri-side LLM calls.
 *   - `packages/providers/{anthropic,openai,google,ollama,...}` —
 *     each adapter wraps its `stream()` body in `withRetry` and
 *     `withStreamIdleWatchdog`.
 *
 * @see tasks/research/deep/m8-services-api.md
 * @see tasks/research/gap-matrix/pkg-api-providers-normalize.md
 *
 * @packageDocumentation
 */

// ----- errors -----
export {
  CannotRetryError,
  FallbackTriggeredError,
  classifyError,
  parseContextOverflow,
  type ClassifiedError,
  type ErrorCategory,
} from './errors';

// ----- retry -----
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

// ----- watchdog -----
export {
  withStreamIdleWatchdog,
  StreamIdleTimeoutError,
  EmptyStreamError,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  DEFAULT_STREAM_IDLE_WARNING_MS,
  type WatchdogOptions,
  type WatchdogHooks,
} from './watchdog';

// ----- headers -----
export {
  LatchedHeaderStore,
  defaultLatchedHeaderStore,
  applyLatchedHeaders,
  type LatchedHeaders,
} from './headers';

// ----- gateway -----
export { detectGateway, gatewayEnforcesUserSideLimits, type GatewayId } from './gateway';

// ----- fallback -----
export { buildFallbackChain, type FallbackStrategy, type FallbackChainOptions } from './fallback';

// ----- history (repair) -----
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
