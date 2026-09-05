import { describe, it, expect, vi, beforeEach } from 'vitest';

const dnsMocks = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock('undici', async (importOriginal) => {
  // pinnedPublicFetch calls undici's own fetch so its Agent and its fetch come
  // from one undici instance; the production runtime rejects a foreign Agent on
  // the global fetch. These tests drive the network through vi.stubGlobal('fetch'),
  // so route undici's fetch back to the global one and leave every other export
  // (Agent, the pinning path) real.
  const actual = await importOriginal<typeof import('undici')>();
  return {
    ...actual,
    fetch: (...args: unknown[]) =>
      (globalThis.fetch as unknown as (...a: unknown[]) => unknown)(...args),
  };
});

vi.mock('node:dns/promises', () => ({
  default: { lookup: dnsMocks.lookup },
  lookup: dnsMocks.lookup,
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('./tool-loop-anthropic', () => ({
  buildToolLoopStream: vi.fn(),
  buildServingRouteId: vi.fn(),
}));
vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    generateIdempotencyKey: vi.fn(() => 'idem-key'),
    deductCredits: vi.fn(async () => ({ success: true })),
  },
}));
vi.mock('@/lib/services/llm-cost-calculator', () => ({
  LLMCostCalculator: {
    calculateCost: vi.fn(() => 7),
    calculateCostDollars: vi.fn(() => 0.07),
  },
  normalizeProviderId: (provider: string | null | undefined) =>
    typeof provider === 'string' ? provider.toLowerCase() : null,
}));
import { buildToolLoopStream } from './tool-loop-anthropic';
import { runResearchLoop, READY_MARKER } from './research-loop';
import { urlFetchToolDef } from '@/lib/url-fetch/url-fetch-tool';
import { requireProviderDefaultModel } from '@agiworkforce/types';
import type { ProcessedRequest } from './request-processor';

const streamRequestMock = vi.mocked(buildToolLoopStream);
const OPENAI_CHAT_MODEL = requireProviderDefaultModel('openai');

function sseStream(events: unknown[]): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const e of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}

function contentEvent(text: string) {
  return { choices: [{ delta: { content: text }, index: 0 }] };
}

function finishEvent(reason = 'stop') {
  return { choices: [{ delta: {}, finish_reason: reason, index: 0 }] };
}

function toolCallsTurn(calls: Array<{ id: string; name: string; args: unknown }>): ReadableStream {
  return sseStream([
    {
      choices: [
        {
          delta: {
            tool_calls: calls.map((c, index) => ({
              index,
              id: c.id,
              type: 'function',
              function: { name: c.name, arguments: JSON.stringify(c.args) },
            })),
          },
          index: 0,
        },
      ],
    },
    finishEvent('tool_calls'),
  ]);
}

function notesTurn(notes: string): ReadableStream {
  return sseStream([contentEvent(`${notes}\n${READY_MARKER}`), finishEvent()]);
}

function makeProcessed(): ProcessedRequest {
  return {
    requestId: 'req-1',
    requestedModel: OPENAI_CHAT_MODEL,
    provider: 'openai',
    estimatedCostCents: 2,
    quotaFeature: 'chat',
    isFlagshipRequest: false,
    chatRequest: { model: OPENAI_CHAT_MODEL },
    llmRequest: {
      model: OPENAI_CHAT_MODEL,
      messages: [{ role: 'user', content: 'research https://example.com/ in depth' }],
      max_tokens: 2048,
      tools: [{ type: 'web_search_preview' }, urlFetchToolDef()],
    },
  } as unknown as ProcessedRequest;
}

async function collectRaw(gen: AsyncGenerator<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let raw = '';
  for await (const chunk of gen) raw += decoder.decode(chunk);
  return raw;
}

const PAGE_HTML =
  '<html><head><title>Example Domain</title></head><body><main>' +
  '<h1>Example Domain</h1><p>This domain is for use in illustrative examples in documents, ' +
  'reserved for documentation use without prior coordination.</p></main></body></html>';

beforeEach(() => {
  vi.clearAllMocks();
  dnsMocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
});

function planStream() {
  return sseStream([contentEvent('["fetch the page", "check the docs"]'), finishEvent()]);
}

describe('research loop url_fetch integration', () => {
  it('executes a url_fetch call in a gathering round and merges the page into the cumulative sources', async () => {
    streamRequestMock
      .mockResolvedValueOnce(planStream())
      // Round 1, pass 1: the model asks to fetch a page.
      .mockResolvedValueOnce(
        toolCallsTurn([{ id: 'call_1', name: 'url_fetch', args: { url: 'https://example.com/' } }]),
      )
      // Round 1, continuation: notes + READY.
      .mockResolvedValueOnce(notesTurn('The page confirms example.com is reserved. [1]'))
      // Synthesis turn.
      .mockResolvedValueOnce(
        sseStream([contentEvent('Report: example.com is a reserved domain. [1]'), finishEvent()]),
      );

    const fetchMock = vi.fn(
      async () =>
        new Response(PAGE_HTML, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    try {
      const raw = await collectRaw(
        runResearchLoop(makeProcessed(), { userId: 'user-1', token: 't' }),
      );

      expect(raw).toContain('"name":"url_fetch"');
      expect(raw).toContain('"status_phrase":"Fetching example.com"');
      expect(raw).toContain('"x_tool_result"');

      expect(raw).toContain('"x_search_results"');
      expect(raw).toContain('"url":"https://example.com/"');
      expect(raw).toContain('"title":"Example Domain"');
      expect(raw).toContain('"position":1');

      expect(raw).toContain('Report: example.com is a reserved domain. [1]');
      expect(raw).toContain('"phase":"complete"');
      expect(raw).toContain('data: [DONE]');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect((fetchMock.mock.calls[0] as unknown[] | undefined)?.[0]).toBe('https://example.com/');

      expect(streamRequestMock).toHaveBeenCalledTimes(4);
      const continuation = streamRequestMock.mock.calls[2]?.[2] as {
        messages: Array<{ role: string; content: string; tool_call_id?: string }>;
      };
      const toolMsg = continuation.messages.find((m) => m.role === 'tool');
      expect(toolMsg?.tool_call_id).toBe('call_1');
      expect(toolMsg?.content).toContain('illustrative examples');
      expect(toolMsg?.content).not.toContain('<html>');

      const synthesis = streamRequestMock.mock.calls[3]?.[2] as {
        messages: Array<{ role: string; content: string }>;
      };
      const directive = synthesis.messages[synthesis.messages.length - 1];
      expect(directive?.content).toContain('[1] Example Domain, https://example.com/');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('feeds an honest error back for blocked URLs and over-budget or unknown tools', async () => {
    streamRequestMock
      .mockResolvedValueOnce(planStream())
      // Round 1: one blocked URL and one tool the loop never offers.
      .mockResolvedValueOnce(
        toolCallsTurn([
          { id: 'call_a', name: 'url_fetch', args: { url: 'http://169.254.169.254/latest/' } },
          { id: 'call_b', name: 'execute_code', args: { code: '1' } },
        ]),
      )
      .mockResolvedValueOnce(notesTurn('Could not fetch anything useful.'))
      .mockResolvedValueOnce(sseStream([contentEvent('Report without sources.'), finishEvent()]));

    const fetchMock = vi.fn(async () => new Response('never', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      const raw = await collectRaw(
        runResearchLoop(makeProcessed(), { userId: 'user-1', token: 't' }),
      );

      expect(raw).toContain('Fetch failed (url_not_allowed)');
      expect(raw).toContain('is not available in research mode');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(raw).not.toContain('"x_search_results"');

      const continuation = streamRequestMock.mock.calls[2]?.[2] as {
        messages: Array<{ role: string; content: string; tool_call_id?: string }>;
      };
      const toolIds = continuation.messages
        .filter((m) => m.role === 'tool')
        .map((m) => m.tool_call_id);
      expect(toolIds).toEqual(['call_a', 'call_b']);

      expect(raw).toContain('Report without sources.');
      expect(raw).toContain('data: [DONE]');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('caps fetches per round and returns a budget error for excess calls', async () => {
    streamRequestMock
      .mockResolvedValueOnce(planStream())
      .mockResolvedValueOnce(
        toolCallsTurn([
          { id: 'c1', name: 'url_fetch', args: { url: 'https://one.example/' } },
          { id: 'c2', name: 'url_fetch', args: { url: 'https://two.example/' } },
          { id: 'c3', name: 'url_fetch', args: { url: 'https://three.example/' } },
          { id: 'c4', name: 'url_fetch', args: { url: 'https://four.example/' } },
        ]),
      )
      .mockResolvedValueOnce(notesTurn('Enough gathered.'))
      .mockResolvedValueOnce(sseStream([contentEvent('Report.'), finishEvent()]));

    const fetchMock = vi.fn(
      async (url: unknown) =>
        new Response(
          `<html><head><title>T</title></head><body><p>page ${String(url)}</p></body></html>`,
          {
            status: 200,
            headers: { 'content-type': 'text/html' },
          },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    try {
      const raw = await collectRaw(
        runResearchLoop(makeProcessed(), { userId: 'user-1', token: 't' }),
      );

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(raw).toContain('Fetch budget for this research run is exhausted');

      const continuation = streamRequestMock.mock.calls[2]?.[2] as {
        messages: Array<{ role: string; content: string; tool_call_id?: string }>;
      };
      const toolIds = continuation.messages
        .filter((m) => m.role === 'tool')
        .map((m) => m.tool_call_id);
      expect(toolIds).toEqual(['c1', 'c2', 'c3', 'c4']);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
