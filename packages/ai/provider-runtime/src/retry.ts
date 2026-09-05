import {
  CannotRetryError,
  FallbackTriggeredError,
  classifyError,
  parseContextOverflow,
  type ClassifiedError,
} from './errors';

export const DEFAULT_MAX_RETRIES = 10;
export const FLOOR_OUTPUT_TOKENS = 3000;
export const MAX_OVERLOAD_RETRIES = 3;
export const BASE_DELAY_MS = 500;
export const MAX_BACKOFF_MS = 32_000;

/**
 * How many same-provider candidates managed failover may try for a request
 * that carries a provider-native search tool before it must move to a
 * different provider. A rate-limited grounding project served the whole
 * candidate ladder on the same key otherwise, which is what turned one 429
 * into a run of them.
 */
export const MAX_SAME_PROVIDER_RETRIES_FOR_GROUNDED_REQUEST = 1;

export interface RetryContext {
  model: string;
  maxTokensOverride?: number;
  thinkingConfig?: { enabled: boolean; budgetTokens?: number };
  fastMode: boolean;
  consecutiveOverloads: number;
  attempt: number;
  fallbackModel?: string;
  signal?: AbortSignal;
  querySource?: string;
  metadata?: Record<string, unknown>;
}

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxBackoffMs?: number;
  maxOverloadRetries?: number;
  disableFallback?: boolean;
  onEvent?: (event: RetryEvent) => void;
  shouldFallback?: (ctx: RetryContext, classified: ClassifiedError) => boolean;
}

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

export type RetryOperation<T> = (ctx: Readonly<RetryContext>) => Promise<T>;

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

      if (classified.category === 'aborted') {
        throw new CannotRetryError(err, classified);
      }

      if (classified.category === 'server_overload' || classified.category === 'rate_limit') {
        ctx.consecutiveOverloads += 1;
      } else {
        ctx.consecutiveOverloads = 0;
      }

      if (classified.category === 'context_overflow') {
        function giveUpOrFallback(): never {
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
        const parsed = parseContextOverflow(classified.message);
        if (!parsed) giveUpOrFallback();
        const headroom = parsed.contextLimit - parsed.inputTokens - 1000;
        const thinking = ctx.thinkingConfig?.budgetTokens ?? 0;
        const noViableShrink = headroom < FLOOR_OUTPUT_TOKENS || headroom < thinking + 1;
        if (noViableShrink) giveUpOrFallback();
        const candidate = Math.max(FLOOR_OUTPUT_TOKENS, thinking + 1, headroom);
        if (candidate < parsed.requestedMaxTokens) {
          ctx.maxTokensOverride = candidate;
        } else {
          giveUpOrFallback();
        }
      }

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

      if (!classified.retryable) {
        onEvent({ type: 'give-up', attempt, classified });
        throw new CannotRetryError(err, classified);
      }

      if (attempt === maxRetries + 1) {
        onEvent({ type: 'give-up', attempt, classified });
        throw new CannotRetryError(err, classified);
      }

      const delay = computeDelay(attempt, classified.retryAfterSeconds, baseDelay, maxBackoff);
      onEvent({ type: 'delay', attempt, delayMs: delay, classified });
      await sleep(delay, ctx.signal);
    }
  }

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
