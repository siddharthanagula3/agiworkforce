import 'server-only';

import type { ChatRequest, ProviderAdapter, StreamChunk } from '@agiworkforce/types';
import {
  PROVIDER_FIRST_TOKEN_DEADLINE_MS,
  TURN_FIRST_TOKEN_BUDGET_MS,
  nestedDeadlineMs,
} from '@/lib/deadline-policy';
import { startProviderStream } from './adapter-factory';

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

export async function startProviderStreamWithinTurnDeadlines(
  adapter: ProviderAdapter,
  chatRequest: ChatRequest,
  signal: AbortSignal,
  mapError: (chunk: Extract<StreamChunk, { type: 'error' }>) => Error,
  bounds: ProviderDeadlineBounds,
): Promise<AsyncIterable<StreamChunk>> {
  const armed = armProviderDeadlines(
    { ...bounds, model: bounds.model ?? chatRequest.model },
    signal,
  );
  let chunks: AsyncIterable<StreamChunk>;
  try {
    chunks = await startProviderStream(adapter, chatRequest, armed.signal, mapError);
  } catch (error) {
    armed.abort(error);
    armed.release();
    throw armed.expiry() ?? error;
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
