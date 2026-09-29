'use client';

import { clientHandshakeHeaders } from '@agiworkforce/cloud-contracts';
import { createManagedChatIdempotencyKey } from '@agiworkforce/utils/managed-chat-idempotency';
import { chatCompletionEndpoint } from '@features/chat/lib/free-quota-selection';
import { getAuthToken } from '@shared/lib/get-auth-token';
import { getBrowserTimeZone } from '@/lib/client/browser-timezone';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { readChatHostContext } from '@/lib/device-steps/host-headers';

const RESOLVED_MODEL_HEADER = 'X-AGI-Resolved-Model';
const DONE_PAYLOAD = '[DONE]';
const FRAME_BOUNDARY = '\n\n';
const DATA_PREFIX = 'data:';
const EVENT_PREFIX = 'event:';
const ERROR_EVENT = 'error';

const NO_BODY_MESSAGE = 'This model sent no answer. Try again.';
const INTERRUPTED_MESSAGE = 'The answer stopped before it finished. Try again.';
const UNREADABLE_MESSAGE = 'This answer arrived in a form the page could not read. Try again.';

export class CompareAnswerError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'CompareAnswerError';
  }
}

export interface CompareAnswerHandlers {
  onStart: (resolvedModelId: string | null) => void;
  onText: (text: string) => void;
}

export interface CompareAnswerOutcome {
  finishReason: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function payloadMessage(payload: unknown): string | null {
  const body = asRecord(payload);
  if (!body) return null;
  const error = body['error'];
  return readText(error) ?? readText(asRecord(error)?.['message']) ?? readText(body['message']);
}

async function httpError(response: Response): Promise<CompareAnswerError> {
  const body: unknown = await response.json().catch(() => null);
  return new CompareAnswerError(payloadMessage(body) ?? `HTTP ${response.status}`, response.status);
}

interface FrameEffect {
  done: boolean;
  text: string;
  finishReason: string | null;
}

function readFrame(frame: string): FrameEffect | null {
  const lines = frame.split('\n');
  const event = lines
    .find((line) => line.startsWith(EVENT_PREFIX))
    ?.slice(EVENT_PREFIX.length)
    .trim();
  const data = lines
    .filter((line) => line.startsWith(DATA_PREFIX))
    .map((line) => line.slice(DATA_PREFIX.length).trimStart())
    .join('\n');
  if (!data) {
    if (event === ERROR_EVENT) throw new CompareAnswerError(INTERRUPTED_MESSAGE);
    return null;
  }
  if (data === DONE_PAYLOAD) return { done: true, text: '', finishReason: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    throw new CompareAnswerError(UNREADABLE_MESSAGE);
  }
  const record = asRecord(parsed);
  if (!record) throw new CompareAnswerError(UNREADABLE_MESSAGE);
  if (event === ERROR_EVENT || record['error'] !== undefined) {
    throw new CompareAnswerError(payloadMessage(record) ?? INTERRUPTED_MESSAGE);
  }

  const choice = Array.isArray(record['choices']) ? asRecord(record['choices'][0]) : null;
  const delta = asRecord(choice?.['delta']);
  const streamError = asRecord(delta?.['x_stream_error']);
  if (streamError) {
    throw new CompareAnswerError(readText(streamError['message']) ?? INTERRUPTED_MESSAGE);
  }
  const content = delta?.['content'];
  const finishReason = choice?.['finish_reason'];
  return {
    done: false,
    text: typeof content === 'string' ? content : '',
    finishReason: typeof finishReason === 'string' ? finishReason : null,
  };
}

export async function streamCompareAnswer(
  modelId: string,
  prompt: string,
  signal: AbortSignal,
  handlers: CompareAnswerHandlers,
): Promise<CompareAnswerOutcome> {
  const host = await readChatHostContext();
  const token = await getAuthToken();
  const headers = await addCsrfHeaders({
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    ...clientHandshakeHeaders({ surface: host.surface, version: undefined }),
    'Idempotency-Key': createManagedChatIdempotencyKey({
      surface: host.surface,
      purpose: 'compare',
      operationId: crypto.randomUUID(),
    }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });

  const response = await fetch(chatCompletionEndpoint(modelId), {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      thinking_mode: false,
      tool_choice: 'none',
      memory_enabled: false,
      connector_tools_enabled: false,
      client_timezone: getBrowserTimeZone(),
    }),
  });
  if (!response.ok) throw await httpError(response);

  handlers.onStart(response.headers.get(RESOLVED_MODEL_HEADER)?.trim() || null);
  const reader = response.body?.getReader();
  if (!reader) throw new CompareAnswerError(NO_BODY_MESSAGE);

  const decoder = new TextDecoder();
  let pending = '';
  let finishReason: string | null = null;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      pending = (
        pending + (done ? decoder.decode() : decoder.decode(value, { stream: true }))
      ).replaceAll('\r\n', '\n');
      let boundary = pending.indexOf(FRAME_BOUNDARY);
      while (boundary !== -1) {
        const effect = readFrame(pending.slice(0, boundary));
        pending = pending.slice(boundary + FRAME_BOUNDARY.length);
        if (effect?.done) return { finishReason };
        if (effect?.text) handlers.onText(effect.text);
        if (effect?.finishReason) finishReason = effect.finishReason;
        boundary = pending.indexOf(FRAME_BOUNDARY);
      }
      if (done) break;
    }
    const tail = pending.trim() ? readFrame(pending.trim()) : null;
    if (tail?.text) handlers.onText(tail.text);
    const settled = tail?.finishReason ?? finishReason;
    if (tail?.done || settled) return { finishReason: settled };
    throw new CompareAnswerError(INTERRUPTED_MESSAGE);
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
