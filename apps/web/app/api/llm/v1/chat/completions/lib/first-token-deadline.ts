import 'server-only';

import type { ChatRequest, ProviderAdapter, StreamChunk } from '@agiworkforce/types';
import {
  PROVIDER_FIRST_TOKEN_DEADLINE_MS,
  TURN_FIRST_TOKEN_BUDGET_MS,
  nestedDeadlineMs,
} from '@/lib/deadline-policy';
import { startProviderStream } from './adapter-factory';

const FIRST_TOKEN_TIMEOUT_ERROR_NAME = 'FirstTokenTimeoutError';

export class FirstTokenTimeoutError extends Error {
  readonly deadlineMs: number;
  readonly model: string;

  constructor(model: string, deadlineMs: number) {
    super(`${model} sent no first token within its ${deadlineMs}ms first-token timeout`);
    this.name = FIRST_TOKEN_TIMEOUT_ERROR_NAME;
    this.deadlineMs = deadlineMs;
    this.model = model;
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

export async function startProviderStreamWithinFirstTokenDeadline(
  adapter: ProviderAdapter,
  chatRequest: ChatRequest,
  signal: AbortSignal,
  mapError: (chunk: Extract<StreamChunk, { type: 'error' }>) => Error,
  deadlineMs: number,
): Promise<AsyncIterable<StreamChunk>> {
  const upstream = new AbortController();
  const relayCallerAbort = (): void => upstream.abort(signal.reason);
  if (signal.aborted) upstream.abort(signal.reason);
  else signal.addEventListener('abort', relayCallerAbort, { once: true });

  let expiry: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    expiry = setTimeout(
      () => reject(new FirstTokenTimeoutError(chatRequest.model, deadlineMs)),
      deadlineMs,
    );
  });

  const started = startProviderStream(adapter, chatRequest, upstream.signal, mapError);

  try {
    return await Promise.race([started, expired]);
  } catch (error) {
    upstream.abort(error);
    void started.then(
      () => undefined,
      () => undefined,
    );
    throw error;
  } finally {
    if (expiry) clearTimeout(expiry);
    signal.removeEventListener('abort', relayCallerAbort);
  }
}
