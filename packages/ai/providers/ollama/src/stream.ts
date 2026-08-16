
import type { StreamChunk } from '@agiworkforce/types';

import type { OllamaChatStreamChunk } from './types';

function isOllamaChatStreamChunk(value: unknown): value is OllamaChatStreamChunk {
  if (typeof value !== 'object' || value === null) return false;
  const message = (value as { message?: unknown }).message;
  if (message !== undefined && (typeof message !== 'object' || message === null)) return false;
  return true;
}

const PARSE_ERROR_SENTINEL: OllamaChatStreamChunk = {
  done: true,
  done_reason: 'stop',
} as OllamaChatStreamChunk;

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

export async function* translateOllamaStream(
  chunks: AsyncIterable<OllamaChatStreamChunk>,
): AsyncIterable<StreamChunk> {
  let toolUseCounter = 0;
  let stopEmitted = false;

  try {
    for await (const chunk of chunks) {
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
        const usage: StreamChunk = {
          type: 'usage',
          ...(chunk.prompt_eval_count !== undefined
            ? { inputTokens: chunk.prompt_eval_count }
            : {}),
          ...(chunk.eval_count !== undefined ? { outputTokens: chunk.eval_count } : {}),
        };
        yield usage;
        yield {
          type: 'stop',
          reason:
            chunk.done_reason === 'length'
              ? 'max_tokens'
              : chunk.done_reason === 'stop'
                ? 'end_turn'
                : 'end_turn',
        };
        stopEmitted = true;
      }
    }
  } finally {
    if (!stopEmitted) {
      yield { type: 'stop', reason: 'end_turn' };
    }
  }
}
