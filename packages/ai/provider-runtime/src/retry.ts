/**
 * Retry generator with sticky `RetryContext`.
 *
 * Wraps any async operation with a configurable retry loop:
 *   - Exponential backoff with full jitter.
 *   - Honour `Retry-After` headers when present.
 *   - Track consecutive 529 / overloaded errors → emit
 *     `FallbackTriggeredError` after a threshold.
 *   - Carry a sticky `RetryContext` across attempts so callers can
 *     adjust `maxTokensOverride`, swap fallback model mid-stream, etc.
 *
 * Citation:
 *   - `tasks/research/deep/m8-services-api.md` §4 (`withRetry.ts`).
 *   - `tasks/research/gap-matrix/pkg-api-providers-normalize.md`
 *     "withRetry generator + sticky RetryContext (P0)".
 */

import {
  CannotRetryError,
  FallbackTriggeredError,
  classifyError,
  parseContextOverflow,
  type ClassifiedError,
} from './errors';

// ===========================================================================
// Constants (mirrored from Anthropic's `withRetry.ts`)
// ===========================================================================

export const DEFAULT_MAX_RETRIES = 10;
export const FLOOR_OUTPUT_TOKENS = 3000;
export const MAX_OVERLOAD_RETRIES = 3;
export const BASE_DELAY_MS = 500;
export const MAX_BACKOFF_MS = 32_000;

// ===========================================================================
// Types
// ===========================================================================

/**
 * Sticky context carried across retry attempts. The closure that
 * actually performs the request reads from this object on each
 * attempt and can mutate it (or have the retry generator mutate it
 * via classifier hints) before the next try.
 */
export interface RetryContext {
  /** Active model — may be swapped on `FallbackTriggeredError`. */
  model: string;
  /**
   * Overridden `max_output_tokens` for the next attempt. Set when a
   * context-overflow error is observed and the generator computes a
   * viable smaller value.
   */
  maxTokensOverride?: number;
  /**
   * Whether thinking is on. Disabled on context-overflow retry because
   * thinking + max_tokens compete for the same budget.
   */
  thinkingConfig?: { enabled: boolean; budgetTokens?: number };
  /** Whether the request is using "fast mode" speed tier. */
  fastMode: boolean;
  /** Counter of consecutive overload-class errors (529 + 503). */
  consecutiveOverloads: number;
  /** Total attempts performed (including the current one). */
  attempt: number;
  /**
   * Optional fallback model. When set + classifier returns
   * `fallbackable`, the retry generator emits
   * `FallbackTriggeredError(model, fallbackModel)`.
   */
  fallbackModel?: string;
  /** AbortSignal — aborted attempts short-circuit immediately. */
  signal?: AbortSignal;
  /**
   * Caller-supplied query source identifier. Mirrors Anthropic's
   * `querySource` — used to gate "foreground 529 retry" behaviour
   * (background classifiers bail immediately on 529 while foreground
   * REPL retries).
   */
  querySource?: string;
  /**
   * Free-form metadata bag for telemetry — never read by the generator
   * itself, only echoed in events.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Options that don't change between attempts.
 */
export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxBackoffMs?: number;
  /** Override consecutive-overload threshold (default 3). */
  maxOverloadRetries?: number;
  /**
   * Caller can opt out of fallback for this request — e.g., for
   * cheap/internal background classifiers where wrong answers are
   * worse than no answer.
   */
  disableFallback?: boolean;
  /**
   * If supplied, called with each `RetryEvent` for telemetry. Must not
   * throw — the generator does not catch hook errors.
   */
  onEvent?: (event: RetryEvent) => void;
  /**
   * If supplied, called when a fallback is about to be emitted. Lets
   * the caller cancel the fallback and force `CannotRetryError`
   * instead. Used by Anthropic's "side_question" path which never
   * fallbacks.
   */
  shouldFallback?: (ctx: RetryContext, classified: ClassifiedError) => boolean;
}

/**
 * Telemetry event surface. Each event has a discriminator so callers
 * can route them. The generator emits at minimum `attempt:start`,
 * `attempt:error`, `delay`, and one of `success` / `fallback` / `give-up`.
 */
export type RetryEvent =
  | { type: 'attempt:start'; attempt: number; ctx: Readonly<RetryContext> }
  | {
      type: 'attempt:error';
      attempt: number;
      classified: ClassifiedError;
      ctx: Readonly<RetryContext>;
    }
  | {
      type: 'delay';
      attempt: number;
      delayMs: number;
      classified: ClassifiedError;
    }
  | { type: 'success'; attempt: number }
  | {
      type: 'fallback';
      attempt: number;
      from: string;
      to: string;
      classified: ClassifiedError;
    }
  | {
      type: 'give-up';
      attempt: number;
      classified: ClassifiedError;
    };

/**
 * Operation signature: the generator passes `RetryContext` so the
 * caller can read the latest model / maxTokensOverride before issuing
 * the actual SDK call. Returning a value short-circuits the retry loop;
 * throwing causes the generator to classify and decide what to do next.
 */
export type RetryOperation<T> = (ctx: Readonly<RetryContext>) => Promise<T>;

// ===========================================================================
// withRetry implementation
// ===========================================================================

/**
 * Run `op` with a retry loop bound to `ctx`. The generator is the canonical
 * place where retry / fallback / max-tokens-context-overflow recovery decisions
 * happen — callers should NOT re-implement any of these inline.
 */
export async function withRetry<T>(
  op: RetryOperation<T>,
  ctx: RetryContext,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelay = options.baseDelayMs ?? BASE_DELAY_MS;
  const maxBackoff = options.maxBackoffMs ?? MAX_BACKOFF_MS;
  const overloadThreshold = options.maxOverloadRetries ?? MAX_OVERLOAD_RETRIES;
  const onEvent = options.onEvent ?? (() => {});
  const shouldFallback = options.shouldFallback ?? (() => true);

  let lastClassified: ClassifiedError | null = null;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    ctx.attempt = attempt;
    if (ctx.signal?.aborted) {
      const aborted: ClassifiedError = {
        category: 'aborted',
        code: 'aborted',
        retryable: false,
        fallbackable: false,
        message: 'request aborted',
      };
      throw new CannotRetryError(new Error('aborted'), aborted);
    }

    onEvent({ type: 'attempt:start', attempt, ctx });

    try {
      const result = await op(ctx);
      onEvent({ type: 'success', attempt });
      return result;
    } catch (err) {
      lastError = err;
      const classified = classifyError(err);
      lastClassified = classified;
      onEvent({ type: 'attempt:error', attempt, classified, ctx });

      // Aborted — never retry.
      if (classified.category === 'aborted') {
        throw new CannotRetryError(err, classified);
      }

      // Mutate ctx based on classifier hints.
      if (classified.category === 'server_overload' || classified.category === 'rate_limit') {
        ctx.consecutiveOverloads += 1;
      } else {
        // Reset counter on non-overload error so a transient 503 surrounded
        // by good responses doesn't accumulate forever.
        ctx.consecutiveOverloads = 0;
      }

      // Context overflow — try to shrink max_tokens before next attempt.
      if (classified.category === 'context_overflow') {
        const parsed = parseContextOverflow(classified.message);
        if (parsed) {
          const headroom = parsed.contextLimit - parsed.inputTokens - 1000;
          const thinking = ctx.thinkingConfig?.budgetTokens ?? 0;
          // If headroom is too small to fit the FLOOR (3000) AND any thinking
          // budget, no shrink will succeed — escalate to fallback (or give up
          // when no fallback configured).
          const noViableShrink = headroom < FLOOR_OUTPUT_TOKENS || headroom < thinking + 1;
          if (noViableShrink) {
            if (ctx.fallbackModel && !options.disableFallback && shouldFallback(ctx, classified)) {
              onEvent({
                type: 'fallback',
                attempt,
                from: ctx.model,
                to: ctx.fallbackModel,
                classified,
              });
              throw new FallbackTriggeredError(ctx.model, ctx.fallbackModel, classified, err);
            }
            throw new CannotRetryError(err, classified);
          }
          const candidate = Math.max(FLOOR_OUTPUT_TOKENS, thinking + 1, headroom);
          if (candidate < parsed.requestedMaxTokens) {
            ctx.maxTokensOverride = candidate;
          } else {
            // Computed candidate >= requestedMax means the regex parsed an
            // unhelpful value; fallback or give up.
            if (ctx.fallbackModel && !options.disableFallback && shouldFallback(ctx, classified)) {
              onEvent({
                type: 'fallback',
                attempt,
                from: ctx.model,
                to: ctx.fallbackModel,
                classified,
              });
              throw new FallbackTriggeredError(ctx.model, ctx.fallbackModel, classified, err);
            }
            throw new CannotRetryError(err, classified);
          }
        }
      }

      // Fallback gate: server_overload above threshold OR explicit
      // fallbackable + we have a fallback model + caller approves.
      const triggerFallback =
        ctx.fallbackModel != null &&
        !options.disableFallback &&
        shouldFallback(ctx, classified) &&
        ((classified.category === 'server_overload' &&
          ctx.consecutiveOverloads >= overloadThreshold) ||
          (classified.fallbackable && classified.category === 'capacity_off_switch'));

      if (triggerFallback && ctx.fallbackModel) {
        onEvent({
          type: 'fallback',
          attempt,
          from: ctx.model,
          to: ctx.fallbackModel,
          classified,
        });
        throw new FallbackTriggeredError(ctx.model, ctx.fallbackModel, classified, err);
      }

      // Non-retryable error → give up.
      if (!classified.retryable) {
        onEvent({ type: 'give-up', attempt, classified });
        throw new CannotRetryError(err, classified);
      }

      // Last attempt? Give up rather than sleep before throwing.
      if (attempt === maxRetries + 1) {
        onEvent({ type: 'give-up', attempt, classified });
        throw new CannotRetryError(err, classified);
      }

      const delay = computeDelay(attempt, classified.retryAfterSeconds, baseDelay, maxBackoff);
      onEvent({ type: 'delay', attempt, delayMs: delay, classified });
      await sleep(delay, ctx.signal);
    }
  }

  // Should be unreachable — every loop iteration either returns or
  // throws — but TypeScript's flow analysis can't prove it without
  // this explicit terminus.
  throw new CannotRetryError(
    lastError,
    lastClassified ?? {
      category: 'unknown',
      code: 'unknown',
      retryable: false,
      fallbackable: false,
      message: 'retry loop exited without resolution',
    },
  );
}

/**
 * Compute the next delay using full-jitter exponential backoff,
 * honouring `Retry-After` when supplied.
 *
 *   delay = retryAfter * 1000   (when retryAfter present)
 *         | min(BASE * 2^(n-1), MAX_BACKOFF) + rand * 0.25 * BASE
 */
export function computeDelay(
  attempt: number,
  retryAfterSeconds: number | undefined,
  baseDelay = BASE_DELAY_MS,
  maxBackoff = MAX_BACKOFF_MS,
  rand: () => number = Math.random,
): number {
  if (typeof retryAfterSeconds === 'number' && retryAfterSeconds >= 0) {
    return retryAfterSeconds * 1000;
  }
  const exp = Math.min(baseDelay * Math.pow(2, attempt - 1), maxBackoff);
  return Math.floor(exp + rand() * 0.25 * baseDelay);
}

/**
 * Cancellable sleep helper — resolves on either timer or signal.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('aborted'));
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      reject(new Error('aborted'));
    };
    function cleanup() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Construct a fresh RetryContext with sensible defaults.
 */
export function createRetryContext(init: {
  model: string;
  signal?: AbortSignal;
  fallbackModel?: string;
  thinkingConfig?: { enabled: boolean; budgetTokens?: number };
  fastMode?: boolean;
  querySource?: string;
  metadata?: Record<string, unknown>;
}): RetryContext {
  const ctx: RetryContext = {
    model: init.model,
    fastMode: init.fastMode ?? false,
    consecutiveOverloads: 0,
    attempt: 0,
  };
  if (init.signal !== undefined) ctx.signal = init.signal;
  if (init.fallbackModel !== undefined) ctx.fallbackModel = init.fallbackModel;
  if (init.thinkingConfig !== undefined) ctx.thinkingConfig = init.thinkingConfig;
  if (init.querySource !== undefined) ctx.querySource = init.querySource;
  if (init.metadata !== undefined) ctx.metadata = init.metadata;
  return ctx;
}
