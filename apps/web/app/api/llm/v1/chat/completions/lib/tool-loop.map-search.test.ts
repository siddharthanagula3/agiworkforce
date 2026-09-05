import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseInteractiveCardDelta } from '@agiworkforce/cloud-contracts';
import { createMapSearchToolDefinition } from '@/lib/services/map-search-tool-service';

const provider = vi.hoisted(() => ({ stream: vi.fn() }));
vi.mock('./tool-loop-anthropic', () => ({
  buildToolLoopStream: provider.stream,
  buildServingRouteId: (...args: unknown[]) => args.join(':'),
}));
vi.mock('@/lib/e2b/runtime', () => ({
  getE2BExecutor: vi.fn().mockResolvedValue(null),
  pauseE2BSession: vi.fn().mockResolvedValue(undefined),
}));

import { runToolLoop } from './tool-loop';
import type { ProcessedRequest } from './request-processor';

function stream(events: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')),
      );
      controller.close();
    },
  });
}

function mapToolCallStream() {
  return stream([
    {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'fixture-map-call',
                type: 'function',
                function: {
                  name: 'search_maps',
                  arguments: JSON.stringify({
                    query: 'coffee shops near Austin, Texas',
                    title: 'Coffee near Austin',
                  }),
                },
              },
            ],
          },
          index: 0,
        },
      ],
      model: 'fixture-model',
    },
    { choices: [{ delta: {}, finish_reason: 'tool_calls', index: 0 }], model: 'fixture-model' },
  ]);
}

function invalidMapToolCallStream() {
  return stream([
    {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'fixture-map-call-invalid',
                type: 'function',
                function: {
                  name: 'search_maps',
                  arguments: JSON.stringify({ query: '' }),
                },
              },
            ],
          },
          index: 0,
        },
      ],
      model: 'fixture-model',
    },
    { choices: [{ delta: {}, finish_reason: 'tool_calls', index: 0 }], model: 'fixture-model' },
  ]);
}

function finalAnswerStream(text: string) {
  return stream([
    { choices: [{ delta: { content: text }, index: 0 }], model: 'fixture-model' },
    { choices: [{ delta: {}, finish_reason: 'stop', index: 0 }], model: 'fixture-model' },
  ]);
}

function makeProcessed(): ProcessedRequest {
  return {
    chatSurface: 'web' as const,
    requestId: 'fixture-map-request',
    chatRequest: {
      model: 'fixture-model',
      messages: [{ role: 'user', content: 'Show coffee shops on a map.' }],
      stream: true,
    },
    conversationId: undefined,
    requestedModel: 'fixture-model',
    provider: 'openai',
    estimatedCostCents: 0,
    estimatedPromptTokens: 0,
    maxTokens: 512,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: 'fixture-model',
    resolvedTaskType: 'general',
    classifierConfidence: 1,
    resolvedSlot: null,
    quotaFeature: 'chat',
    quotaWarningHeader: null,
    isFlagshipRequest: false,
    indicResult: undefined as never,
    llmRequest: {
      model: 'fixture-model',
      messages: [{ role: 'user', content: 'Show coffee shops on a map.' }],
      max_tokens: 512,
      stream: true,
      tools: [createMapSearchToolDefinition()],
    },
  } as ProcessedRequest;
}

async function collect(generator: AsyncGenerator<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let output = '';
  for await (const chunk of generator) output += decoder.decode(chunk);
  return output;
}

describe('map search tool loop', () => {
  beforeEach(() => provider.stream.mockReset());

  it('emits one validated card and completes without another provider step', async () => {
    provider.stream.mockResolvedValueOnce(mapToolCallStream());

    const output = await collect(runToolLoop(makeProcessed(), { approvalMode: 'auto' }));
    const cards = output
      .split('\n')
      .filter((line) => line.startsWith('data: {'))
      .flatMap((line) => {
        const payload = JSON.parse(line.slice('data: '.length)) as {
          choices?: Array<{ delta?: { x_interactive_card?: unknown } }>;
        };
        const card = parseInteractiveCardDelta(payload.choices?.[0]?.delta?.x_interactive_card);
        return card ? [card] : [];
      });

    expect(provider.stream).toHaveBeenCalledTimes(1);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      recognized: true,
      kind: 'map-search.v1',
      cardId: 'fixture-map-call',
    });
    expect(output).toContain('Preparing map');
    expect(output).toContain('data: [DONE]');
    expect(output).not.toContain('max_agent_steps_reached');
  });

  it('asks the model to answer after a map search tool call returns nothing useful', async () => {
    const answer = 'A hash map handles collisions with chaining or open addressing.';
    provider.stream
      .mockResolvedValueOnce(invalidMapToolCallStream())
      .mockResolvedValueOnce(finalAnswerStream(answer));

    const output = await collect(runToolLoop(makeProcessed(), { approvalMode: 'auto' }));

    expect(provider.stream).toHaveBeenCalledTimes(2);
    expect(output).toContain(answer);
    expect(output).toContain('data: [DONE]');
    expect(output).not.toContain('max_agent_steps_reached');
  });
});
