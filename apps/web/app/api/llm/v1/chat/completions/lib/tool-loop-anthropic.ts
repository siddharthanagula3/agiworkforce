import 'server-only';

import type { StreamChunk } from '@agiworkforce/types';
import { OpenAIWireAssembler } from '@agiworkforce/llm-normalize';
import { buildAnthropicAdapter, startProviderStream } from './adapter-factory';
import { buildAnthropicChatRequest } from './canonical-request';
import { toUpstreamError } from './adapter-errors';
import type { ProcessedRequest } from './request-processor';

/**
 * Anthropic dispatch for the agentic tool-loop (MCP/E2B), task #34's
 * tool-loop slice. Mirrors route.ts's standard-path Anthropic branch, but
 * reshaped for tool-loop.ts's per-step calling convention and its
 * OpenAI-shaped-bytes contract with `collectProviderStream`.
 *
 * LATENT BUG FOUND AND FIXED BY THIS MIGRATION (reported to team-lead, not
 * filed as a separate known-flaw -- fixed in this same pass): the OLD
 * dispatch here was `LLMProviderFactory.streamRequest('anthropic', ...)`,
 * which returns Anthropic's raw, completely unreshaped native SSE
 * (`content_block_delta`/`message_delta`/etc -- see apps/web/lib/llm-
 * providers/anthropic.ts's `streamRequest`, which does `return
 * response.body` with zero transformation). `collectProviderStream` (tool-
 * loop.ts) only ever understood OpenAI-shaped `.choices[0].delta.content` /
 * `.tool_calls[]` / `.finish_reason` events -- it has no Anthropic-native
 * `content_block_delta` handling at all. So an Anthropic-routed agentic turn
 * could never correctly extract text or tool calls: `finishReason` would
 * never become `'tool_calls'`, tools would never execute, and raw Anthropic
 * bytes would be forwarded to a client expecting OpenAI-shaped SSE. Verified
 * empirically in tool-loop-anthropic.test.ts (a test against the OLD
 * dispatch fails; against this one it passes -- there is no correct legacy
 * baseline to byte-match here, unlike the standard-path Anthropic slice).
 * LATENT, not actively firing: `hasMcpTools`/`hasE2BTools` are both gated in
 * route.ts, so a default deployment likely never exercised this path for
 * Anthropic.
 *
 * WHY NOT JUST RETURN `AsyncIterable<StreamChunk>` DIRECTLY: `collectProvider
 * Stream` is deliberately left UNCHANGED (not rewritten against StreamChunk)
 * -- it already has a tested tool-call accumulator (index-keyed, argument-
 * fragment-joining) shared by every other provider, all of which speak
 * actual OpenAI-compatible SSE on the wire. Reshaping Anthropic's chunks into
 * that same OpenAI-shaped byte wire via `OpenAIWireAssembler` (`wireMode:
 * 'legacy-web'`, the same translation `buildAdapterStreamResponse` in
 * stream-transform.ts uses for the standard path) lets `collectProviderStream`
 * consume Anthropic exactly like it consumes every other provider, at the
 * cost of a small amount of duplicated wrapping logic (no TTFT/billing
 * tracking needed here -- tool-loop.ts does neither; it relies solely on
 * request-processor.ts's upfront credit reservation with no per-step
 * reconciliation, confirmed by grep -- so reusing stream-transform.ts's
 * TTFT/billing-entangled version would need extra unused parameters for no
 * gain).
 *
 * ERROR HANDLING: `startProviderStream` eagerly peeks the first chunk and
 * throws a plain `Error` (via `toUpstreamError`) if it's an error chunk
 * (same peek-and-throw pattern as the standard path). That throw propagates
 * out of this function and is
 * caught by `runToolLoop`'s EXISTING try/catch around its provider-call site
 * -- which already does exactly the right thing for tool-loop specifically:
 * yield an inline `Error: ...` SSE content chunk and stop (no `[DONE]`, no
 * attempt at `buildUpstreamErrorResponse`). That matters because by step 2+
 * a 200 response is already committed -- there is no HTTP-error-response
 * path available mid-loop, and step 1 failing this way matches the OLD
 * `LLMProviderFactory.streamRequest` behavior too (it threw synchronously on
 * a failed fetch, before any body streaming began). This function does NOT
 * duplicate that error-UX decision -- it only supplies the throw; the loop's
 * unchanged catch block decides what to do with it.
 *
 * NO ABORTSIGNAL THREADING: `runToolLoop` has never received one --
 * `ProcessedRequest`/`ToolLoopOptions` carry no signal, and the OLD
 * `LLMProviderFactory.streamRequest(provider, request)` call took no signal
 * parameter either (client-disconnect cancellation has only ever worked via
 * the generator's own `.return()` on the next pull, not by aborting an
 * in-flight upstream fetch). A fresh, never-triggered `AbortController`
 * reproduces that exactly -- `ProviderAdapter.stream()` requires a signal
 * argument, but nothing about tool-loop's cancellation contract changes by
 * giving it one that never fires.
 */
export async function buildAnthropicToolLoopStream(
  processed: ProcessedRequest,
  stepRequest: ProcessedRequest['llmRequest'],
  responseModel: string,
): Promise<ReadableStream> {
  const stepProcessed: ProcessedRequest = { ...processed, llmRequest: stepRequest };
  const adapter = buildAnthropicAdapter(stepProcessed);
  const chatRequest = buildAnthropicChatRequest(stepProcessed);
  const signal = new AbortController().signal;
  const chunks = await startProviderStream(adapter, chatRequest, signal, toUpstreamError);
  return chunksToOpenAiSse(chunks, responseModel);
}

/**
 * Wrap an Anthropic adapter's `AsyncIterable<StreamChunk>` as an OpenAI-
 * shaped SSE byte stream via a FRESH `OpenAIWireAssembler` per call. Fresh is
 * required, not just convenient: the assembler is stateful (tool-call
 * indices, thinking-block state) and tool-loop.ts calls the provider once
 * per agentic step -- reusing one assembler across steps would corrupt that
 * state (e.g. a step-2 tool call would see step-1's tool-index counter).
 */
function chunksToOpenAiSse(
  chunks: AsyncIterable<StreamChunk>,
  model: string,
): ReadableStream<Uint8Array> {
  const assembler = new OpenAIWireAssembler({ model, wireMode: 'legacy-web' });
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of chunks) {
          const wireEvents = assembler.sseChunks(chunk);
          if (wireEvents.length === 0) continue;
          const lines = wireEvents.map((event) => `data: ${JSON.stringify(event)}`).join('\n');
          controller.enqueue(encoder.encode(lines + '\n\n'));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}
