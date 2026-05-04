/**
 * Gemini SSE stream → StreamChunk translation.
 *
 * `:streamGenerateContent?alt=sse` emits one SSE event per chunk, each a
 * full `GeminiStreamChunk` object with the latest delta in
 * `candidates[0].content.parts`. Gemini doesn't emit incremental tool-call
 * argument deltas; a complete `functionCall` arrives in one part. We
 * synthesize tool-use-start / tool-use-delta / tool-use-end as a triple.
 */

import type { StreamChunk } from '@agiworkforce/types';

import type { GeminiStreamChunk } from './types';

function mapFinishReason(
  reason: string | undefined,
): 'end_turn' | 'max_tokens' | 'tool_use' | 'stop_sequence' | 'error' | 'cancel' {
  switch (reason) {
    case 'STOP':
      return 'end_turn';
    case 'MAX_TOKENS':
      return 'max_tokens';
    case 'SAFETY':
    case 'RECITATION':
    case 'BLOCKLIST':
    case 'PROHIBITED_CONTENT':
    case 'SPII':
    case 'IMAGE_SAFETY':
      return 'error';
    default:
      return 'end_turn';
  }
}

export async function* parseGeminiStream(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<GeminiStreamChunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames separated by blank lines. Gemini sends `data: <json>\n\n`.
      let frameEnd: number;
      while ((frameEnd = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, frameEnd);
        buffer = buffer.slice(frameEnd + 2);
        const dataLines = frame
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trimStart());
        const data = dataLines.join('\n').trim();
        if (!data) continue;
        try {
          yield JSON.parse(data) as GeminiStreamChunk;
        } catch {
          // Skip malformed frames; production Gemini is well-behaved here.
        }
      }
    }
    // Trailing buffer, if any.
    const trailing = buffer.trim();
    if (trailing) {
      const trimmed = trailing.startsWith('data:') ? trailing.slice(5).trimStart() : trailing;
      try {
        yield JSON.parse(trimmed) as GeminiStreamChunk;
      } catch {
        // ignore
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function* translateGeminiStream(
  chunks: AsyncIterable<GeminiStreamChunk>,
): AsyncIterable<StreamChunk> {
  let toolCounter = 0;
  let lastFinish: string | undefined;
  let lastUsage: GeminiStreamChunk['usageMetadata'] | undefined;

  for await (const chunk of chunks) {
    if (chunk.usageMetadata) {
      lastUsage = chunk.usageMetadata;
    }
    if (chunk.promptFeedback?.blockReason) {
      yield {
        type: 'error',
        message: `Prompt blocked: ${chunk.promptFeedback.blockReason}`,
        code: 'prompt_blocked',
      };
    }

    const candidate = chunk.candidates?.[0];
    if (!candidate) continue;

    const parts = candidate.content?.parts ?? [];
    for (const part of parts) {
      if (part.thought && part.text) {
        yield {
          type: 'thinking-delta',
          delta: part.text,
          ...(part.thoughtSignature ? { signature: part.thoughtSignature } : {}),
        };
        continue;
      }
      if (part.text) {
        yield { type: 'text-delta', delta: part.text };
        continue;
      }
      if (part.functionCall) {
        const id = `gemini-tool-${++toolCounter}`;
        yield { type: 'tool-use-start', toolUseId: id, name: part.functionCall.name };
        yield {
          type: 'tool-use-delta',
          toolUseId: id,
          deltaJson: JSON.stringify(part.functionCall.args ?? {}),
        };
        yield { type: 'tool-use-end', toolUseId: id };
      }
    }

    if (candidate.finishReason) {
      lastFinish = candidate.finishReason;
    }
  }

  if (lastUsage) {
    const usageChunk: StreamChunk = {
      type: 'usage',
      ...(lastUsage.promptTokenCount !== undefined
        ? { inputTokens: lastUsage.promptTokenCount }
        : {}),
      ...(lastUsage.candidatesTokenCount !== undefined
        ? { outputTokens: lastUsage.candidatesTokenCount }
        : {}),
      ...(lastUsage.cachedContentTokenCount !== undefined
        ? { cacheReadTokens: lastUsage.cachedContentTokenCount }
        : {}),
      ...(lastUsage.thoughtsTokenCount !== undefined
        ? { reasoningTokens: lastUsage.thoughtsTokenCount }
        : {}),
    };
    yield usageChunk;
  }

  yield { type: 'stop', reason: mapFinishReason(lastFinish) };
}
