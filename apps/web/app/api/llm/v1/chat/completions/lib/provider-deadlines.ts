import 'server-only';

import type { ChatRequest, ProviderAdapter, StreamChunk } from '@agiworkforce/types';
import {
  BASE_DELAY_MS,
  MAX_BACKOFF_MS,
  MAX_OVERLOAD_RETRIES,
  classifyError,
  computeDelay,
  sleep,
  type ErrorCategory,
} from '@agiworkforce/provider-runtime';
import {
  MIN_CHILD_DEADLINE_MS,
  PROVIDER_FIRST_TOKEN_DEADLINE_MS,
  TURN_FIRST_TOKEN_BUDGET_MS,
  nestedDeadlineMs,
} from '@/lib/deadline-policy';
import { startProviderStream } from './adapter-factory';

/**
 * Attempts a same-route retry may spend on a retryable class that is not
 * `server_overload`, which gets `MAX_OVERLOAD_RETRIES` instead. Counts
 * attempts, not retries: 2 means one try and one retry.
 */
export const MAX_SAME_ROUTE_RETRY_ATTEMPTS = 2;

export class ProviderFirstTokenDeadlineError extends Error {
  readonly deadlineMs: number;
  readonly model: string | undefined;

  constructor(deadlineMs: number, model?: string) {
    super(
      model
        ? `${model} sent no first token within its ${deadlineMs}ms first-token timeout`
        : `The model sent no first token within its ${Math.round(deadlineMs / 1000)}s first-token timeout.`,
    );
    this.name = 'ProviderFirstTokenDeadlineError';
    this.deadlineMs = deadlineMs;
    this.model = model;
  }
}

export class ProviderStreamDeadlineError extends Error {
  readonly deadlineMs: number;

  constructor(deadlineMs: number) {
    super(
      `The model stream ran past this turn's remaining time budget ` +
        `(${Math.round(deadlineMs / 1000)}s) and was stopped.`,
    );
    this.name = 'ProviderStreamDeadlineError';
    this.deadlineMs = deadlineMs;
  }
}

export function firstTokenDeadlineMs(turnElapsedMs: number): number {
  return nestedDeadlineMs(
    PROVIDER_FIRST_TOKEN_DEADLINE_MS,
    TURN_FIRST_TOKEN_BUDGET_MS,
    turnElapsedMs,
  );
}

export function hasFirstTokenBudgetLeft(turnElapsedMs: number): boolean {
  return turnElapsedMs < TURN_FIRST_TOKEN_BUDGET_MS;
}

export interface ProviderDeadlineBounds {
  firstTokenMs?: number | undefined;
  streamMs?: number | undefined;
  model?: string | undefined;
}

export interface ArmedProviderDeadlines {
  readonly signal: AbortSignal;
  markFirstToken(): void;
  expiry(): Error | undefined;
  abort(reason?: unknown): void;
  release(): void;
}

// Timers and parent-abort forwarding outlive the start promise, so a stream drained
// after it stays bound by both deadlines and by the client's disconnect.
export function armProviderDeadlines(
  bounds: ProviderDeadlineBounds,
  parentSignal?: AbortSignal,
  onExpire?: (error: Error) => void,
): ArmedProviderDeadlines {
  const controller = new AbortController();
  const expired: { error?: Error } = {};
  const forwardParentAbort = (): void => controller.abort(parentSignal?.reason);
  let streamTimer: ReturnType<typeof setTimeout> | undefined;
  let firstTokenTimer: ReturnType<typeof setTimeout> | undefined;
  const markFirstToken = (): void => {
    if (firstTokenTimer !== undefined) clearTimeout(firstTokenTimer);
    firstTokenTimer = undefined;
  };
  const release = (): void => {
    if (streamTimer !== undefined) clearTimeout(streamTimer);
    streamTimer = undefined;
    markFirstToken();
    parentSignal?.removeEventListener('abort', forwardParentAbort);
  };
  if (parentSignal?.aborted) forwardParentAbort();
  else parentSignal?.addEventListener('abort', forwardParentAbort, { once: true });

  const expire = (error: Error): void => {
    expired.error = error;
    controller.abort(error);
    release();
    onExpire?.(error);
  };
  if (bounds.streamMs !== undefined) {
    const streamMs = bounds.streamMs;
    streamTimer = setTimeout(() => expire(new ProviderStreamDeadlineError(streamMs)), streamMs);
  }
  if (
    bounds.firstTokenMs !== undefined &&
    (bounds.streamMs === undefined || bounds.firstTokenMs < bounds.streamMs)
  ) {
    const firstTokenMs = bounds.firstTokenMs;
    firstTokenTimer = setTimeout(
      () => expire(new ProviderFirstTokenDeadlineError(firstTokenMs, bounds.model)),
      firstTokenMs,
    );
  }

  return {
    signal: controller.signal,
    markFirstToken,
    expiry: () => expired.error,
    abort: (reason?: unknown) => controller.abort(reason),
    release,
  };
}

export function withProviderDeadlines<T>(
  run: (signal: AbortSignal, markFirstToken: () => void) => Promise<T>,
  bounds: ProviderDeadlineBounds,
  parentSignal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const armed = armProviderDeadlines(bounds, parentSignal, reject);
    run(armed.signal, armed.markFirstToken).then(
      (value) => {
        armed.release();
        resolve(value);
      },
      (error: unknown) => {
        armed.abort(error);
        armed.release();
        reject(armed.expiry() ?? error);
      },
    );
  });
}

/**
 * The turn elapsed that the caller's own grant implies.
 *
 * `bounds.firstTokenMs` reaching this seam is already `firstTokenDeadlineMs`
 * of the turn's elapsed time, so it IS what is left of the turn's first-token
 * budget. Reading it back as an elapsed lets the two budget helpers below
 * answer for a retry exactly as they answer for a rotation, without this seam
 * having to be handed the turn's clock, and without a retry ever being granted
 * more than the single attempt the caller had already paid for.
 */
function impliedTurnElapsedMs(grantedFirstTokenMs: number, sinceStartMs: number): number {
  return TURN_FIRST_TOKEN_BUDGET_MS - grantedFirstTokenMs + sinceStartMs;
}

/**
 * Classes `classifyError` calls retryable that a SAME-ROUTE retry cannot fix.
 *
 * `retryable` answers a broader question than this seam asks. `withRetry` may
 * retry a 401 because the layer around it can refresh a credential, and a
 * `context_overflow` because it shrinks `maxTokensOverride` first. This seam
 * re-sends the identical request on the identical route with the identical
 * key, so both are a guaranteed second failure that spends the turn's
 * first-token budget and buys the user nothing.
 */
const NEVER_RETRY_SAME_ROUTE: ReadonlySet<ErrorCategory> = new Set<ErrorCategory>([
  'auth',
  'context_overflow',
]);

interface SameRouteRetryState {
  attempt: number;
  expired: boolean;
  aborted: boolean;
  grantedFirstTokenMs: number | undefined;
  elapsedMs: number;
}

/** How long to wait before retrying the same route, or `null` to give up. */
function sameRouteRetryDelayMs(error: unknown, state: SameRouteRetryState): number | null {
  if (state.expired || state.aborted) return null;
  const classified = classifyError(error);
  if (!classified.retryable) return null;
  if (NEVER_RETRY_SAME_ROUTE.has(classified.category)) return null;
  const maxAttempts =
    classified.category === 'server_overload'
      ? MAX_OVERLOAD_RETRIES
      : MAX_SAME_ROUTE_RETRY_ATTEMPTS;
  if (state.attempt >= maxAttempts) return null;

  const delayMs = Math.min(
    computeDelay(state.attempt, classified.retryAfterSeconds, BASE_DELAY_MS, MAX_BACKOFF_MS),
    MAX_BACKOFF_MS,
  );
  if (state.grantedFirstTokenMs === undefined) return delayMs;

  const turnElapsedMs = impliedTurnElapsedMs(state.grantedFirstTokenMs, state.elapsedMs);
  if (!hasFirstTokenBudgetLeft(turnElapsedMs)) return null;
  // A wait that leaves less than a child deadline behind buys the user nothing
  // but a slower failure, so it is not a retry worth taking.
  const roomMs = TURN_FIRST_TOKEN_BUDGET_MS - turnElapsedMs - MIN_CHILD_DEADLINE_MS;
  if (roomMs <= 0) return null;
  return Math.min(delayMs, roomMs);
}

/**
 * Start a provider stream, retrying the SAME route while nothing has reached
 * the client.
 *
 * `startProviderStream` peeks the first chunk and throws when it is an error,
 * so the catch below is reached only on an attempt that emitted nothing. That
 * makes it the one place a transient 529 or 503 can be re-tried on the route
 * the user actually chose, instead of costing them a rotation onto a worse
 * model. Once the peek succeeds the attempt is committed: failures from there
 * on flow out of the iterator untouched.
 */
export async function startProviderStreamWithinTurnDeadlines(
  adapter: ProviderAdapter,
  chatRequest: ChatRequest,
  signal: AbortSignal,
  mapError: (chunk: Extract<StreamChunk, { type: 'error' }>) => Error,
  bounds: ProviderDeadlineBounds,
): Promise<AsyncIterable<StreamChunk>> {
  const startedAt = Date.now();
  const grantedFirstTokenMs = bounds.firstTokenMs;
  const model = bounds.model ?? chatRequest.model;

  for (let attempt = 1; ; attempt++) {
    const sinceStartMs = Date.now() - startedAt;
    const armed = armProviderDeadlines(
      {
        ...bounds,
        model,
        ...(grantedFirstTokenMs !== undefined
          ? {
              firstTokenMs: Math.min(
                grantedFirstTokenMs,
                firstTokenDeadlineMs(impliedTurnElapsedMs(grantedFirstTokenMs, sinceStartMs)),
              ),
            }
          : {}),
        ...(bounds.streamMs !== undefined
          ? {
              streamMs: Math.min(
                bounds.streamMs,
                nestedDeadlineMs(bounds.streamMs, bounds.streamMs, sinceStartMs),
              ),
            }
          : {}),
      },
      signal,
    );
    let chunks: AsyncIterable<StreamChunk>;
    try {
      chunks = await startProviderStream(adapter, chatRequest, armed.signal, mapError);
    } catch (error) {
      armed.abort(error);
      armed.release();
      const failure = armed.expiry() ?? error;
      const delayMs = sameRouteRetryDelayMs(failure, {
        attempt,
        expired: armed.expiry() !== undefined,
        aborted: signal.aborted,
        grantedFirstTokenMs,
        elapsedMs: Date.now() - startedAt,
      });
      if (delayMs === null) throw failure;
      try {
        await sleep(delayMs, signal);
      } catch {
        throw failure;
      }
      continue;
    }
    armed.markFirstToken();
    return {
      async *[Symbol.asyncIterator](): AsyncIterator<StreamChunk> {
        try {
          for await (const chunk of chunks) yield chunk;
        } catch (error) {
          throw armed.expiry() ?? error;
        } finally {
          armed.release();
        }
      },
    };
  }
}

export async function* markFirstProviderChunk(
  chunks: AsyncIterable<StreamChunk>,
  markFirstToken: () => void,
): AsyncIterable<StreamChunk> {
  let marked = false;
  for await (const chunk of chunks) {
    if (!marked) {
      marked = true;
      markFirstToken();
    }
    yield chunk;
  }
}
