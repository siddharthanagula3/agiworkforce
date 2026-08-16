import 'server-only';

import type { StreamChunk } from '@agiworkforce/types';
import { OpenAIWireAssembler } from '@agiworkforce/provider-protocol';
import { createUsageAccumulator, ingestUsageChunk } from './adapter-usage';

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

export async function drainToLlmResponse(
  chunks: AsyncIterable<StreamChunk>,
  model: string,
  mapError: (chunk: Extract<StreamChunk, { type: 'error' }>) => Error,
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
