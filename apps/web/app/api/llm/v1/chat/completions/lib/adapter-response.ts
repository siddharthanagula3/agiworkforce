import 'server-only';

import type { StreamChunk } from '@agiworkforce/types';
import { OpenAIWireAssembler } from '@agiworkforce/llm-normalize';
import { createUsageAccumulator, ingestUsageChunk } from './adapter-usage';
import { toUpstreamError } from './adapter-errors';

/**
 * Flat shape `buildNonStreamResponse` (response-builder.ts) expects for its
 * `llmResponse` parameter -- copied from that function's inline parameter
 * type rather than imported, since response-builder.ts intentionally stays
 * provider-agnostic and unchanged by this migration (see its own docstring
 * history / task #34): duplicating the shape here is cheaper than adding a
 * shared-type dependency to a file whose whole value is staying untouched.
 */
export interface AdapterLlmResponse {
  model: string;
  content: string;
  tool_calls?: unknown;
  finishReason?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  reasoningOutputTokens?: number;
  cacheCreationInputTokens?: number;
  cacheCreation1hInputTokens?: number;
  cachedInputTokens?: number;
  citations?: unknown[];
  search_results?: unknown[];
}

/**
 * Drain a full `AsyncIterable<StreamChunk>` (one adapter `.stream()` call,
 * consumed to completion for a non-streaming client request) into the flat
 * shape `buildNonStreamResponse` expects.
 *
 * `model` here is the BILLING/analytics model id -- pass the canonical
 * (client-facing) model, e.g. `processed.llmRequest.model`, not the
 * apiModelId `toCanonicalChatRequest` sent to the provider. Mirrors the
 * legacy non-streaming path exactly: `buildNonStreamResponse` only reads
 * `llmResponse.model` for `LLMCostCalculator.calculateCost` / cache-savings /
 * `recordModelUsage` / OTel attributes, never for the wire response's own
 * top-level `model` field (that's `usedFallback ? chatRequest.model :
 * requestedModel`, computed independently inside `buildNonStreamResponse`
 * from `processed`) -- so what's passed here never reaches the client.
 * `LLMCostCalculator`/`getModelMetadataById` resolve dot-form and
 * apiModelId-form ids to the same catalog entry either way (see
 * `canonical-request.ts`'s `toApiModelId` docstring), so this choice is
 * about matching the legacy code's literal logged/recorded string, not cost
 * correctness.
 *
 * Throws (via `toUpstreamError`) if ANY `{type:'error'}` chunk appears
 * anywhere in the sequence -- not just the first, unlike the streaming
 * path's `startAnthropicStream` (adapter-factory.ts), which only peeks the
 * first chunk. The old non-streaming `anthropic.ts` was a single HTTP POST:
 * Anthropic's non-streaming API either returns a complete response or the
 * request fails outright -- there was never a "partial content, then a
 * failure" outcome to preserve. Since every non-streaming call here goes
 * through the adapter's `.stream()` internally (there is no separate
 * non-streaming adapter method), treating ANY error chunk as a hard failure
 * (rather than returning whatever partial text/tokens were produced before
 * it) reproduces that same all-or-nothing contract instead of inventing a
 * new partial-success shape the legacy API never had.
 */
export async function drainToLlmResponse(
  chunks: AsyncIterable<StreamChunk>,
  model: string,
): Promise<AdapterLlmResponse> {
  const assembler = new OpenAIWireAssembler({ model, wireMode: 'legacy-web' });
  const usage = createUsageAccumulator();
  let firstError: Extract<StreamChunk, { type: 'error' }> | undefined;

  for await (const chunk of chunks) {
    if (chunk.type === 'error' && !firstError) firstError = chunk;
    ingestUsageChunk(usage, chunk);
    assembler.ingest(chunk);
  }

  if (firstError) {
    throw toUpstreamError(firstError);
  }

  const response = assembler.response();
  const choices = response['choices'] as Array<Record<string, unknown>> | undefined;
  const choice = choices?.[0];
  const message = choice?.['message'] as Record<string, unknown> | undefined;

  return {
    model,
    // assembler.response()'s message.content is `null` for an empty/tool-
    // only turn (modern OpenAI convention). The legacy anthropic.ts always
    // returned the joined text blocks -- `''` when there were none, never
    // `null` (`textContent = textBlocks.map(b => b.text || '').join('')`).
    // Coalesce back to match; verified there is no fixture anywhere in this
    // migration that exercises a tool-only (zero text blocks) non-streaming
    // response, so this was reasoned from source, not golden-captured --
    // flagged, not silently assumed safe.
    content: typeof message?.['content'] === 'string' ? (message['content'] as string) : '',
    tool_calls: message?.['tool_calls'],
    finishReason:
      typeof choice?.['finish_reason'] === 'string'
        ? (choice['finish_reason'] as string)
        : undefined,
    promptTokens: usage.inputTokens,
    completionTokens: usage.outputTokens,
    totalTokens: usage.inputTokens + usage.outputTokens,
    reasoningOutputTokens: usage.reasoningOutputTokens,
    cacheCreationInputTokens: usage.cacheCreationInputTokens,
    cacheCreation1hInputTokens: usage.cacheCreation1hInputTokens,
    cachedInputTokens: usage.cacheReadInputTokens,
    citations: response['citations'] as unknown[] | undefined,
    search_results: response['search_results'] as unknown[] | undefined,
  };
}
