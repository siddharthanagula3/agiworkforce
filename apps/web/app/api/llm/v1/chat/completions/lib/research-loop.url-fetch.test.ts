/**
 * Deep-research × url_fetch integration: gathering rounds execute
 * model-emitted url_fetch calls (real executeUrlFetch dispatch with mocked
 * HTTP/DNS), feed the page text back to the model, and dedupe fetched pages
 * INTO the same cumulative x_search_results list as provider search results.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const dnsMocks = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock('node:dns/promises', () => ({
  default: { lookup: dnsMocks.lookup },
  lookup: dnsMocks.lookup,
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('./tool-loop-anthropic', () => ({
  buildToolLoopStream: vi.fn(),
}));
vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    generateIdempotencyKey: vi.fn(() => 'idem-key'),
    deductCredits: vi.fn(async () => ({ success: true })),
  },
}));
vi.mock('@/lib/services/llm-cost-calculator', () => ({
  LLMCostCalculator: { calculateCost: vi.fn(() => 7) },
}));
import { buildToolLoopStream } from './tool-loop-anthropic';
import { runResearchLoop, READY_MARKER } from './research-loop';
import { urlFetchToolDef } from '@/lib/url-fetch/url-fetch-tool';
import type { ProcessedRequest } from './request-processor';

const streamRequestMock = vi.mocked(buildToolLoopStream);

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    requestedModel: 'gpt-5.6-terra',
    provider: 'openai',
    estimatedCostCents: 2,
    quotaFeature: 'chat',
    isFlagshipRequest: false,
    chatRequest: { model: 'gpt-5.6-terra' },
    llmRequest: {
      model: 'gpt-5.6-terra',
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

/**
 * The loop's tool-free planning turn (CAP-045 slice 2) runs before gathering
 * whenever the iteration budget allows it, so every stream chain below queues
 * it first.
 */
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

      // Fetch timeline events with the domain phrase.
      expect(raw).toContain('"name":"url_fetch"');
      expect(raw).toContain('"status_phrase":"Fetching example.com"');
      expect(raw).toContain('"x_tool_result"');

      // The fetched page joined the cumulative source list (position 1 — the
      // aggregator had no earlier provider-search sources in this run).
      expect(raw).toContain('"x_search_results"');
      expect(raw).toContain('"url":"https://example.com/"');
      expect(raw).toContain('"title":"Example Domain"');
      expect(raw).toContain('"position":1');

      // The synthesis report streamed and the run completed.
      expect(raw).toContain('Report: example.com is a reserved domain. [1]');
      expect(raw).toContain('"phase":"complete"');
      expect(raw).toContain('data: [DONE]');

      // Exactly one real (mocked) HTTP fetch, for the model's URL.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect((fetchMock.mock.calls[0] as unknown[] | undefined)?.[0]).toBe('https://example.com/');

      // The continuation turn (call 3, after the planning turn) carried the assistant tool_call turn
      // AND the tool result with the extracted page text.
      expect(streamRequestMock).toHaveBeenCalledTimes(4);
      const continuation = streamRequestMock.mock.calls[2]?.[2] as {
        messages: Array<{ role: string; content: string; tool_call_id?: string }>;
      };
      const toolMsg = continuation.messages.find((m) => m.role === 'tool');
      expect(toolMsg?.tool_call_id).toBe('call_1');
      expect(toolMsg?.content).toContain('illustrative examples');
      expect(toolMsg?.content).not.toContain('<html>');

      // The synthesis directive's numbered source list includes the fetched page.
      const synthesis = streamRequestMock.mock.calls[3]?.[2] as {
        messages: Array<{ role: string; content: string }>;
      };
      const directive = synthesis.messages[synthesis.messages.length - 1];
      expect(directive?.content).toContain('[1] Example Domain — https://example.com/');
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
      // No source was fabricated for the failed fetch (no cumulative source
      // event at all: the aggregator stayed empty).
      expect(raw).not.toContain('"x_search_results"');

      // Both tool calls got results in the continuation thread (no dangling
      // tool_calls, which providers reject).
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

      // Only the per-round cap (3) actually fetched; the 4th got the honest
      // budget error and still received a tool result.
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
