/**
 * Ollama NDJSON stream → StreamChunk translation.
 *
 * Ollama returns one JSON object per line, terminating when `done: true`. We
 * accumulate text deltas and emit `text-delta` chunks, then a final `usage`
 * + `stop` pair from the trailing record (which carries timing + token counts).
 *
 * Ollama doesn't stream tool-call deltas — it returns a single complete
 * `tool_calls` array on a non-final chunk. We synthesize tool-use-start +
 * tool-use-delta + tool-use-end events from that single chunk.
 */

import type { StreamChunk } from '@agiworkforce/types';

import type { OllamaChatStreamChunk } from './types';

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
        try {
          yield JSON.parse(line) as OllamaChatStreamChunk;
        } catch {
          // Skip malformed line; Ollama is normally well-behaved here.
        }
      }
    }
    // Flush trailing buffer (no trailing newline).
    const trailing = buffer.trim();
    if (trailing) {
      try {
        yield JSON.parse(trailing) as OllamaChatStreamChunk;
      } catch {
        // ignore
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

  for await (const chunk of chunks) {
    const message = chunk.message;
    if (message?.thinking) {
      yield { type: 'thinking-delta', delta: message.thinking };
    }
    if (message?.content) {
      yield { type: 'text-delta', delta: message.content };
    }
    if (message?.tool_calls && message.tool_calls.length > 0) {
      // Ollama emits complete tool_calls in one shot; synthesize start/delta/end.
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
        ...(chunk.prompt_eval_count !== undefined ? { inputTokens: chunk.prompt_eval_count } : {}),
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
    }
  }
}
