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

export function withProviderDeadlines<T>(
  run: (signal: AbortSignal, markFirstToken: () => void) => Promise<T>,
  bounds: ProviderDeadlineBounds,
  parentSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const forwardParentAbort = (): void => controller.abort(parentSignal?.reason);
  let streamTimer: ReturnType<typeof setTimeout> | undefined;
  let firstTokenTimer: ReturnType<typeof setTimeout> | undefined;
  const clearFirstTokenTimer = (): void => {
    if (firstTokenTimer !== undefined) clearTimeout(firstTokenTimer);
    firstTokenTimer = undefined;
  };
  const cleanup = (): void => {
    if (streamTimer !== undefined) clearTimeout(streamTimer);
    clearFirstTokenTimer();
    parentSignal?.removeEventListener('abort', forwardParentAbort);
  };
  if (parentSignal?.aborted) forwardParentAbort();
  else parentSignal?.addEventListener('abort', forwardParentAbort, { once: true });

  return new Promise<T>((resolve, reject) => {
    const expire = (error: Error): void => {
      controller.abort(error);
      cleanup();
      reject(error);
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
    run(controller.signal, clearFirstTokenTimer).then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        controller.abort(error);
        cleanup();
        reject(error);
      },
    );
  });
}

export function startProviderStreamWithinFirstTokenDeadline(
  adapter: ProviderAdapter,
  chatRequest: ChatRequest,
  signal: AbortSignal,
  mapError: (chunk: Extract<StreamChunk, { type: 'error' }>) => Error,
  deadlineMs: number,
): Promise<AsyncIterable<StreamChunk>> {
  return withProviderDeadlines(
    (derived) => startProviderStream(adapter, chatRequest, derived, mapError),
    { firstTokenMs: deadlineMs, model: chatRequest.model },
    signal,
  );
}
