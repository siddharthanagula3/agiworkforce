import 'server-only';

import type { StreamChunk } from '@agiworkforce/types';

/**
 * Billing/analytics token accumulator, shared by the streaming
 * (stream-transform.ts's `buildAdapterStreamResponse`) and non-streaming
 * (adapter-response.ts's `drainToLlmResponse`) adapter-path builders so the
 * `StreamChunkUsage` -> billing-field mapping lives in exactly one place.
 *
 * Field names match `LLMCostCalculator.calculateCost`'s `TokenUsage` /
 * `buildNonStreamResponse`'s `llmResponse` parameter (apps/web/lib/services/
 * llm-cost-calculator.ts, response-builder.ts) -- both pre-date this adapter
 * migration and are NOT renamed here to keep this a pure plumbing change.
 */
export interface UsageAccumulator {
  inputTokens: number;
  outputTokens: number;
  reasoningOutputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  cacheCreation1hInputTokens?: number;
}

export function createUsageAccumulator(): UsageAccumulator {
  return { inputTokens: 0, outputTokens: 0 };
}

/**
 * Fold one `StreamChunk` into the accumulator. No-op for every chunk type
 * except `usage`.
 *
 * `inputTokens`/`outputTokens` use `Math.max` against the running total --
 * mirrors the legacy `stream-transform.ts`'s own defensive accumulation
 * (`inputTokens = Math.max(inputTokens, event.usage.input_tokens || 0)`),
 * guarding against a hypothetical provider that emits a partial usage
 * snapshot before a final, larger one. Cache/reasoning fields use direct
 * assignment (last-write-wins), matching the legacy code's handling of
 * those same fields exactly -- it never `Math.max`'d them either.
 *
 * `translateAnthropicStream` (packages/providers/anthropic/src/stream.ts)
 * only ever yields one combined `usage` chunk per stream today, so the
 * choice between `Math.max` and plain assignment is moot for Anthropic
 * specifically -- kept defensive for whatever provider adopts this path next.
 */
export function ingestUsageChunk(acc: UsageAccumulator, chunk: StreamChunk): void {
  if (chunk.type !== 'usage') return;
  if (chunk.inputTokens !== undefined) {
    acc.inputTokens = Math.max(acc.inputTokens, chunk.inputTokens);
  }
  if (chunk.outputTokens !== undefined) {
    acc.outputTokens = Math.max(acc.outputTokens, chunk.outputTokens);
  }
  if (chunk.cacheReadTokens !== undefined) {
    acc.cacheReadInputTokens = chunk.cacheReadTokens;
  }
  if (chunk.cacheWriteTokens !== undefined) {
    acc.cacheCreationInputTokens = chunk.cacheWriteTokens;
  }
  if (chunk.cacheWrite1hTokens !== undefined) {
    acc.cacheCreation1hInputTokens = chunk.cacheWrite1hTokens;
  }
  if (chunk.reasoningTokens !== undefined) {
    acc.reasoningOutputTokens = chunk.reasoningTokens;
  }
}
