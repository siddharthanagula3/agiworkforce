import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { CreditService } from '@/lib/services/credit-service';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import { getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { reconcileUsage } from '@/lib/assert-quota';
import type { ProcessedRequest } from './request-processor';
// ProcessedRequest carries quotaFeature, isFlagshipRequest, etc. — no extra imports needed

const TTFT_SLO_TARGET_MS = Number(process.env['LLM_TTFT_SLO_TARGET_MS'] ?? 2500);
const TTFT_SLO_BREACH_MS = Number(process.env['LLM_TTFT_SLO_BREACH_MS'] ?? 5000);

export async function buildStreamResponse(
  request: NextRequest,
  stream: ReadableStream,
  processed: ProcessedRequest,
  userClient: SupabaseClient,
  userId: string,
  token: string,
): Promise<NextResponse> {
  const {
    requestId,
    chatRequest,
    requestedModel,
    provider,
    estimatedCostCents,
    quotaWarningHeader,
    quotaFeature,
    isFlagshipRequest,
    usedFallback,
  } = processed;

  const modelUsed = chatRequest.model;
  const providerUsed = provider;
  const responseModelName = usedFallback ? chatRequest.model : requestedModel;

  let inputTokens = 0;
  let outputTokens = 0;
  let buffer = '';
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
            processedLines.push(line);
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
                processedLines.push('data: [DONE]');
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
            }
            if (event.usage) {
              inputTokens = Math.max(inputTokens, event.usage.prompt_tokens || 0);
              outputTokens = Math.max(outputTokens, event.usage.completion_tokens || 0);
            }
            if (event.usageMetadata) {
              inputTokens = Math.max(inputTokens, event.usageMetadata.promptTokenCount || 0);
              outputTokens = Math.max(outputTokens, event.usageMetadata.candidatesTokenCount || 0);
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
      if (buffer.trim()) {
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

        const totalTokens = inputTokens + outputTokens;

        if (totalTokens > 0) {
          const actualCostCents = LLMCostCalculator.calculateCost(providerUsed, modelUsed, {
            promptTokens: inputTokens,
            completionTokens: outputTokens,
            totalTokens,
          });

          const costDifference = actualCostCents - estimatedCostCents;

          if (costDifference !== 0) {
            const reconciliationKey = CreditService.generateIdempotencyKey(
              userId,
              'reconciliation',
              requestId,
            );
            await CreditService.deductCredits(
              userClient,
              userId,
              costDifference,
              `Credit adjustment (streaming): ${providerUsed}/${modelUsed}`,
              {
                provider: providerUsed,
                model: modelUsed,
                type: 'streaming_reconciliation',
                estimatedCostCents,
                actualCostCents,
                promptTokens: inputTokens,
                completionTokens: outputTokens,
                totalTokens,
                requestId,
              },
              reconciliationKey,
            );
          }
        }
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
      }

      const finalTotalTokens = inputTokens + outputTokens;
      if (finalTotalTokens > 0) {
        void reconcileUsage({
          userId,
          token,
          actualTokens: finalTotalTokens,
          feature: quotaFeature,
          isFlagship: isFlagshipRequest,
        }).catch((err) => {
          logger.warn(
            { userId, requestId, error: err instanceof Error ? err.message : err },
            '[reconcileUsage] streaming counter update failed',
          );
        });
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

  return new NextResponse(reconciledStream, { headers: streamHeaders });
}
