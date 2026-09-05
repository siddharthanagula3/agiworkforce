import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseInteractiveCardDelta } from '@agiworkforce/cloud-contracts';
import { PLACES_SEARCH_TOOL_NAME, type PlacesSearchPayload } from '@agiworkforce/types';

const provider = vi.hoisted(() => ({ stream: vi.fn() }));
const places = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock('./tool-loop-anthropic', () => ({
  buildToolLoopStream: provider.stream,
  buildServingRouteId: (...args: unknown[]) => args.join(':'),
}));
vi.mock('@/lib/e2b/runtime', () => ({
  getE2BExecutor: vi.fn().mockResolvedValue(null),
  pauseE2BSession: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/places/places-tool', async () => {
  const actual = await vi.importActual<typeof import('@/lib/places/places-tool')>(
    '@/lib/places/places-tool',
  );
  return { ...actual, executePlacesSearch: places.execute };
});

import { runToolLoop } from './tool-loop';
import { placesSearchToolDef } from '@/lib/places/places-tool';
import type { ProcessedRequest } from './request-processor';

const TOOL_CALL_ID = 'fixture-places-call';
const USER_MESSAGE = 'best coffee near Union Square San Francisco open now';

const PAYLOAD: PlacesSearchPayload = {
  query: 'best coffee',
  near: 'Union Square San Francisco',
  openNowRequested: true,
  localTime: 'Fri, Sep 05, 2026, 09:14',
  providerId: 'test_places',
  attribution: 'Powered by a places provider',
  termsUrl: 'https://example.com/terms',
  places: [
    {
      placeId: 'one',
      name: 'Blue Bottle Coffee',
      address: '66 Mint St',
      rating: 4.5,
      reviewCount: 1204,
      category: 'Coffee shop',
      openNow: true,
      latitude: 37.788,
      longitude: -122.407,
      mapsUrl: 'https://maps.example.com/blue-bottle',
    },
  ],
};

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

function placesToolCallStream(): ReadableStream<Uint8Array> {
  return stream([
    {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: TOOL_CALL_ID,
                type: 'function',
                function: {
                  name: PLACES_SEARCH_TOOL_NAME,
                  arguments: JSON.stringify({
                    query: 'best coffee',
                    near: 'Union Square San Francisco',
                    open_now: true,
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

function finalAnswerStream(text: string): ReadableStream<Uint8Array> {
  return stream([
    { choices: [{ delta: { content: text }, index: 0 }], model: 'fixture-model' },
    { choices: [{ delta: {}, finish_reason: 'stop', index: 0 }], model: 'fixture-model' },
  ]);
}

function makeProcessed(): ProcessedRequest {
  return {
    chatSurface: 'web' as const,
    requestId: 'fixture-places-request',
    chatRequest: {
      model: 'fixture-model',
      messages: [{ role: 'user', content: USER_MESSAGE }],
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
      messages: [{ role: 'user', content: USER_MESSAGE }],
      max_tokens: 512,
      stream: true,
      tools: [placesSearchToolDef()],
    },
  } as ProcessedRequest;
}

async function collect(generator: AsyncGenerator<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let output = '';
  for await (const chunk of generator) output += decoder.decode(chunk);
  return output;
}

function cardsFrom(output: string) {
  return output
    .split('\n')
    .filter((line) => line.startsWith('data: {'))
    .flatMap((line) => {
      const payload = JSON.parse(line.slice('data: '.length)) as {
        choices?: Array<{ delta?: { x_interactive_card?: unknown } }>;
      };
      const card = parseInteractiveCardDelta(payload.choices?.[0]?.delta?.x_interactive_card);
      return card ? [card] : [];
    });
}

describe('places search tool result routing', () => {
  beforeEach(() => {
    provider.stream.mockReset();
    places.execute.mockReset();
  });

  it('sends the search result to the transcript as a places card and still answers', async () => {
    places.execute.mockResolvedValue({ ok: true, payload: PAYLOAD });
    provider.stream
      .mockResolvedValueOnce(placesToolCallStream())
      .mockResolvedValueOnce(finalAnswerStream('Blue Bottle Coffee is open now.'));

    const output = await collect(runToolLoop(makeProcessed(), { approvalMode: 'auto' }));
    const cards = cardsFrom(output);

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      recognized: true,
      kind: 'places.v1',
      cardId: TOOL_CALL_ID,
      producedBy: { toolCallId: TOOL_CALL_ID, toolName: PLACES_SEARCH_TOOL_NAME },
    });
    expect(output).toContain('Blue Bottle Coffee is open now.');
    expect(output).toContain('data: [DONE]');
  });

  it('emits no card when the search failed, so nothing claims live place data', async () => {
    places.execute.mockResolvedValue({
      ok: false,
      errorCode: 'upstream_error',
      message: 'The places provider returned HTTP 503.',
    });
    provider.stream
      .mockResolvedValueOnce(placesToolCallStream())
      .mockResolvedValueOnce(finalAnswerStream('I could not check live places just now.'));

    const output = await collect(runToolLoop(makeProcessed(), { approvalMode: 'auto' }));

    expect(cardsFrom(output)).toHaveLength(0);
    expect(output).toContain('I could not check live places just now.');
  });
});
