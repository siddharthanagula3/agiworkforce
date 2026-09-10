import { describe, it, expect, vi, beforeEach } from 'vitest';

const dnsMocks = vi.hoisted(() => ({ lookup: vi.fn() }));
const searchCostMocks = vi.hoisted(() => ({ record: vi.fn(async () => undefined) }));
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
  MICROUSD_PER_LEDGER_CENT: 10_000,
  microusdFromLedgerCents: (cents: number) => Math.round(cents) * 10_000,
  ledgerCentsFromMicrousd: (microusd: number) => Math.floor((microusd + 5_000) / 10_000),

  CreditService: {
    generateIdempotencyKey: vi.fn(() => 'idem-key'),
    deductCredits: vi.fn(async () => ({ success: true })),
  },
}));
vi.mock('@/lib/services/llm-cost-calculator', () => ({
  LLMCostCalculator: {
    calculateListCost: vi.fn(() => null),
    calculateListCostMicrousd: vi.fn(() => null),
    estimateListCost: vi.fn(() => null),
    estimateListCostMicrousd: vi.fn(() => null),
    calculateCost: vi.fn(() => 7),
    calculateCostMicrousd: vi.fn(() => 70000),
    calculateCostDollars: vi.fn(() => 0.07),
  },
  normalizeProviderId: (provider: string | null | undefined) =>
    typeof provider === 'string' ? provider.toLowerCase() : null,
}));
vi.mock('@/lib/web-search/perplexity-search-cost', () => ({
  recordPerplexitySearchCost: searchCostMocks.record,
}));
import { buildToolLoopStream } from './tool-loop-anthropic';
import { runResearchLoop, READY_MARKER } from './research-loop';
import { urlFetchToolDef } from '@/lib/url-fetch/url-fetch-tool';
import { webSearchToolDef, WEB_SEARCH_MAX_CALLS_PER_TURN } from '@/lib/web-search/web-search-tool';
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

// ─── Runtime web_search (harnesses with no provider-native search) ────────────

const PERPLEXITY_URL = 'https://api.perplexity.ai/search';
const ZHIPU_CHAT_MODEL = requireProviderDefaultModel('zhipu');

/**
 * A managed harness whose provider has no native search: request-processor
 * attaches the runtime `web_search` function tool instead, and the loop is the
 * one that has to execute it.
 */
function makeGenericSearchProcessed(tools: unknown[]): ProcessedRequest {
  return {
    requestId: 'req-generic-search',
    requestedModel: ZHIPU_CHAT_MODEL,
    provider: 'zhipu',
    organizationId: null,
    estimatedCostCents: 2,
    quotaFeature: 'chat',
    isFlagshipRequest: false,
    chatRequest: { model: ZHIPU_CHAT_MODEL },
    llmRequest: {
      model: ZHIPU_CHAT_MODEL,
      messages: [{ role: 'user', content: 'research solid-state batteries' }],
      max_tokens: 2048,
      tools,
    },
  } as unknown as ProcessedRequest;
}

function researchStatuses(raw: string): Array<Record<string, unknown>> {
  const statuses: Array<Record<string, unknown>> = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data: ') || trimmed === 'data: [DONE]') continue;
    const event = JSON.parse(trimmed.slice(6)) as {
      choices?: Array<{ delta?: Record<string, unknown> }>;
    };
    const status = event.choices?.[0]?.delta?.['x_research_status'];
    if (status) statuses.push(status as Record<string, unknown>);
  }
  return statuses;
}

function perplexityResponse(results: Array<{ url: string; title: string; snippet?: string }>) {
  return new Response(JSON.stringify({ results }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('research loop runtime web_search', () => {
  it('executes the runtime tool on a harness without native search and counts its results as sources', async () => {
    streamRequestMock
      .mockResolvedValueOnce(planStream())
      .mockResolvedValueOnce(
        toolCallsTurn([
          { id: 'call_s1', name: 'web_search', args: { query: 'solid-state battery 2026' } },
        ]),
      )
      .mockResolvedValueOnce(notesTurn('Two independent sources agree on the 2027 timeline. [1]'))
      .mockResolvedValueOnce(
        sseStream([contentEvent('Report: pilot lines start in 2027. [1][2]'), finishEvent()]),
      );

    const fetchMock = vi.fn(async () =>
      perplexityResponse([
        { url: 'https://cells.example/roadmap', title: 'Roadmap', snippet: 'pilot lines in 2027' },
        { url: 'https://oem.example/timeline', title: 'OEM timeline', snippet: 'first vehicles' },
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('PERPLEXITY_API_KEY', 'test-key');

    try {
      const raw = await collectRaw(
        runResearchLoop(makeGenericSearchProcessed([webSearchToolDef(), urlFetchToolDef()]), {
          userId: 'user-1',
          token: 't',
        }),
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect((fetchMock.mock.calls[0] as unknown[] | undefined)?.[0]).toBe(PERPLEXITY_URL);
      const requestInit = (fetchMock.mock.calls[0] as unknown[] | undefined)?.[1] as {
        body?: string;
      };
      expect(requestInit?.body).toContain('solid-state battery 2026');

      // The gathering round keeps the runtime tool; the planning turn stays tool-free.
      expect((streamRequestMock.mock.calls[0]?.[2] as { tools?: unknown[] }).tools).toBeUndefined();
      expect((streamRequestMock.mock.calls[1]?.[2] as { tools?: unknown[] }).tools).toEqual([
        webSearchToolDef(),
        urlFetchToolDef(),
      ]);

      expect(raw).toContain('"args":{"query":"solid-state battery 2026"}');
      expect(raw).toContain('"x_tool_result"');
      expect(raw).toContain('"tool_call_id":"call_s1"');
      expect(raw).toContain('"url":"https://cells.example/roadmap"');
      expect(raw).toContain('"url":"https://oem.example/timeline"');
      expect(raw).toContain('"position":2');
      expect(raw).toContain('Report: pilot lines start in 2027. [1][2]');

      const continuation = streamRequestMock.mock.calls[2]?.[2] as {
        messages: Array<{ role: string; content: string; tool_call_id?: string }>;
      };
      const toolMsg = continuation.messages.find((m) => m.role === 'tool');
      expect(toolMsg?.tool_call_id).toBe('call_s1');
      expect(toolMsg?.content).toContain('Search results for "solid-state battery 2026"');
      expect(toolMsg?.content).toContain('https://cells.example/roadmap');

      const synthesis = streamRequestMock.mock.calls[3]?.[2] as {
        messages: Array<{ role: string; content: string }>;
      };
      expect(synthesis.messages[synthesis.messages.length - 1]?.content).toContain(
        '[1] Roadmap, https://cells.example/roadmap',
      );

      const statuses = researchStatuses(raw);
      const last = statuses[statuses.length - 1];
      expect(last?.['phase']).toBe('complete');
      expect(last?.['sources']).toBe(2);
      expect(last?.['searches']).toBe(1);

      expect(searchCostMocks.record).toHaveBeenCalledTimes(1);
      expect(searchCostMocks.record).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', calls: 1 }),
      );
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it('caps runtime searches per round and hands the model the budget message', async () => {
    streamRequestMock
      .mockResolvedValueOnce(planStream())
      .mockResolvedValueOnce(
        toolCallsTurn([
          { id: 's1', name: 'web_search', args: { query: 'one' } },
          { id: 's2', name: 'web_search', args: { query: 'two' } },
          { id: 's3', name: 'web_search', args: { query: 'three' } },
          { id: 's4', name: 'web_search', args: { query: 'four' } },
        ]),
      )
      .mockResolvedValueOnce(notesTurn('Enough gathered.'))
      .mockResolvedValueOnce(sseStream([contentEvent('Report. [1]'), finishEvent()]));

    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      return perplexityResponse([
        { url: `https://result${call}.example/`, title: `Result ${call}`, snippet: 'snippet' },
      ]);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('PERPLEXITY_API_KEY', 'test-key');

    try {
      const raw = await collectRaw(
        runResearchLoop(makeGenericSearchProcessed([webSearchToolDef(), urlFetchToolDef()]), {
          userId: 'user-1',
          token: 't',
        }),
      );

      expect(fetchMock).toHaveBeenCalledTimes(WEB_SEARCH_MAX_CALLS_PER_TURN);
      expect(raw).toContain(
        `this turn has already run its ${WEB_SEARCH_MAX_CALLS_PER_TURN} allowed web searches`,
      );

      const continuation = streamRequestMock.mock.calls[2]?.[2] as {
        messages: Array<{ role: string; content: string; tool_call_id?: string }>;
      };
      expect(
        continuation.messages.filter((m) => m.role === 'tool').map((m) => m.tool_call_id),
      ).toEqual(['s1', 's2', 's3', 's4']);

      const last = researchStatuses(raw).at(-1);
      expect(last?.['searches']).toBe(WEB_SEARCH_MAX_CALLS_PER_TURN);
      expect(last?.['sources']).toBe(WEB_SEARCH_MAX_CALLS_PER_TURN);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it('says a route with no web search could not search instead of running empty rounds', async () => {
    const raw = await collectRaw(
      runResearchLoop(makeGenericSearchProcessed([urlFetchToolDef()]), {
        userId: 'user-1',
        token: 't',
      }),
    );

    expect(streamRequestMock).not.toHaveBeenCalled();
    const statuses = researchStatuses(raw);
    expect(statuses).toHaveLength(1);
    expect(statuses[0]?.['phase']).toBe('error');
    expect(statuses[0]?.['label']).toBe('No web search was available on this route');
    expect(raw).toContain('this model was served by a route that had none available');
    expect(raw).not.toContain('"status_phrase":"Searching the web"');
    expect(raw).not.toContain('"x_search_results"');
    expect(raw).toContain('data: [DONE]');
  });
});
