import type { StreamChunk } from '@agiworkforce/types';

import type {
  GeminiGroundingChunk,
  GeminiGroundingSupport,
  GeminiStreamChunk,
  GeminiUrlContextMetadata,
} from './types';

const GEMINI_CITATION_BLOCK_INDEX = 0;
const GEMINI_URL_RETRIEVAL_STATUS_SUCCESS = 'URL_RETRIEVAL_STATUS_SUCCESS';
const URL_CITATION_KIND = 'url_citation';

interface GroundedCitation {
  url: string;
  title: string;
  startIndex?: number;
  endIndex?: number;
}

function hostnameCitationTitle(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return hostname || url;
  } catch {
    return url;
  }
}

function citationFromGroundingChunk(
  chunk: GeminiGroundingChunk | undefined,
): GroundedCitation | undefined {
  const uri = chunk?.web?.uri;
  if (!uri) return undefined;
  const title = chunk?.web?.title;
  return { url: uri, title: title || hostnameCitationTitle(uri) };
}

function citationsFromGrounding(
  groundingChunks: GeminiGroundingChunk[],
  groundingSupports: GeminiGroundingSupport[] | undefined,
): GroundedCitation[] {
  if (!groundingSupports || groundingSupports.length === 0) {
    return groundingChunks
      .map((chunk) => citationFromGroundingChunk(chunk))
      .filter((citation): citation is GroundedCitation => citation !== undefined);
  }
  const citations: GroundedCitation[] = [];
  for (const support of groundingSupports) {
    for (const chunkIndex of support.groundingChunkIndices ?? []) {
      const citation = citationFromGroundingChunk(groundingChunks[chunkIndex]);
      if (!citation) continue;
      citations.push({
        ...citation,
        ...(support.segment?.startIndex !== undefined
          ? { startIndex: support.segment.startIndex }
          : {}),
        ...(support.segment?.endIndex !== undefined ? { endIndex: support.segment.endIndex } : {}),
      });
    }
  }
  return citations;
}

function citationsFromUrlContext(
  metadata: GeminiUrlContextMetadata | undefined,
): GroundedCitation[] {
  const entries = metadata?.urlMetadata ?? [];
  const citations: GroundedCitation[] = [];
  for (const entry of entries) {
    if (entry.urlRetrievalStatus !== GEMINI_URL_RETRIEVAL_STATUS_SUCCESS || !entry.retrievedUrl) {
      continue;
    }
    citations.push({ url: entry.retrievedUrl, title: hostnameCitationTitle(entry.retrievedUrl) });
  }
  return citations;
}

function citationChunk(
  citation: GroundedCitation,
): Extract<StreamChunk, { type: 'citation-delta' }> {
  return {
    type: 'citation-delta',
    blockIndex: GEMINI_CITATION_BLOCK_INDEX,
    payload: {
      type: URL_CITATION_KIND,
      url: citation.url,
      title: citation.title,
      ...(citation.startIndex !== undefined ? { start_index: citation.startIndex } : {}),
      ...(citation.endIndex !== undefined ? { end_index: citation.endIndex } : {}),
    },
  };
}

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

function mapFinishReason(
  reason: string | undefined,
  hasToolCall: boolean,
): 'end_turn' | 'max_tokens' | 'tool_use' | 'stop_sequence' | 'refusal' | 'error' | 'cancel' {
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
      return 'refusal';
    default:
      return 'error';
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

      const holdCr = buffer.endsWith('\r') ? '\r' : '';
      if (holdCr) buffer = buffer.slice(0, -1);
      buffer = buffer.replace(/\r\n/g, '\n') + holdCr;

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
  let blockReason: string | undefined;
  let turnHadToolCall = false;
  let lastUsage: GeminiStreamChunk['usageMetadata'] | undefined;
  let groundingEmitted = false;
  const emittedCitationUrls = new Set<string>();

  for await (const chunk of chunks) {
    if (chunk.usageMetadata) {
      lastUsage = chunk.usageMetadata;
    }
    if (chunk.promptFeedback?.blockReason) {
      blockReason = chunk.promptFeedback.blockReason;
      yield {
        type: 'error',
        message: `Prompt blocked: ${chunk.promptFeedback.blockReason}`,
        code: 'prompt_blocked',
      };
    }

    const candidate = chunk.candidates?.[0];
    if (!candidate) continue;

    const parts = candidate.content?.parts ?? [];
    const chunkHasToolCall = parts.some((part) => !!part.functionCall);
    turnHadToolCall ||= chunkHasToolCall;
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

    const groundingChunks = candidate.groundingMetadata?.groundingChunks;
    if (!groundingEmitted && Array.isArray(groundingChunks) && groundingChunks.length > 0) {
      const results = groundingChunks
        .map((gc) => gc?.web)
        .filter((web): web is { uri: string; title?: string } => !!web?.uri)
        .map((web, idx) => ({
          type: 'web_search_result' as const,
          url: web.uri,
          title: web.title || '',
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

    const groundedCitations = Array.isArray(groundingChunks)
      ? citationsFromGrounding(groundingChunks, candidate.groundingMetadata?.groundingSupports)
      : [];
    const urlContextCitations = citationsFromUrlContext(candidate.urlContextMetadata);
    for (const citation of [...groundedCitations, ...urlContextCitations]) {
      if (emittedCitationUrls.has(citation.url)) continue;
      emittedCitationUrls.add(citation.url);
      yield citationChunk(citation);
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

  const effectiveFinish = lastFinish ?? blockReason;
  yield {
    type: 'stop',
    reason: mapFinishReason(effectiveFinish, turnHadToolCall),
    ...(effectiveFinish !== undefined ? { providerFinishReason: effectiveFinish } : {}),
  };
}
