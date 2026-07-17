/**
 * Gemini SSE stream → StreamChunk translation.
 *
 * `:streamGenerateContent?alt=sse` emits one SSE event per chunk, each a
 * full `GeminiStreamChunk` object with the latest delta in
 * `candidates[0].content.parts`. Gemini doesn't emit incremental tool-call
 * argument deltas; a complete `functionCall` arrives in one part. We
 * synthesize tool-use-start / tool-use-delta / tool-use-end as a triple.
 *
 * `candidates[0].groundingMetadata.groundingChunks` (Google Search grounding
 * sources) translates to one `server-tool-result` chunk, emitted at most
 * once per stream (task #34's Google slice) -- see the inline comment at its
 * call site for why the payload is pre-shaped here rather than passed
 * through verbatim.
 */

import type { StreamChunk } from '@agiworkforce/types';

import type { GeminiStreamChunk } from './types';

// AUDIT-FIX: M-1 — structural validation guard for Gemini chunks; emit sentinel on failure.
function isGeminiStreamChunk(value: unknown): value is GeminiStreamChunk {
  if (typeof value !== 'object' || value === null) return false;
  const candidates = (value as { candidates?: unknown }).candidates;
  const promptFeedback = (value as { promptFeedback?: unknown }).promptFeedback;
  const usageMetadata = (value as { usageMetadata?: unknown }).usageMetadata;
  if (candidates !== undefined && !Array.isArray(candidates)) return false;
  if (
    promptFeedback !== undefined &&
    (typeof promptFeedback !== 'object' || promptFeedback === null)
  )
    return false;
  if (usageMetadata !== undefined && (typeof usageMetadata !== 'object' || usageMetadata === null))
    return false;
  return true;
}

const PARSE_ERROR_SENTINEL = {
  candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [] } }],
} as unknown as GeminiStreamChunk;

/**
 * `hasToolCall` mirrors apps/web/lib/llm-providers/google.ts's legacy
 * override: `const finishReason = functionCallParts.length > 0 ? 'tool_calls'
 * : candidate.finishReason.toLowerCase();`. Gemini has no distinct
 * tool-calling finish reason of its own -- a turn that ends in a
 * `functionCall` still reports the generic `'STOP'` -- so without this
 * override every Gemini tool call maps to `'end_turn'`/`'stop'` instead of
 * `'tool_calls'`. BUG FOUND in this migration (task #34's Google slice,
 * caught by stream-transform.google-byte-parity.test.ts's byte diff against
 * the legacy wire): this canonical adapter never had the override, and this
 * file has no existing test that would have caught it. `mapFinishReason`'s
 * own return type already included `'tool_use'` as an option, suggesting it
 * was meant to be reachable and simply never wired up. LIVE BLAST RADIUS:
 * `services/api-gateway/src/lib/providerAdapters.ts` already dispatches
 * Gemini through this exact adapter in production -- any Gemini tool-calling
 * turn proxied through api-gateway (mobile, and any other satellite client
 * routed through it) could never correctly signal `finish_reason:
 * 'tool_calls'`, so callers that gate tool execution on that field would
 * silently never execute a Gemini-requested tool call. Fixed here, not
 * filed as a disclosed gap, because unlike the tool-loop.ts thinking-
 * continuity gap this has a small, unambiguous, already-legacy-proven fix
 * (match google.ts's own override exactly) and a real, not-gated,
 * already-shipped consumer.
 */
function mapFinishReason(
  reason: string | undefined,
  hasToolCall: boolean,
): 'end_turn' | 'max_tokens' | 'tool_use' | 'stop_sequence' | 'error' | 'cancel' {
  if (hasToolCall) return 'tool_use';
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

      // Normalize CRLF to LF before frame-splitting. The LIVE Gemini
      // `alt=sse` wire separates frames with `\r\n\r\n` (verified byte-level
      // 2026-07-10); the previous LF-only `indexOf('\n\n')` never matched, so
      // EVERY real chunk fell through to the trailing-buffer path as one
      // unparseable multi-event blob -> PARSE_ERROR_SENTINEL -> all text /
      // grounding / usage silently dropped (only a synthetic stop survived).
      // Recorded LF-framed fixtures kept the byte-parity tests green, which
      // is why this only surfaced on a live run. A trailing lone '\r' is held
      // back so a CR/LF pair split across two reads still normalizes.
      const holdCr = buffer.endsWith('\r') ? '\r' : '';
      if (holdCr) buffer = buffer.slice(0, -1);
      buffer = buffer.replace(/\r\n/g, '\n') + holdCr;

      // SSE frames separated by blank lines. Gemini sends `data: <json>` frames.
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
        // AUDIT-FIX: M-1 — parse + validate; emit sentinel chunk on either failure.
        let parsed: unknown;
        try {
          parsed = JSON.parse(data);
        } catch {
          yield PARSE_ERROR_SENTINEL;
          continue;
        }
        if (!isGeminiStreamChunk(parsed)) {
          yield PARSE_ERROR_SENTINEL;
          continue;
        }
        yield parsed;
      }
    }
    // Trailing buffer, if any.
    const trailing = buffer.trim();
    if (trailing) {
      const trimmed = trailing.startsWith('data:') ? trailing.slice(5).trimStart() : trailing;
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        yield PARSE_ERROR_SENTINEL;
        return;
      }
      if (isGeminiStreamChunk(parsed)) {
        yield parsed;
      } else {
        yield PARSE_ERROR_SENTINEL;
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
  let lastFinishHadToolCall = false;
  let lastUsage: GeminiStreamChunk['usageMetadata'] | undefined;
  // Mirrors apps/web/lib/llm-providers/google.ts's `groundingEmitted` flag:
  // Gemini can repeat the same groundingChunks on more than one SSE event
  // for a single grounded answer; the legacy wire surfaced the source cards
  // exactly once per turn, not once per repeated event.
  let groundingEmitted = false;

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

    // Legacy apps/web/lib/llm-providers/google.ts processes a chunk's text
    // parts BEFORE checking groundingMetadata (both can be present on the
    // SAME chunk -- a grounded answer's final text delta commonly carries
    // its sources too) -- matched here (grounding emission moved below the
    // parts loop) so a chunk with both produces the same event ORDER, not
    // just the same event set.
    const parts = candidate.content?.parts ?? [];
    const chunkHasToolCall = parts.some((part) => !!part.functionCall);
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

    // Google Search grounding sources, reshaped to the same {type, url,
    // title, position} shape (1-based position) the legacy web route's
    // x_search_results delta used -- see openai-wire-compat.ts's
    // `gemini_grounding_result` payload discriminator. The payload is NOT
    // Gemini's raw groundingChunks verbatim (unlike Anthropic's server-
    // tool-result, which passes its native content_block through untouched)
    // because Gemini's `{web:{uri,title}}` shape has no cross-vendor or
    // legacy-wire meaning on its own; the reshaping has to happen somewhere,
    // and doing it here (where the vendor shape is known) keeps
    // OpenAIWireAssembler provider-agnostic (shape-dispatch only, same as
    // its existing web_search_tool_result/code_execution_tool_result split).
    const groundingChunks = candidate.groundingMetadata?.groundingChunks;
    if (!groundingEmitted && Array.isArray(groundingChunks) && groundingChunks.length > 0) {
      const results = groundingChunks
        .map((gc) => gc?.web)
        .filter((web): web is { uri: string; title?: string } => !!web?.uri)
        .map((web, idx) => ({
          type: 'web_search_result' as const,
          url: web.uri,
          title: web.title || web.uri,
          position: idx + 1,
        }));
      if (results.length > 0) {
        groundingEmitted = true;
        yield {
          type: 'server-tool-result',
          toolUseId: 'gemini-grounding-1',
          payload: { type: 'gemini_grounding_result', results },
        };
      }
    }

    if (candidate.finishReason) {
      lastFinish = candidate.finishReason;
      // Sampled alongside lastFinish (not independently across the whole
      // stream) to match legacy's exact scope: whether THE FINISH-BEARING
      // CHUNK itself carried a functionCall part, not whether one appeared
      // anywhere earlier in the turn.
      lastFinishHadToolCall = chunkHasToolCall;
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

  yield { type: 'stop', reason: mapFinishReason(lastFinish, lastFinishHadToolCall) };
}
