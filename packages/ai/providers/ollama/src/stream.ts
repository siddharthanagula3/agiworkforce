import type { StreamChunk } from '@agiworkforce/types';

import type { OllamaChatStreamChunk } from './types';

function isOllamaChatStreamChunk(value: unknown): value is OllamaChatStreamChunk {
  if (typeof value !== 'object' || value === null) return false;
  const message = (value as { message?: unknown }).message;
  if (message !== undefined && (typeof message !== 'object' || message === null)) return false;
  return true;
}

// Recognised by identity in the translator below, which is the only consumer.
const PARSE_ERROR_SENTINEL: OllamaChatStreamChunk = { done: false } as OllamaChatStreamChunk;

const STREAM_PARSE_ERROR_CODE = 'stream_parse_error';
const STREAM_PARSE_ERROR_MESSAGE = 'The response stream carried a frame that could not be read.';

export async function* parseOllamaStream(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<OllamaChatStreamChunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);
        if (!line) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          yield PARSE_ERROR_SENTINEL;
          continue;
        }
        if (!isOllamaChatStreamChunk(parsed)) {
          yield PARSE_ERROR_SENTINEL;
          continue;
        }
        yield parsed;
      }
    }
    const trailing = buffer.trim();
    if (trailing) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(trailing);
      } catch {
        yield PARSE_ERROR_SENTINEL;
        return;
      }
      if (isOllamaChatStreamChunk(parsed)) {
        yield parsed;
      } else {
        yield PARSE_ERROR_SENTINEL;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// `stop` is terminal: the first done frame closes the turn and nothing the
// upstream sends afterwards reaches the consumer.
export async function* translateOllamaStream(
  chunks: AsyncIterable<OllamaChatStreamChunk>,
): AsyncIterable<StreamChunk> {
  let toolUseCounter = 0;
  let finished = false;
  let parseFailed = false;
  let pendingUsage: StreamChunk | null = null;
  let stopReason: Extract<StreamChunk, { type: 'stop' }>['reason'] = 'end_turn';
  let threw = false;

  try {
    for await (const chunk of chunks) {
      if (finished) continue;
      if (chunk === PARSE_ERROR_SENTINEL) {
        parseFailed = true;
        continue;
      }
      const message = chunk.message;
      if (message?.thinking) {
        yield { type: 'thinking-delta', delta: message.thinking };
      }
      if (message?.content) {
        yield { type: 'text-delta', delta: message.content };
      }
      if (message?.tool_calls && message.tool_calls.length > 0) {
        for (const call of message.tool_calls) {
          const id = `ollama-tool-${++toolUseCounter}`;
          yield { type: 'tool-use-start', toolUseId: id, name: call.function.name };
          yield {
            type: 'tool-use-delta',
            toolUseId: id,
            deltaJson: JSON.stringify(call.function.arguments),
          };
          yield { type: 'tool-use-end', toolUseId: id };
        }
      }

      if (chunk.done) {
        finished = true;
        pendingUsage = {
          type: 'usage',
          ...(chunk.prompt_eval_count !== undefined
            ? { inputTokens: chunk.prompt_eval_count }
            : {}),
          ...(chunk.eval_count !== undefined ? { outputTokens: chunk.eval_count } : {}),
        };
        stopReason = chunk.done_reason === 'length' ? 'max_tokens' : 'end_turn';
      }
    }
  } catch (error) {
    threw = true;
    throw error;
  } finally {
    if (!threw) {
      if (parseFailed) {
        yield {
          type: 'error',
          message: STREAM_PARSE_ERROR_MESSAGE,
          code: STREAM_PARSE_ERROR_CODE,
          retryable: true,
        };
      }
      if (pendingUsage) yield pendingUsage;
      yield { type: 'stop', reason: parseFailed ? 'error' : stopReason };
    }
  }
}
