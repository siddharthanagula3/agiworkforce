import 'server-only';

import type { StreamChunk, ThinkingBlock } from '@agiworkforce/types';
import { OpenAIWireAssembler } from '@agiworkforce/provider-protocol';
import {
  accumulateObservedProviderUsage,
  type ObservedProviderUsage,
} from '@/lib/services/managed-usage-accounting-service';
import { startProviderStream } from './adapter-factory';
import { ADAPTER_PROVIDERS } from './adapter-providers';
import type { ProcessedRequest } from './request-processor';

/**
 * Side-channel a per-step stream fills in as it is drained, carrying the
 * canonical continuity data `collectProviderStream` (tool-loop.ts) cannot
 * recover from the OpenAI-shaped bytes alone: the signed thinking blocks (the
 * `legacy-web` wire renders `thinking-delta`s as literal `<thinking>` text and
 * drops the signature entirely) and the tag-free assistant text. Populated by
 * `chunksToOpenAiSse` from the underlying `StreamChunk`s just before the
 * stream closes, so it is complete by the time the consumer finishes draining.
 * Fixes known-flaw TOOLLOOP-ANTHROPIC-THINKING-CONTINUITY-01.
 */
export interface ToolLoopStepSink {
  thinkingBlocks: ThinkingBlock[];
  text: string;
  /** Request-scoped accumulator shared across every provider step. */
  usage?: ObservedProviderUsage;
}

/**
 * Table-driven per-provider dispatch for the agentic tool-loop (MCP/E2B),
 * task #34's tool-loop slice. Mirrors route.ts's standard-path dispatch
 * (same `ADAPTER_PROVIDERS` table, same `buildAdapter`/`buildChatRequest`/
 * `mapError`/`wireMode` per entry), reshaped for tool-loop.ts's per-step
 * calling convention and its OpenAI-shaped-bytes contract with
 * `collectProviderStream`.
 *
 * GENERALIZED from an Anthropic-only bridge (originally `buildAnthropicTool
 * LoopStream`, kept below as a thin compat wrapper so tool-loop-anthropic.
 * test.ts keeps exercising the Anthropic case through this same generic
 * path unchanged) to cover all 12 `ADAPTER_PROVIDERS` entries, closing the
 * last `LLMProviderFactory` dispatch in the v1 route tree (restructure
 * Wave 2, task #34 completion gate).
 *
 * LATENT BUG FOUND AND FIXED WHEN THE ANTHROPIC CASE WAS FIRST MIGRATED
 * (reported to team-lead, not filed as a separate known-flaw -- fixed in
 * that same pass): the OLD dispatch here was `LLMProviderFactory.
 * streamRequest(provider, ...)`, which for Anthropic returned Anthropic's
 * raw, completely unreshaped native SSE (`content_block_delta`/
 * `message_delta`/etc -- see apps/web/lib/llm-providers/anthropic.ts's
 * `streamRequest`, which does `return response.body` with zero
 * transformation). `collectProviderStream` (tool-loop.ts) only ever
 * understood OpenAI-shaped `.choices[0].delta.content` / `.tool_calls[]` /
 * `.finish_reason` events -- it has no Anthropic-native `content_block_
 * delta` handling at all. So an Anthropic-routed agentic turn could never
 * correctly extract text or tool calls: `finishReason` would never become
 * `'tool_calls'`, tools would never execute, and raw Anthropic bytes would
 * be forwarded to a client expecting OpenAI-shaped SSE. Verified empirically
 * in tool-loop-anthropic.test.ts (a test against the OLD dispatch fails;
 * against this one it passes -- there is no correct legacy baseline to
 * byte-match here, unlike the standard-path Anthropic slice). LATENT, not
 * actively firing: `hasMcpTools`/`hasE2BTools` are both gated in route.ts,
 * so a default deployment likely never exercised this path.
 *
 * The other 11 providers' legacy `LLMProviderFactory.streamRequest` calls
 * returned each vendor's OWN near-OpenAI-shaped SSE (never reshaped by the
 * legacy factory either -- see adapter-providers.ts's `wireMode` docstring:
 * OpenAI + all 9 compat providers never needed Anthropic/Google-style
 * reshaping even on the standard path). Whether `collectProviderStream`
 * happened to tolerate each vendor's raw SSE well enough for tool calls to
 * fire was never verified provider-by-provider before this migration --
 * this generalization removes that uncertainty by giving every provider the
 * SAME `OpenAIWireAssembler`-normalized wire (its own `wireMode`, not always
 * `'legacy-web'`) that route.ts's standard path already proved correct.
 *
 * WHY NOT JUST RETURN `AsyncIterable<StreamChunk>` DIRECTLY: `collectProvider
 * Stream` is deliberately left UNCHANGED (not rewritten against StreamChunk)
 * -- it already has a tested tool-call accumulator (index-keyed, argument-
 * fragment-joining) shared by every provider, all of which speak actual
 * OpenAI-compatible SSE on the wire. Reshaping each provider's chunks into
 * that same OpenAI-shaped byte wire via `OpenAIWireAssembler` (per-provider
 * `wireMode` from `ADAPTER_PROVIDERS`, the same translation
 * `buildAdapterStreamResponse` in stream-transform.ts uses for the standard
 * path) lets `collectProviderStream` consume every provider identically, at
 * the cost of a small amount of duplicated wrapping logic (no TTFT/billing
 * tracking needed here -- tool-loop.ts does neither; it relies solely on
 * request-processor.ts's upfront credit reservation with no per-step
 * reconciliation, confirmed by grep -- so reusing stream-transform.ts's
 * TTFT/billing-entangled version would need extra unused parameters for no
 * gain).
 *
 * ERROR HANDLING: `startProviderStream` eagerly peeks the first chunk and
 * throws a plain `Error` (via the provider's `mapError`) if it's an error
 * chunk (same peek-and-throw pattern as the standard path). That throw
 * propagates out of this function and is caught by `runToolLoop`'s EXISTING
 * try/catch around its provider-call site. The loop reports the failure on its
 * canonical error event and `x_stream_error` channels, then flushes `[DONE]`;
 * it deliberately does not turn provider errors into assistant content. That
 * matters because by step 2+ a 200 response is already committed -- there is
 * no HTTP-error-response path available mid-loop. This function does not
 * duplicate that error-UX decision; it only supplies the throw.
 *
 * ABORTSIGNAL THREADING (AUDIT-FIX BUG-1): this function used to hand the
 * adapter a fresh, NEVER-TRIGGERED `AbortController().signal`, because
 * `ToolLoopOptions` carried no signal at all. Client-disconnect cancellation
 * therefore worked only through the generator's own `.return()` on the next
 * pull -- the in-flight upstream request kept running to completion, so a user
 * who hit Stop (or closed the tab) was still billed for a full generation
 * nobody would ever see, on the two paths that dominate paid usage. The caller
 * now passes `request.signal` through `ToolLoopOptions.signal` /
 * `ResearchLoopOptions.signal`. `signal` stays OPTIONAL: internal callers
 * (durable workflow continuations, unit tests) legitimately have no request to
 * bind to, and for them the previous never-fires behaviour is preserved
 * exactly.
 */
export async function buildToolLoopStream(
  provider: string,
  processed: ProcessedRequest,
  stepRequest: ProcessedRequest['llmRequest'],
  responseModel: string,
  sink?: ToolLoopStepSink,
  signal?: AbortSignal,
): Promise<ReadableStream> {
  const adapterProvider = ADAPTER_PROVIDERS[provider];
  if (!adapterProvider) {
    // Same reasoning as route.ts's standard-path guard: processed.provider
    // is resolved via resolveProviderFromModel's catalog lookup + heuristic
    // fallback chain, which never produces anything outside
    // ADAPTER_PROVIDERS -- unreachable in practice, kept as an explicit,
    // typed failure rather than a silent crash if that invariant ever
    // breaks.
    throw new Error(`Provider "${provider}" is not supported.`);
  }
  const stepProcessed: ProcessedRequest = { ...processed, llmRequest: stepRequest };
  const adapter = adapterProvider.buildAdapter(stepProcessed);
  const chatRequest = adapterProvider.buildChatRequest(stepProcessed);
  const chunks = await startProviderStream(
    adapter,
    chatRequest,
    signal ?? new AbortController().signal,
    adapterProvider.mapError,
  );
  return chunksToOpenAiSse(chunks, responseModel, adapterProvider.wireMode, sink, {
    provider,
    model: stepRequest.model,
  });
}

/**
 * Anthropic-only convenience wrapper, kept so tool-loop-anthropic.test.ts
 * continues to exercise the Anthropic case through `buildToolLoopStream`
 * (the now-generic function) without needing to pass a provider id.
 */
export async function buildAnthropicToolLoopStream(
  processed: ProcessedRequest,
  stepRequest: ProcessedRequest['llmRequest'],
  responseModel: string,
): Promise<ReadableStream> {
  return buildToolLoopStream('anthropic', processed, stepRequest, responseModel);
}

/**
 * Wrap a provider adapter's `AsyncIterable<StreamChunk>` as an OpenAI-shaped
 * SSE byte stream via a FRESH `OpenAIWireAssembler` per call. Fresh is
 * required, not just convenient: the assembler is stateful (tool-call
 * indices, thinking-block state) and tool-loop.ts calls the provider once
 * per agentic step -- reusing one assembler across steps would corrupt that
 * state (e.g. a step-2 tool call would see step-1's tool-index counter).
 *
 * `wireMode` matches the provider's `ADAPTER_PROVIDERS` entry -- Anthropic/
 * Google use `'legacy-web'`, OpenAI + the 9 compat providers use
 * `'openai-passthrough'` (see adapter-providers.ts's docstring).
 *
 * Exported (not module-private) so apps/web/app/api/agents/execute/route.ts
 * can normalize its own per-provider stream onto the same v1 wire shape
 * (restructure Wave 2, task #34 completion gate) without duplicating this
 * assembler-wrapping logic.
 */
export function chunksToOpenAiSse(
  chunks: AsyncIterable<StreamChunk>,
  model: string,
  wireMode: 'legacy-web' | 'openai-passthrough',
  // Optional continuity side-channel (see ToolLoopStepSink). Filled from the
  // assembler's structured capture just before the stream closes — the wire
  // bytes emitted are byte-identical whether or not a sink is passed.
  sink?: ToolLoopStepSink,
  pricing?: { provider: string; model: string },
): ReadableStream<Uint8Array> {
  const assembler = new OpenAIWireAssembler({ model, wireMode });
  const encoder = new TextEncoder();
  let sawUsage = false;
  let usageCommitted = false;
  const streamUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cacheWrite1hTokens: 0,
    reasoningTokens: 0,
  };

  const commitUsage = () => {
    if (usageCommitted || !sawUsage || !sink?.usage) return;
    usageCommitted = true;
    accumulateObservedProviderUsage(sink.usage, streamUsage, pricing);
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of chunks) {
          if (chunk.type === 'usage') {
            sawUsage = true;
            // Some SDKs report input and output counters in separate updates;
            // use the greatest observed final counter per dimension, then add
            // the step exactly once when its stream terminates.
            streamUsage.inputTokens = Math.max(streamUsage.inputTokens, chunk.inputTokens ?? 0);
            streamUsage.outputTokens = Math.max(streamUsage.outputTokens, chunk.outputTokens ?? 0);
            streamUsage.cacheReadTokens = Math.max(
              streamUsage.cacheReadTokens,
              chunk.cacheReadTokens ?? 0,
            );
            streamUsage.cacheWriteTokens = Math.max(
              streamUsage.cacheWriteTokens,
              chunk.cacheWriteTokens ?? 0,
            );
            streamUsage.cacheWrite1hTokens = Math.max(
              streamUsage.cacheWrite1hTokens,
              chunk.cacheWrite1hTokens ?? 0,
            );
            streamUsage.reasoningTokens = Math.max(
              streamUsage.reasoningTokens,
              chunk.reasoningTokens ?? 0,
            );
          }
          const wireEvents = assembler.sseChunks(chunk);
          if (wireEvents.length === 0) continue;
          const lines = wireEvents.map((event) => `data: ${JSON.stringify(event)}`).join('\n');
          controller.enqueue(encoder.encode(lines + '\n\n'));
        }
        // Populate the continuity sink BEFORE close(): the consumer sees the
        // stream's `done` only after close(), so this guarantees the sink is
        // complete by the time it finishes draining. On the error path below
        // the sink stays empty — correct, since the loop breaks on error and
        // never builds the assistant message that would read it.
        if (sink) {
          sink.thinkingBlocks = assembler.canonicalThinkingBlocks();
          sink.text = assembler.canonicalText();
        }
        commitUsage();
        controller.close();
      } catch (err) {
        // A provider can emit billable usage before a late stream failure.
        // Preserve any counters already observed before surfacing the error.
        commitUsage();
        controller.error(err);
      }
    },
  });
}
