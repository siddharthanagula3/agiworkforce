import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import { getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { recordModelUsage, toOtelAttributes } from '@/lib/cost-tracker';
import type { StreamChunk } from '@agiworkforce/types';
import { OpenAIWireAssembler } from '@agiworkforce/provider-protocol';
import type { ProcessedRequest } from './request-processor';
import {
  ManagedUsageRequestError,
  finalizeManagedUsageRequest,
  markManagedUsageClientDelivered,
} from '@/lib/services/managed-usage-request-service';
import { settleFreeTrialRequest } from '@/lib/services/free-trial-service';
import { createUsageAccumulator, ingestUsageChunk } from './adapter-usage';
import { withSseHeartbeat } from './sse-heartbeat';
import {
  collectGeneratedFileRefs,
  persistGeneratedFiles,
  type GeneratedFileRef,
} from '@/lib/server/container-files';
// ProcessedRequest carries quotaFeature, isFlagshipRequest, etc. · no extra imports needed

const TTFT_SLO_TARGET_MS = Number(process.env['LLM_TTFT_SLO_TARGET_MS'] ?? 2500);
const TTFT_SLO_BREACH_MS = Number(process.env['LLM_TTFT_SLO_BREACH_MS'] ?? 5000);

interface StreamBillingUsage {
  inputTokens: number;
  outputTokens: number;
  reasoningOutputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  cacheCreation1hInputTokens?: number;
}

async function settleStreamBilling(input: {
  processed: ProcessedRequest;
  userId: string;
  provider: string;
  model: string;
  usage: StreamBillingUsage;
  outcome?: 'completed' | 'failed';
}): Promise<void> {
  const { processed, userId, provider, model, usage } = input;
  const totalTokens = usage.inputTokens + usage.outputTokens;
  if (processed.freeTrial) {
    await settleFreeTrialRequest({
      reservation: processed.freeTrial,
      outcome: input.outcome ?? 'completed',
      provider,
      model,
      usage: {
        promptTokens: usage.inputTokens,
        completionTokens: usage.outputTokens,
        totalTokens,
        cacheReadInputTokens: usage.cacheReadInputTokens,
        cacheCreationInputTokens: usage.cacheCreationInputTokens,
        cacheCreation1hInputTokens: usage.cacheCreation1hInputTokens,
      },
    });
    return;
  }

  const actualCostCents =
    input.outcome === 'failed'
      ? 0
      : totalTokens > 0
        ? LLMCostCalculator.calculateCost(provider, model, {
            promptTokens: usage.inputTokens,
            completionTokens: usage.outputTokens,
            totalTokens,
            cacheReadInputTokens: usage.cacheReadInputTokens || undefined,
            cacheCreationInputTokens: usage.cacheCreationInputTokens || undefined,
            cacheCreation1hInputTokens: usage.cacheCreation1hInputTokens || undefined,
          })
        : processed.estimatedCostCents;

  if (processed.managedUsage) {
    await finalizeManagedUsageRequest({
      ...processed.managedUsage,
      outcome: input.outcome ?? 'completed',
      actualCostCents,
      usage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        reasoningTokens: usage.reasoningOutputTokens,
        cacheReadTokens: usage.cacheReadInputTokens,
        cacheWriteTokens: usage.cacheCreationInputTokens,
        cacheWrite1hTokens: usage.cacheCreation1hInputTokens,
      },
    });
    if (input.outcome !== 'failed') {
      await markManagedUsageClientDelivered(processed.managedUsage).catch((error) => {
        logger.warn(
          { error, userId, requestId: processed.requestId },
          'Managed usage delivery marker failed',
        );
      });
    }
    return;
  }

  throw new ManagedUsageRequestError(
    'Managed usage reservation is missing.',
    503,
    'billing_protocol_error',
  );
}

export async function buildStreamResponse(
  request: NextRequest,
  stream: ReadableStream,
  processed: ProcessedRequest,
  userId: string,
  // Auth token flows through the request pipeline (auth-gate → route) and is
  // passed here for signature parity with buildNonStreamResponse; deduction is
  // keyed on userId, so the token itself is not read in this builder.
  _token: string,
): Promise<NextResponse> {
  const {
    requestId,
    chatRequest,
    requestedModel,
    provider,
    estimatedCostCents,
    quotaWarningHeader,
    usedFallback,
  } = processed;

  const modelUsed = chatRequest.model;
  const providerUsed = provider;
  const responseModelName = usedFallback ? chatRequest.model : requestedModel;

  let inputTokens = 0;
  let outputTokens = 0;
  let reasoningOutputTokens: number | undefined;
  let cacheReadInputTokens: number | undefined;
  let cacheCreationInputTokens: number | undefined;
  let cacheCreation1hInputTokens: number | undefined;
  let buffer = '';
  let hasTerminalSentinel = false;
  const encoder = new TextEncoder();
  const streamStartedAt = Date.now();
  let firstTokenTimestampMs: number | null = null;

  const activeBlockTypes = new Map<number, string>();

  const transformStream = new TransformStream({
    transform(chunk, controller) {
      const text = new TextDecoder().decode(chunk);
      buffer += text;

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      const processedLines: string[] = [];
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') {
            hasTerminalSentinel = true;
            continue;
          }

          try {
            const event = JSON.parse(jsonStr);

            let transformedEvent = event;
            if (providerUsed === 'anthropic') {
              if (event.type === 'content_block_delta' && event.delta?.text) {
                transformedEvent = {
                  choices: [
                    {
                      delta: { content: event.delta.text },
                      index: event.index || 0,
                    },
                  ],
                  model: responseModelName,
                };
              } else if (
                event.type === 'content_block_delta' &&
                event.delta?.type === 'input_json_delta'
              ) {
                const blockType = activeBlockTypes.get(event.index ?? -1);
                if (blockType === 'server_tool_use') {
                  continue;
                }
                transformedEvent = {
                  choices: [
                    {
                      delta: {
                        tool_calls: [
                          {
                            index: event.index || 0,
                            function: { arguments: event.delta.partial_json || '' },
                          },
                        ],
                      },
                      index: 0,
                    },
                  ],
                  model: responseModelName,
                };
              } else if (
                event.type === 'content_block_start' &&
                event.content_block?.type === 'tool_use'
              ) {
                if (event.index !== undefined) {
                  activeBlockTypes.set(event.index, 'tool_use');
                }
                transformedEvent = {
                  choices: [
                    {
                      delta: {
                        tool_calls: [
                          {
                            index: event.index || 0,
                            id: event.content_block.id,
                            type: 'function',
                            function: { name: event.content_block.name, arguments: '' },
                          },
                        ],
                      },
                      index: 0,
                    },
                  ],
                  model: responseModelName,
                };
              } else if (
                event.type === 'content_block_start' &&
                event.content_block?.type === 'server_tool_use'
              ) {
                if (event.index !== undefined) {
                  activeBlockTypes.set(event.index, 'server_tool_use');
                }
                const toolName: string = event.content_block.name || 'web_search';
                const toolStatus =
                  toolName === 'code_execution'
                    ? 'executing'
                    : toolName === 'web_search'
                      ? 'searching'
                      : toolName === 'web_fetch'
                        ? 'fetching'
                        : 'running';
                transformedEvent = {
                  choices: [
                    {
                      delta: {
                        x_tool_status: {
                          type: 'server_tool_use',
                          name: toolName,
                          status: toolStatus,
                        },
                      },
                      index: 0,
                    },
                  ],
                  model: responseModelName,
                };
              } else if (
                event.type === 'content_block_start' &&
                event.content_block?.type === 'code_execution_tool_result'
              ) {
                if (event.index !== undefined) {
                  activeBlockTypes.set(event.index, 'code_execution_tool_result');
                }
                transformedEvent = {
                  choices: [
                    {
                      delta: { x_code_result: event.content_block },
                      index: 0,
                    },
                  ],
                  model: responseModelName,
                };
              } else if (
                event.type === 'content_block_start' &&
                event.content_block?.type === 'web_search_tool_result'
              ) {
                if (event.index !== undefined) {
                  activeBlockTypes.set(event.index, 'web_search_tool_result');
                }
                transformedEvent = {
                  choices: [
                    {
                      delta: { x_search_results: event.content_block },
                      index: 0,
                    },
                  ],
                  model: responseModelName,
                };
              } else if (
                event.type === 'content_block_start' &&
                event.content_block?.type === 'thinking'
              ) {
                if (event.index !== undefined) {
                  activeBlockTypes.set(event.index, 'thinking');
                }
                transformedEvent = {
                  choices: [
                    {
                      delta: { content: '<thinking>' },
                      index: 0,
                    },
                  ],
                  model: responseModelName,
                };
              } else if (
                event.type === 'content_block_delta' &&
                event.delta?.type === 'thinking_delta'
              ) {
                transformedEvent = {
                  choices: [
                    {
                      delta: { content: event.delta.thinking },
                      index: 0,
                    },
                  ],
                  model: responseModelName,
                };
              } else if (event.type === 'message_delta' && event.delta?.stop_reason) {
                const stopReason = event.delta.stop_reason;
                const finishReason =
                  stopReason === 'tool_use'
                    ? 'tool_calls'
                    : stopReason === 'end_turn'
                      ? 'stop'
                      : stopReason;
                transformedEvent = {
                  choices: [
                    {
                      delta: {},
                      finish_reason: finishReason,
                      index: 0,
                    },
                  ],
                  model: responseModelName,
                };
              } else if (event.type === 'message_stop') {
                hasTerminalSentinel = true;
                continue;
              } else if (event.type === 'message_start') {
                continue;
              } else if (
                event.type === 'content_block_start' &&
                event.content_block?.type === 'text'
              ) {
                if (event.index !== undefined) {
                  activeBlockTypes.set(event.index, 'text');
                }
                continue;
              } else if (event.type === 'content_block_stop') {
                const blockType = activeBlockTypes.get(event.index || 0);
                if (blockType === 'thinking') {
                  transformedEvent = {
                    choices: [
                      {
                        delta: { content: '</thinking>' },
                        index: 0,
                      },
                    ],
                    model: responseModelName,
                  };
                } else {
                  continue;
                }
              }
            }

            if (transformedEvent.model) {
              transformedEvent.model = responseModelName;
            }

            if (event.type === 'message_delta' && event.usage) {
              outputTokens = Math.max(outputTokens, event.usage.output_tokens || 0);
            }
            if (event.type === 'message_start' && event.message?.usage) {
              inputTokens = Math.max(inputTokens, event.message.usage.input_tokens || 0);
              // Anthropic streams cache token counts in message_start.message.usage
              if (event.message.usage.cache_read_input_tokens != null) {
                cacheReadInputTokens = event.message.usage.cache_read_input_tokens;
              }
              if (event.message.usage.cache_creation_input_tokens != null) {
                cacheCreationInputTokens = event.message.usage.cache_creation_input_tokens;
              }
              // Only present when the request mixes 5m and 1h TTLs; absent means
              // the entire cache_creation_input_tokens total is 5m-priced.
              if (event.message.usage.cache_creation?.ephemeral_1h_input_tokens != null) {
                cacheCreation1hInputTokens =
                  event.message.usage.cache_creation.ephemeral_1h_input_tokens;
              }
            }
            if (event.usage) {
              inputTokens = Math.max(inputTokens, event.usage.prompt_tokens || 0);
              outputTokens = Math.max(outputTokens, event.usage.completion_tokens || 0);
              // OpenAI/OpenRouter: capture cached token counts from the final usage
              // event emitted when stream_options.include_usage=true is set.
              // Chat Completions shape: prompt_tokens_details.cached_tokens
              // Responses API shape:   input_tokens_details.cached_tokens
              // OpenRouter (anthropic routes): cache_read_input_tokens / cache_creation_input_tokens
              // DeepSeek native shape:  prompt_cache_hit_tokens (subset of prompt_tokens;
              //   the streaming bypass returns DeepSeek's raw usage chunk, so this field
              //   is the only place the ~90%-off cache discount can be captured on stream).
              const streamCacheRead =
                event.usage.prompt_tokens_details?.cached_tokens ??
                event.usage.input_tokens_details?.cached_tokens ??
                event.usage.cache_read_input_tokens ??
                event.usage.prompt_cache_hit_tokens ??
                undefined;
              if (streamCacheRead != null) {
                cacheReadInputTokens = streamCacheRead;
              }
              const streamCacheCreation = event.usage.cache_creation_input_tokens ?? undefined;
              if (streamCacheCreation != null) {
                cacheCreationInputTokens = streamCacheCreation;
              }
              // Reasoning tokens:
              //   Chat Completions: completion_tokens_details.reasoning_tokens
              //   Responses API:    output_tokens_details.reasoning_tokens
              const streamReasoning =
                event.usage.completion_tokens_details?.reasoning_tokens ??
                event.usage.output_tokens_details?.reasoning_tokens ??
                undefined;
              if (streamReasoning != null) {
                reasoningOutputTokens = streamReasoning;
              }
            }
            if (event.usageMetadata) {
              inputTokens = Math.max(inputTokens, event.usageMetadata.promptTokenCount || 0);
              outputTokens = Math.max(outputTokens, event.usageMetadata.candidatesTokenCount || 0);
              // Gemini implicit caching: cachedContentTokenCount is a subset of
              // promptTokenCount served from cache. Capture for cost-discounting.
              if (event.usageMetadata.cachedContentTokenCount != null) {
                cacheReadInputTokens = event.usageMetadata.cachedContentTokenCount;
              }
            }

            processedLines.push(`data: ${JSON.stringify(transformedEvent)}`);

            if (firstTokenTimestampMs === null) {
              const deltaContent = transformedEvent?.choices?.[0]?.delta?.content;
              const hasTextDelta = typeof deltaContent === 'string' && deltaContent.length > 0;
              if (hasTextDelta) {
                firstTokenTimestampMs = Date.now() - streamStartedAt;
                logger.info(
                  {
                    event: 'llm_ttft_observed',
                    requestId,
                    userId,
                    provider: providerUsed,
                    model: modelUsed,
                    ttftMs: firstTokenTimestampMs,
                    sloTargetMs: TTFT_SLO_TARGET_MS,
                    sloBreachMs: TTFT_SLO_BREACH_MS,
                  },
                  'First token observed',
                );

                if (firstTokenTimestampMs > TTFT_SLO_BREACH_MS) {
                  logger.warn(
                    {
                      event: 'llm_ttft_slo_breach',
                      requestId,
                      userId,
                      provider: providerUsed,
                      model: modelUsed,
                      ttftMs: firstTokenTimestampMs,
                      sloTargetMs: TTFT_SLO_TARGET_MS,
                      sloBreachMs: TTFT_SLO_BREACH_MS,
                    },
                    'TTFT exceeded breach threshold',
                  );
                }
              }
            }
          } catch (parseError) {
            logger.debug(
              { jsonStr: jsonStr.substring(0, 100), error: parseError },
              'Stream JSON parse error - passing through unchanged',
            );
            processedLines.push(line);
          }
        } else if (line.trim()) {
          processedLines.push(line);
        }
      }

      if (processedLines.length > 0) {
        controller.enqueue(encoder.encode(processedLines.join('\n') + '\n\n'));
      }
    },
    async flush(controller) {
      if (buffer.trim() === 'data: [DONE]') {
        hasTerminalSentinel = true;
      } else if (buffer.trim()) {
        controller.enqueue(encoder.encode(buffer));
      }

      try {
        if (firstTokenTimestampMs === null) {
          logger.warn(
            {
              event: 'llm_ttft_missing',
              requestId,
              userId,
              provider: providerUsed,
              model: modelUsed,
            },
            'Stream completed without observable first token',
          );
        }

        await settleStreamBilling({
          processed,
          userId,
          provider: providerUsed,
          model: modelUsed,
          usage: {
            inputTokens,
            outputTokens,
            reasoningOutputTokens,
            cacheReadInputTokens,
            cacheCreationInputTokens,
            cacheCreation1hInputTokens,
          },
        });
      } catch (reconciliationError) {
        logger.error(
          {
            error: reconciliationError,
            userId,
            requestId,
            providerUsed,
            modelUsed,
            inputTokens,
            outputTokens,
            estimatedCostCents,
          },
          'CRITICAL: Credit reconciliation failed after streaming completed - may require manual adjustment',
        );
        if (processed.managedUsage) throw reconciliationError;
      }

      // Never acknowledge a successful stream before its financial outcome
      // is durable. Moving the provider's terminal marker behind settlement
      // also makes retries deterministic: a failed settlement interrupts the
      // stream instead of exposing a false success that the client will not
      // retry.
      if (hasTerminalSentinel) {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      }

      // BILLING FIX (0044): reconcileUsage/increment_usage double-charged by
      // adding the raw token count to credits_used_cents (cents). The
      // deduct_credits reconciliation above is the authoritative cost path.
      // Removed to stop the double charge.

      // Fire-and-forget cost tracking + OTel attribute emit (must not block the stream flush).
      try {
        const usage = {
          inputTokens,
          outputTokens,
          reasoningOutputTokens,
          cacheReadInputTokens,
          cacheCreationInputTokens,
          cacheCreation1hInputTokens,
        };
        recordModelUsage(userId, modelUsed, usage);
        logger.info(
          {
            event: 'gen_ai_usage_recorded',
            userId,
            requestId,
            ...toOtelAttributes(providerUsed, modelUsed, usage),
          },
          'GenAI usage attributes recorded (streaming)',
        );
      } catch (trackingError) {
        logger.warn({ error: trackingError, userId, requestId }, 'Stream cost tracking failed');
      }
    },
  });

  const reconciledStream = stream.pipeThrough(transformStream);

  const streamHeaders: Record<string, string> = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    ...getCorsHeaders(request),
    ...getSecurityHeaders(),
  };
  if (quotaWarningHeader) {
    streamHeaders['X-Quota-Warning'] = quotaWarningHeader;
  }
  // Idle heartbeat, provider-independent (see sse-heartbeat.ts) -- covers
  // every provider dispatched through this function, not just Anthropic.
  return new NextResponse(withSseHeartbeat(reconciledStream), { headers: streamHeaders });
}

/**
 * `buildStreamResponse`'s sibling for the `packages/ai/providers/*` adapter
 * path (restructure Wave 2, task #34) -- Anthropic and Google so far (see
 * `ADAPTER_PROVIDERS` in route.ts). Consumes an `AsyncIterable<StreamChunk>`
 * (an adapter's `.stream()` result) instead of a raw upstream SSE
 * `ReadableStream`, reconstructing the SAME byte-stable legacy wire via
 * `OpenAIWireAssembler`'s `wireMode: 'legacy-web'` + `sseChunks()` (proven
 * against captured golden fixtures for each provider --
 * packages/ai/providers/anthropic/src/__tests__/web-wire-parity.test.ts,
 * apps/web/.../__tests__/stream-transform.google-byte-parity.test.ts).
 *
 * `buildStreamResponse` above is left completely untouched: every other
 * provider still dispatches through it via `LLMProviderFactory`'s raw
 * ReadableStream. Two separate functions, not a shared one with a branch,
 * so migrating a provider onto this one carries zero risk to the still-
 * legacy providers.
 *
 * Billing/TTFT/analytics logic is a straight port of `buildStreamResponse`'s
 * `flush()` -- same LLMCostCalculator/managed-usage/recordModelUsage calls,
 * same TTFT-observed/breach/missing log events -- just reading accumulated
 * `StreamChunk` usage fields (via `adapter-usage.ts`, shared with the
 * non-streaming `drainToLlmResponse`) instead of re-parsing JSON event
 * shapes per provider.
 *
 * `[DONE]` is emitted unconditionally once the adapter's AsyncIterable is
 * exhausted -- the canonical `StreamChunk` layer has no `[DONE]`-equivalent
 * chunk type at all (it's purely an OpenAI-WIRE-LEVEL sentinel
 * `OpenAIWireAssembler` never emits on its own), so appending it here
 * unconditionally was only verified safe for Anthropic/Google's raw wires,
 * neither of which ever contained their own `[DONE]` (confirmed for Google
 * via stream-transform.google-byte-parity.test.ts's `[DONE]` assertion).
 * CONFIRMED SAFE for OpenAI too (task #34's OpenAI slice), for a different
 * reason: OpenAI's real Chat Completions SSE DOES contain its own `[DONE]`,
 * but `createOpenAIAdapter` consumes it via the official `openai` SDK's
 * `sdk.chat.completions.create()` stream helper, which parses SSE internally
 * and treats `[DONE]` as "end the async iterable" -- it never surfaces as a
 * yielded chunk object for `translateOpenAIStream` to see or re-emit. So
 * `[DONE]` never reaches this function's input side for ANY provider wired
 * through it; the one appended here is always the only one on the wire.
 *
 * `wireMode` is caller-supplied (route.ts's `ADAPTER_PROVIDERS` table, one
 * per provider) rather than hardcoded, because OpenAI's byte-stable wire is
 * NOT `'legacy-web'` -- unlike Anthropic/Google, whose legacy providers
 * reshape their vendor's native wire into an OpenAI-like shape, OpenAI's
 * legacy provider (apps/web/lib/llm-providers/openai.ts) does zero internal
 * reshaping and returns real upstream SSE near-verbatim (confirmed via
 * stream-transform.openai-byte-parity.test.ts's captured bytes) -- see
 * `OpenAIWireAssemblerOptions.wireMode`'s `'openai-passthrough'` docs for
 * what that mode reconstructs.
 *
 * `streamStartedAt` is a CALLER-supplied timestamp, not computed internally
 * with `Date.now()` here -- unlike `buildStreamResponse`, which can safely
 * take its own timestamp because `await LLMProviderFactory.streamRequest()`
 * returns as soon as response headers arrive, before any content. This
 * function's caller (route.ts) instead calls `startProviderStream`, which
 * eagerly awaits the FIRST `StreamChunk` (see adapter-factory.ts's
 * docstring on why: detecting an immediate upstream error before committing
 * to a 200 response) -- so by the time `chunks` reaches this function, the
 * first token may already have arrived. Taking `Date.now()` here would
 * measure only the gap between that peek resolving and this function
 * starting (near-zero), silently breaking the `llm_ttft_slo_breach` alert
 * for every request dispatched this way. Route.ts captures the real start
 * time BEFORE calling `startProviderStream`.
 */
export async function buildAdapterStreamResponse(
  request: NextRequest,
  chunks: AsyncIterable<StreamChunk>,
  processed: ProcessedRequest,
  userId: string,
  // See buildStreamResponse's identical parameter for why this is unused.
  _token: string,
  streamStartedAt: number,
  // Defaults to 'legacy-web' so every existing call site (Anthropic/Google,
  // both wired before this parameter existed) is unaffected. New/updated
  // call sites pass the provider's own wireMode explicitly (route.ts reads
  // it off ADAPTER_PROVIDERS).
  wireMode: 'legacy-web' | 'openai-passthrough' = 'legacy-web',
  /** Optional server-owned work that runs only after a durably settled clean stream. */
  onSuccessfulTurn?: () => Promise<void>,
): Promise<NextResponse> {
  const {
    requestId,
    chatRequest,
    requestedModel,
    provider,
    estimatedCostCents,
    quotaWarningHeader,
    usedFallback,
  } = processed;

  // Billing/analytics model id -- canonical (client-facing), matching
  // buildStreamResponse's `modelUsed` exactly (both read `chatRequest.model`,
  // never the apiModelId `toCanonicalChatRequest` sent to the provider via
  // the shared `toProviderApiModelId` boundary).
  const modelUsed = chatRequest.model;
  const providerUsed = provider;
  // Wire-visible model id -- identical rule to buildStreamResponse.
  const responseModelName = usedFallback ? chatRequest.model : requestedModel;

  const assembler = new OpenAIWireAssembler({ model: responseModelName, wireMode });
  const usage = createUsageAccumulator();
  const encoder = new TextEncoder();
  let firstTokenTimestampMs: number | null = null;

  // Provider-generated file refs seen this turn (OpenAI container-file
  // citations / Anthropic code-execution outputs), deduped by file id. The
  // bytes live in the provider's EPHEMERAL sandbox (OpenAI containers expire
  // ~20 min), so they are fetched + persisted at end of turn and announced as
  // an `x_generated_files` delta before [DONE]. Managed-gateway path only —
  // the fetchers use the platform provider keys that created these ids.
  const generatedFileRefs = new Map<string, GeneratedFileRef>();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for await (const chunk of chunks) {
        ingestUsageChunk(usage, chunk);
        try {
          collectGeneratedFileRefs(chunk, generatedFileRefs);
        } catch {
          /* scanning is best-effort; never break the stream */
        }
        const wireEvents = assembler.sseChunks(chunk);
        if (wireEvents.length === 0) continue;

        const lines = wireEvents.map((event) => `data: ${JSON.stringify(event)}`).join('\n');
        controller.enqueue(encoder.encode(lines + '\n\n'));

        if (firstTokenTimestampMs === null) {
          for (const event of wireEvents) {
            const deltaContent = (event as { choices?: Array<{ delta?: { content?: unknown } }> })
              .choices?.[0]?.delta?.content;
            if (typeof deltaContent === 'string' && deltaContent.length > 0) {
              firstTokenTimestampMs = Date.now() - streamStartedAt;
              logger.info(
                {
                  event: 'llm_ttft_observed',
                  requestId,
                  userId,
                  provider: providerUsed,
                  model: modelUsed,
                  ttftMs: firstTokenTimestampMs,
                  sloTargetMs: TTFT_SLO_TARGET_MS,
                  sloBreachMs: TTFT_SLO_BREACH_MS,
                },
                'First token observed',
              );
              if (firstTokenTimestampMs > TTFT_SLO_BREACH_MS) {
                logger.warn(
                  {
                    event: 'llm_ttft_slo_breach',
                    requestId,
                    userId,
                    provider: providerUsed,
                    model: modelUsed,
                    ttftMs: firstTokenTimestampMs,
                    sloTargetMs: TTFT_SLO_TARGET_MS,
                    sloBreachMs: TTFT_SLO_BREACH_MS,
                  },
                  'TTFT exceeded breach threshold',
                );
              }
              break;
            }
          }
        }
      }

      // Persist provider-sandbox files BEFORE closing the stream so the
      // client receives durable, same-origin renderable URLs in-band. Honest
      // states: failures keep the log warn AND surface an inline note — the
      // user is never silently shown nothing.
      if (generatedFileRefs.size > 0) {
        try {
          const { files, failedCount } = await persistGeneratedFiles({
            userId,
            refs: [...generatedFileRefs.values()],
            model: modelUsed,
          });
          if (files.length > 0) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  choices: [
                    {
                      delta: { x_generated_files: { files: files.map((f) => f.wire) } },
                      index: 0,
                    },
                  ],
                  model: responseModelName,
                })}\n\n`,
              ),
            );
          }
          if (failedCount > 0) {
            const plural = failedCount === 1 ? 'file' : 'files';
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  choices: [
                    {
                      delta: {
                        content: `\n\n*Note: ${failedCount} generated ${plural} could not be retrieved from the code-execution sandbox and ${failedCount === 1 ? 'is' : 'are'} not attached.*`,
                      },
                      index: 0,
                    },
                  ],
                  model: responseModelName,
                })}\n\n`,
              ),
            );
          }
        } catch (err) {
          logger.warn(
            { err, requestId, userId, provider: providerUsed },
            'Generated-file persistence failed at end of stream',
          );
        }
      }

      // The provider failed mid-stream (after this 200 SSE response had
      // already committed) -- ingest()'s 'error' case (see
      // OpenAIWireAssembler) captured the classified message, but the
      // stream itself still ends cleanly with [DONE] (see sseChunks()'s
      // 'error' case and the additive `x_stream_error` wire marker it now
      // emits). Without this log the failure was previously invisible
      // server-side too -- `assembler.lastError` had zero production
      // readers before this fix.
      if (assembler.lastError !== null) {
        logger.warn(
          {
            event: 'llm_stream_error_mid_stream',
            requestId,
            userId,
            provider: providerUsed,
            model: modelUsed,
            error: assembler.lastError,
          },
          'Provider stream ended with a mid-stream error after the response had already committed',
        );
      }

      if (firstTokenTimestampMs === null) {
        logger.warn(
          {
            event: 'llm_ttft_missing',
            requestId,
            userId,
            provider: providerUsed,
            model: modelUsed,
          },
          'Stream completed without observable first token',
        );
      }

      try {
        await settleStreamBilling({
          processed,
          userId,
          provider: providerUsed,
          model: modelUsed,
          usage: {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            reasoningOutputTokens: usage.reasoningOutputTokens,
            cacheReadInputTokens: usage.cacheReadInputTokens,
            cacheCreationInputTokens: usage.cacheCreationInputTokens,
            cacheCreation1hInputTokens: usage.cacheCreation1hInputTokens,
          },
          outcome: assembler.lastError === null ? 'completed' : 'failed',
        });
      } catch (reconciliationError) {
        logger.error(
          {
            error: reconciliationError,
            userId,
            requestId,
            providerUsed,
            modelUsed,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            estimatedCostCents,
          },
          'CRITICAL: Credit reconciliation failed after streaming completed - may require manual adjustment',
        );
        if (processed.managedUsage) throw reconciliationError;
      }

      if (assembler.lastError === null) {
        await onSuccessfulTurn?.();
      }

      // A successful terminal sentinel is emitted only after the financial
      // outcome is durable. If settlement fails, start() rejects and the
      // client sees an interrupted stream instead of a false success.
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();

      // Fire-and-forget cost tracking + OTel attribute emit -- mirrors
      // buildStreamResponse's flush(); the stream is already closed by this
      // point, so a failure here can't affect what the client received.
      try {
        const usageForTracking = {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          reasoningOutputTokens: usage.reasoningOutputTokens,
          cacheReadInputTokens: usage.cacheReadInputTokens,
          cacheCreationInputTokens: usage.cacheCreationInputTokens,
          cacheCreation1hInputTokens: usage.cacheCreation1hInputTokens,
        };
        recordModelUsage(userId, modelUsed, usageForTracking);
        logger.info(
          {
            event: 'gen_ai_usage_recorded',
            userId,
            requestId,
            ...toOtelAttributes(providerUsed, modelUsed, usageForTracking),
          },
          'GenAI usage attributes recorded (streaming)',
        );
      } catch (trackingError) {
        logger.warn({ error: trackingError, userId, requestId }, 'Stream cost tracking failed');
      }
    },
    async cancel() {
      if (processed.managedUsage || processed.freeTrial) {
        await settleStreamBilling({
          processed,
          userId,
          provider: providerUsed,
          model: modelUsed,
          usage: {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            reasoningOutputTokens: usage.reasoningOutputTokens,
            cacheReadInputTokens: usage.cacheReadInputTokens,
            cacheCreationInputTokens: usage.cacheCreationInputTokens,
            cacheCreation1hInputTokens: usage.cacheCreation1hInputTokens,
          },
          outcome: 'failed',
        });
      }
    },
  });

  const streamHeaders: Record<string, string> = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    ...getCorsHeaders(request),
    ...getSecurityHeaders(),
  };
  if (quotaWarningHeader) {
    streamHeaders['X-Quota-Warning'] = quotaWarningHeader;
  }
  // Idle heartbeat, provider-independent (see sse-heartbeat.ts) -- the
  // Anthropic SDK swallows the vendor's own event:ping keepalive frames
  // before translateAnthropicStream ever sees them, so this is the only
  // mechanism this path has to keep a long-silent connection (e.g. extended
  // thinking with no visible output) alive.
  return new NextResponse(withSseHeartbeat(body), { headers: streamHeaders });
}
