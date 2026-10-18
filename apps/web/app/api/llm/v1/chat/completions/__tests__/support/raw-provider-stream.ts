import { NextRequest, NextResponse } from 'next/server';
import { addAttachmentTruncationHeader } from '@agiworkforce/cloud-contracts';
import { toolStatusPhrase } from '@agiworkforce/provider-protocol';
import { logger } from '@/lib/logger';
import { getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { recordModelUsage, toOtelAttributes } from '@/lib/cost-tracker';
import { buildCpstUsageFields } from '@/lib/cpst-telemetry';
import { addFallbackReasonHeader, addModelEscalationHeaders } from '@/lib/chat-fallback-reason';
import { addSecretRedactionNoticeHeader } from '@/lib/chat-secret-redaction-notice';
import { addProjectSourcesHeader } from '@/lib/chat-project-sources';
import { estimateMicrousdOf } from '@/lib/services/managed-usage-request-service';
import { SSE_RESPONSE_HEADERS, withSseHeartbeat } from '../../lib/sse-heartbeat';
import type { ProcessedRequest } from '../../lib/request-processor';
import {
  settleStreamBilling,
  TTFT_SLO_BREACH_MS,
  TTFT_SLO_TARGET_MS,
} from '../../lib/stream-transform';

/**
 * The retired raw-provider-SSE path, kept only as the byte-parity oracle that
 * the adapter path's output is compared against. Production never calls it.
 */
export async function buildStreamResponse(
  request: NextRequest,
  stream: ReadableStream,
  processed: ProcessedRequest,
  userId: string,
  _token: string,
): Promise<NextResponse> {
  const { requestId, chatRequest, requestedModel, provider, quotaWarningHeader, usedFallback } =
    processed;

  const modelUsed = chatRequest.model;
  const providerUsed = provider;
  const responseModelName = usedFallback ? chatRequest.model : requestedModel;

  let inputTokens = 0;
  let outputTokens = 0;
  let reasoningOutputTokens: number | undefined;
  let cacheReadInputTokens: number | undefined;
  let cacheCreationInputTokens: number | undefined;
  let cacheCreation1hInputTokens: number | undefined;
  let reportedWebSearchRequests = 0;
  let answeredWebSearches = 0;
  let webFetchRequests = 0;
  let codeExecutionRequests = 0;
  const codeExecutionContainerIds = new Set<string>();
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

            if (event.type === 'message_start' && event.message?.container?.id) {
              codeExecutionContainerIds.add(event.message.container.id);
            }
            if (event.type === 'message_delta' && event.delta?.container?.id) {
              codeExecutionContainerIds.add(event.delta.container.id);
            }
            if (
              event.type === 'content_block_start' &&
              event.content_block?.type === 'web_search_tool_result' &&
              Array.isArray(event.content_block.content)
            ) {
              answeredWebSearches += 1;
            }
            const serverToolUse = event.usage?.server_tool_use;
            if (serverToolUse) {
              reportedWebSearchRequests = Math.max(
                reportedWebSearchRequests,
                serverToolUse.web_search_requests || 0,
              );
              webFetchRequests = Math.max(webFetchRequests, serverToolUse.web_fetch_requests || 0);
              codeExecutionRequests = Math.max(
                codeExecutionRequests,
                serverToolUse.code_execution_requests || 0,
              );
            }

            if (event.type === 'message_start' && event.message?.usage) {
              inputTokens = Math.max(inputTokens, event.message.usage.input_tokens || 0);
              if (event.message.usage.cache_read_input_tokens != null) {
                cacheReadInputTokens = event.message.usage.cache_read_input_tokens;
              }
              if (event.message.usage.cache_creation_input_tokens != null) {
                cacheCreationInputTokens = event.message.usage.cache_creation_input_tokens;
              }
              if (event.message.usage.cache_creation?.ephemeral_1h_input_tokens != null) {
                cacheCreation1hInputTokens =
                  event.message.usage.cache_creation.ephemeral_1h_input_tokens;
              }
            }

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
                const statusPhrase = toolStatusPhrase(toolName);
                transformedEvent = {
                  choices: [
                    {
                      delta: {
                        x_tool_status: {
                          type: 'server_tool_use',
                          name: toolName,
                          status: toolStatus,
                          tool_use_id: event.content_block.id,
                          ...(statusPhrase ? { status_phrase: statusPhrase } : {}),
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
                event.content_block?.type === 'web_fetch_tool_result'
              ) {
                if (event.index !== undefined) {
                  activeBlockTypes.set(event.index, 'web_fetch_tool_result');
                }
                const fetchResult = event.content_block.content as
                  { type?: string; url?: unknown; error_code?: unknown } | undefined;
                const isFetchError = fetchResult?.type === 'web_fetch_tool_result_error';
                const fetchContent = isFetchError
                  ? `Web fetch failed: ${
                      typeof fetchResult?.error_code === 'string'
                        ? fetchResult.error_code
                        : 'unknown_error'
                    }`
                  : `Fetched ${typeof fetchResult?.url === 'string' ? fetchResult.url : 'page'}`;
                transformedEvent = {
                  choices: [
                    {
                      delta: {
                        x_tool_result: {
                          tool_call_id: event.content_block.tool_use_id,
                          name: 'web_fetch',
                          content: fetchContent,
                          is_error: isFetchError,
                        },
                      },
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
            if (event.usage) {
              inputTokens = Math.max(inputTokens, event.usage.prompt_tokens || 0);
              outputTokens = Math.max(outputTokens, event.usage.completion_tokens || 0);
              const streamCacheRead =
                event.usage.prompt_tokens_details?.cached_tokens ??
                event.usage.input_tokens_details?.cached_tokens ??
                event.usage.cache_read_input_tokens ??
                undefined;
              if (streamCacheRead != null) {
                cacheReadInputTokens = streamCacheRead;
              }
              const streamCacheCreation = event.usage.cache_creation_input_tokens ?? undefined;
              if (streamCacheCreation != null) {
                cacheCreationInputTokens = streamCacheCreation;
              }
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
            webSearchRequests: Math.min(reportedWebSearchRequests, answeredWebSearches),
            webFetchRequests,
            codeExecutionRequests,
            codeExecutionContainerIds: [...codeExecutionContainerIds],
            providerElapsedMs: Date.now() - streamStartedAt,
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
            estimatedCostMicrousd: estimateMicrousdOf(processed),
          },
          'CRITICAL: Credit reconciliation failed after streaming completed - may require manual adjustment',
        );
        if (processed.managedUsage) throw reconciliationError;
      }

      if (hasTerminalSentinel) {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      }

      try {
        const usage = {
          inputTokens,
          outputTokens,
          reasoningOutputTokens,
          cacheReadInputTokens,
          cacheCreationInputTokens,
          cacheCreation1hInputTokens,
        };
        recordModelUsage(userId, modelUsed, usage, new Date());
        logger.info(
          {
            event: 'gen_ai_usage_recorded',
            userId,
            requestId,
            ...toOtelAttributes(
              providerUsed,
              modelUsed,
              usage,
              buildCpstUsageFields(processed, { billingOutcome: 'completed' }),
            ),
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
    ...SSE_RESPONSE_HEADERS,
    ...getCorsHeaders(request),
    ...getSecurityHeaders(),
  };
  if (modelUsed) {
    streamHeaders['X-AGI-Resolved-Model'] = modelUsed;
  }
  if (quotaWarningHeader) {
    streamHeaders['X-Quota-Warning'] = quotaWarningHeader;
  }
  addFallbackReasonHeader(streamHeaders, processed);
  addModelEscalationHeaders(streamHeaders, processed);
  addSecretRedactionNoticeHeader(streamHeaders, processed);
  addAttachmentTruncationHeader(streamHeaders, processed);
  addProjectSourcesHeader(streamHeaders, processed);
  return new NextResponse(withSseHeartbeat(reconciledStream), { headers: streamHeaders });
}
