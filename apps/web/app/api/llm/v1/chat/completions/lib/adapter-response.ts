import 'server-only';

import type { StreamChunk } from '@agiworkforce/types';
import { OpenAIWireAssembler } from '@agiworkforce/provider-protocol';
import { createUsageAccumulator, ingestUsageChunk } from './adapter-usage';

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
 * apiModelId-form ids to the same catalog entry either way (see the shared
 * `toProviderApiModelId` boundary), so this choice is
 * about matching the legacy code's literal logged/recorded string, not cost
 * correctness.
 *
 * Throws (via the caller-supplied `mapError` -- `toUpstreamError` for
 * Anthropic, `toGoogleUpstreamError` for Google, see adapter-errors.ts) if
 * ANY `{type:'error'}` chunk appears anywhere in the sequence -- not just
 * the first, unlike the streaming path's `startProviderStream` (adapter-
 * factory.ts), which only peeks the first chunk. The old non-streaming
 * provider calls (`anthropic.ts`, `google.ts`) were each a single HTTP POST:
 * the non-streaming API either returns a complete response or the request
 * fails outright -- there was never a "partial content, then a failure"
 * outcome to preserve for either provider. Since every non-streaming call
 * here goes through the adapter's `.stream()` internally (there is no
 * separate non-streaming adapter method), treating ANY error chunk as a
 * hard failure (rather than returning whatever partial text/tokens were
 * produced before it) reproduces that same all-or-nothing contract instead
 * of inventing a new partial-success shape neither legacy API ever had.
 */
export async function drainToLlmResponse(
  chunks: AsyncIterable<StreamChunk>,
  model: string,
  mapError: (chunk: Extract<StreamChunk, { type: 'error' }>) => Error,
  // Defaults to 'legacy-web' for the same reason as buildAdapterStreamResponse's
  // identical parameter -- Anthropic/Google (wired before this parameter
  // existed) are unaffected. response()'s only wireMode-conditional logic is
  // finish_reason (legacyFinishReason vs the standard stopReasonToFinishReason
  // mapping); OpenAI needs the standard one (legacyFinishReason's "never map
  // max_tokens" quirk is Anthropic-specific and wrong for OpenAI's own
  // finish_reason vocabulary), which is why 'openai-passthrough' -- not
  // 'legacy-web' -- must be passed for OpenAI here too, even though
  // response() has no other openai-passthrough-specific behavior (system_
  // fingerprint/logprobs/role-announcement/trailing-usage-chunk are all
  // sseChunks()-only, streaming-only concerns).
  wireMode: 'legacy-web' | 'openai-passthrough' = 'legacy-web',
): Promise<AdapterLlmResponse> {
  const assembler = new OpenAIWireAssembler({ model, wireMode });
  const usage = createUsageAccumulator();
  let firstError: Extract<StreamChunk, { type: 'error' }> | undefined;

  for await (const chunk of chunks) {
    if (chunk.type === 'error' && !firstError) firstError = chunk;
    ingestUsageChunk(usage, chunk);
    assembler.ingest(chunk);
  }

  if (firstError) {
    const mapped = mapError(firstError);
    // Same structured-status carry as startProviderStream (adapter-factory.ts):
    // the shared classifyError reads `.status`, never message text, and
    // managed failover rotates only on availability-class categories.
    const status = firstError.code ? Number(firstError.code) : Number.NaN;
    if (Number.isInteger(status) && status >= 100 && status <= 599) {
      (mapped as Error & { status?: number }).status = status;
    }
    throw mapped;
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
