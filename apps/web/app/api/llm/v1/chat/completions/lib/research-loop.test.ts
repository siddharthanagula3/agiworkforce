/**
 * Unit tests for the Deep Research loop: iteration caps, search caps,
 * wall-clock budget, event emission (x_research_status / x_tool_status /
 * cumulative x_search_results), content suppression on gathering rounds,
 * mid-loop errors, cancellation, and usage accounting.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const dnsMocks = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock('undici', async (importOriginal) => {
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
vi.mock('@/lib/services/llm-cost-calculator', () => ({
  LLMCostCalculator: {
    calculateCost: vi.fn(() => 7),
    calculateCostDollars: vi.fn(() => 0.07),
  },
  normalizeProviderId: (provider: string | null | undefined) =>
    typeof provider === 'string' ? provider.toLowerCase() : null,
}));
import { buildToolLoopStream } from './tool-loop-anthropic';
import { createObservedProviderUsage } from '@/lib/services/managed-usage-accounting-service';
import {
  runResearchLoop,
  researchStatusEvent,
  researchPlanEvent,
  parsePlanQueries,
  extractReportOutline,
  extractUserQuery,
  SourceAggregator,
  READY_MARKER,
  type ResearchRunReport,
} from './research-loop';
import { saveResearchReport } from '@/lib/services/research-report-service';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { requireProviderDefaultModel } from '@agiworkforce/types';
import type { ProcessedRequest } from './request-processor';

// buildToolLoopStream(provider, processed, stepRequest, responseModel) -- the
// per-step llmRequest is argument index 2.
const streamRequestMock = vi.mocked(buildToolLoopStream);
const GOOGLE_CHAT_MODEL = requireProviderDefaultModel('google');

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

function searchResultsEvent(urls: Array<{ url: string; title?: string }>) {
  return {
    choices: [
      {
        delta: {
          x_search_results: {
            content: urls.map((u) => ({
              type: 'web_search_result',
              url: u.url,
              title: u.title ?? u.url,
            })),
          },
        },
        index: 0,
      },
    ],
  };
}

function usageEvent(promptTokens: number, completionTokens: number) {
  return {
    choices: [],
    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
  };
}

function finishEvent() {
  return { choices: [{ delta: {}, finish_reason: 'stop', index: 0 }] };
}

/**
 * The planning turn's stream (CAP-045 slice 2). The loop runs one tool-free
 * planning call before gathering whenever the iteration budget allows it
 * (maxIterations >= 3, which includes the default), so every multi-round
 * expectation below queues this first.
 */
const PLAN_QUERIES = ['query one', 'query two', 'query three'];

function planStream(queries: string[] = PLAN_QUERIES) {
  return sseStream([contentEvent(JSON.stringify(queries)), finishEvent()]);
}

function researchPlans(run: CollectedRun): Array<Record<string, unknown>> {
  return run.events
    .map((e) => delta(e)['x_research_plan'])
    .filter((p): p is Record<string, unknown> => !!p);
}

function planSteps(plan: Record<string, unknown> | undefined): Array<Record<string, unknown>> {
  return (plan?.['steps'] ?? []) as Array<Record<string, unknown>>;
}

function makeProcessed(): ProcessedRequest {
  return {
    requestId: 'req-1',
    requestedModel: GOOGLE_CHAT_MODEL,
    provider: 'google',
    estimatedCostCents: 2,
    quotaFeature: 'chat',
    isFlagshipRequest: false,
    chatRequest: { model: GOOGLE_CHAT_MODEL },
    llmRequest: {
      model: GOOGLE_CHAT_MODEL,
      messages: [{ role: 'user', content: 'research the topic' }],
      max_tokens: 2048,
      tools: [{ google_search: {} }],
    },
  } as unknown as ProcessedRequest;
}

interface CollectedRun {
  /** Parsed data payloads in order ([DONE] excluded). */
  events: Array<Record<string, unknown>>;
  /** Raw decoded SSE text. */
  raw: string;
  doneCount: number;
}

async function collectRun(gen: AsyncGenerator<Uint8Array>): Promise<CollectedRun> {
  const decoder = new TextDecoder();
  let raw = '';
  for await (const chunk of gen) {
    raw += decoder.decode(chunk);
  }
  const events: Array<Record<string, unknown>> = [];
  let doneCount = 0;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data: ')) continue;
    const payload = trimmed.slice(6);
    if (payload === '[DONE]') {
      doneCount += 1;
      continue;
    }
    events.push(JSON.parse(payload) as Record<string, unknown>);
  }
  return { events, raw, doneCount };
}

function delta(event: Record<string, unknown>): Record<string, unknown> {
  const choices = event['choices'] as Array<Record<string, unknown>> | undefined;
  return (choices?.[0]?.['delta'] ?? {}) as Record<string, unknown>;
}

function researchStatuses(run: CollectedRun): Array<Record<string, unknown>> {
  return run.events
    .map((e) => delta(e)['x_research_status'])
    .filter((s): s is Record<string, unknown> => !!s);
}

function forwardedContent(run: CollectedRun): string {
  return run.events
    .map((e) => delta(e)['content'])
    .filter((c): c is string => typeof c === 'string')
    .join('');
}

function lastSearchResults(run: CollectedRun): Array<Record<string, unknown>> | undefined {
  const all = run.events
    .map((e) => delta(e)['x_search_results'])
    .filter((s): s is Record<string, unknown> => !!s);
  const last = all[all.length - 1];
  return last?.['content'] as Array<Record<string, unknown>> | undefined;
}

function canonicalAgentEvents(run: CollectedRun): Array<Record<string, unknown>> {
  return run.events
    .map((entry) => delta(entry)['x_agent_event'])
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((envelope) => envelope['event'] as Record<string, unknown>);
}

const BILLING = { userId: 'user-1', token: 'tok' };

beforeEach(() => {
  vi.clearAllMocks();
  dnsMocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
});

// ─── SourceAggregator ─────────────────────────────────────────────────────────

describe('SourceAggregator', () => {
  it('dedupes by URL with stable 1-based positions in insertion order', () => {
    const agg = new SourceAggregator();
    expect(agg.add({ url: 'https://a.com', title: 'A' })).toBe(true);
    expect(agg.add({ url: 'https://b.com', title: 'B' })).toBe(true);
    expect(agg.add({ url: 'https://a.com', title: 'A again' })).toBe(false);
    const list = agg.list();
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ url: 'https://a.com', position: 1 });
    expect(list[1]).toMatchObject({ url: 'https://b.com', position: 2 });
  });

  it('ignores entries without a usable URL', () => {
    const agg = new SourceAggregator();
    expect(agg.add({ url: '', title: 'no url' })).toBe(false);
    expect(agg.add({ url: 42, title: 'bad type' })).toBe(false);
    expect(agg.size).toBe(0);
    expect(agg.toSearchResultsEvent('m')).toBeNull();
  });

  it('dedupes across protocol, www, and trailing-slash variants like the client card list does', () => {
    const agg = new SourceAggregator();
    expect(agg.add({ url: 'http://example.com/report', title: 'Report' })).toBe(true);
    expect(agg.add({ url: 'https://www.example.com/report/', title: 'Report dup' })).toBe(false);
    expect(
      agg.add({ url: 'https://example.com/report?utm_source=x', title: 'Different query' }),
    ).toBe(true);
    expect(agg.size).toBe(2);
  });
});

describe('title enrichment on gathering rounds', () => {
  it('enriches a search result missing a title with the page headline before the round-end source event', async () => {
    streamRequestMock
      .mockResolvedValueOnce(planStream())
      .mockResolvedValueOnce(
        sseStream([
          contentEvent(`notes\n${READY_MARKER}`),
          searchResultsEvent([{ url: 'https://notitle.example.com/article', title: '' }]),
          finishEvent(),
        ]),
      )
      .mockResolvedValueOnce(sseStream([contentEvent('Final report [1]'), finishEvent()]));

    const fetchMock = vi.fn(
      async () =>
        new Response('<html><head><title>Real Headline</title></head><body /></html>', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    try {
      const run = await collectRun(runResearchLoop(makeProcessed(), BILLING));
      const sources = lastSearchResults(run);
      expect(sources?.[0]).toMatchObject({
        url: 'https://notitle.example.com/article',
        title: 'Real Headline',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect((fetchMock.mock.calls[0] as unknown[] | undefined)?.[0]).toBe(
        'https://notitle.example.com/article',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('never fetches a search result that already has a title', async () => {
    streamRequestMock
      .mockResolvedValueOnce(planStream())
      .mockResolvedValueOnce(
        sseStream([
          contentEvent(`notes\n${READY_MARKER}`),
          searchResultsEvent([{ url: 'https://titled.example.com/', title: 'Already Titled' }]),
          finishEvent(),
        ]),
      )
      .mockResolvedValueOnce(sseStream([contentEvent('Final report [1]'), finishEvent()]));

    const fetchMock = vi.fn(async () => new Response('unused', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      const run = await collectRun(runResearchLoop(makeProcessed(), BILLING));
      const sources = lastSearchResults(run);
      expect(sources?.[0]).toMatchObject({
        url: 'https://titled.example.com/',
        title: 'Already Titled',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// ─── researchStatusEvent wire shape ───────────────────────────────────────────

describe('researchStatusEvent', () => {
  it('emits the additive x_research_status delta with snake_case wire fields', () => {
    const line = researchStatusEvent(
      {
        phase: 'searching',
        label: 'Searching the web',
        iteration: 2,
        maxIterations: 6,
        searches: 3,
        maxSearches: 12,
        sources: 5,
        elapsedMs: 1234,
      },
      'test-model',
    );
    const parsed = JSON.parse(line.replace(/^data: /, '')) as Record<string, unknown>;
    const status = delta(parsed)['x_research_status'] as Record<string, unknown>;
    expect(status).toEqual({
      phase: 'searching',
      label: 'Searching the web',
      iteration: 2,
      max_iterations: 6,
      searches: 3,
      // The cap the run is actually bounded by, so a count that stops at 12
      // reads as "budget spent" rather than as the run giving up.
      max_searches: 12,
      sources: 5,
      elapsed_ms: 1234,
    });
    expect(parsed['model']).toBe('test-model');
  });
});

// ─── Loop behavior ────────────────────────────────────────────────────────────

describe('runResearchLoop', () => {
  it('honors durable cancellation before starting a provider side effect', async () => {
    const isCancellationRequested = vi.fn().mockResolvedValue(true);

    const run = await collectRun(
      runResearchLoop(makeProcessed(), BILLING, { isCancellationRequested }),
    );

    expect(isCancellationRequested).toHaveBeenCalledOnce();
    expect(streamRequestMock).not.toHaveBeenCalled();
    expect(canonicalAgentEvents(run)).toEqual([
      expect.objectContaining({ type: 'task-state-changed', state: 'cancelled' }),
      { type: 'stop', reason: 'cancelled' },
    ]);
    expect(run.doneCount).toBe(1);
  });

  it('runs plan -> gather -> synthesis, suppresses notes, forwards the report, and emits cumulative deduped sources', async () => {
    streamRequestMock
      .mockResolvedValueOnce(planStream())
      .mockResolvedValueOnce(
        sseStream([
          contentEvent(`secret gathering notes\n${READY_MARKER}`),
          searchResultsEvent([
            { url: 'https://a.com', title: 'A' },
            { url: 'https://b.com', title: 'B' },
            { url: 'https://a.com', title: 'A dup' },
          ]),
          usageEvent(100, 50),
          finishEvent(),
        ]),
      )
      .mockResolvedValueOnce(
        sseStream([contentEvent('Final report [1][2]'), usageEvent(200, 80), finishEvent()]),
      );

    const run = await collectRun(runResearchLoop(makeProcessed(), BILLING));

    // Exactly 3 provider calls: planning + one gathering round (READY marker)
    // + synthesis.
    expect(streamRequestMock).toHaveBeenCalledTimes(3);

    // Gathering notes never reach the client; the report does.
    expect(run.raw).not.toContain('secret gathering notes');
    expect(forwardedContent(run)).toBe('Final report [1][2]');
    expect(canonicalAgentEvents(run).filter((event) => event['type'] === 'text-delta')).toEqual([
      { type: 'text-delta', delta: 'Final report [1][2]' },
    ]);

    // Cumulative sources: deduped, stable positions.
    const sources = lastSearchResults(run);
    expect(sources).toHaveLength(2);
    expect(sources?.[0]).toMatchObject({ url: 'https://a.com', position: 1 });
    expect(sources?.[1]).toMatchObject({ url: 'https://b.com', position: 2 });

    // Phase progression and terminal [DONE].
    const phases = researchStatuses(run).map((s) => s['phase']);
    expect(phases[0]).toBe('planning');
    expect(phases).toContain('searching');
    expect(phases).toContain('synthesizing');
    expect(phases[phases.length - 1]).toBe('complete');
    expect(run.doneCount).toBe(1);

    // Synthesis turn saw the gathered notes and the numbered source list.
    const synthesisRequest = streamRequestMock.mock.calls[2]?.[2] as {
      messages: Array<{ role: string; content: string }>;
    };
    const synthDirective = synthesisRequest.messages[synthesisRequest.messages.length - 1];
    expect(synthDirective?.role).toBe('user');
    expect(synthDirective?.content).toContain('[1] A, https://a.com');
    expect(synthDirective?.content).toContain('[2] B, https://b.com');
    // Notes were appended (markers stripped) for the synthesis turn to build on.
    const appendedNotes = synthesisRequest.messages.find(
      (m) => m.role === 'assistant' && m.content.includes('secret gathering notes'),
    );
    expect(appendedNotes).toBeDefined();
    expect(appendedNotes?.content).not.toContain(READY_MARKER);
  });

  it('ends the run with a terminal stop envelope so the activity spine stops spinning', async () => {
    streamRequestMock
      .mockResolvedValueOnce(planStream())
      .mockResolvedValueOnce(sseStream([contentEvent(READY_MARKER), finishEvent()]))
      .mockResolvedValueOnce(sseStream([contentEvent('report'), finishEvent()]));

    const run = await collectRun(runResearchLoop(makeProcessed(), BILLING));

    const events = canonicalAgentEvents(run);
    expect(events[events.length - 1]).toEqual({ type: 'stop', reason: 'end-turn' });
  });

  it('ends a failed run with a terminal stop envelope', async () => {
    streamRequestMock
      .mockResolvedValueOnce(planStream())
      .mockRejectedValueOnce(new Error('upstream exploded'));

    const run = await collectRun(runResearchLoop(makeProcessed(), BILLING));

    const events = canonicalAgentEvents(run);
    expect(events[events.length - 1]).toEqual({ type: 'stop', reason: 'error' });
  });

  it('emits web_search tool running/completed status events per gathering round', async () => {
    streamRequestMock
      .mockResolvedValueOnce(planStream())
      .mockResolvedValueOnce(sseStream([contentEvent(READY_MARKER), finishEvent()]))
      .mockResolvedValueOnce(sseStream([contentEvent('report'), finishEvent()]));

    const run = await collectRun(runResearchLoop(makeProcessed(), BILLING));
    const toolStatuses = run.events
      .map((e) => delta(e)['x_tool_status'])
      .filter((s): s is Record<string, unknown> => !!s)
      .filter((s) => s['name'] === 'web_search');
    expect(toolStatuses.map((s) => s['status'])).toEqual(['running', 'completed']);
    expect(toolStatuses[0]?.['status_phrase']).toBe('Searching the web');
  });

  it('stops gathering at the iteration cap and still synthesizes', async () => {
    // Model never signals READY: with maxIterations=3, expect 1 planning turn +
    // 1 gathering round + 1 synthesis = 3 provider calls total. The plan reply
    // is unparseable here, which must not stop the run.
    streamRequestMock.mockImplementation(async () =>
      sseStream([contentEvent('more notes, never ready'), finishEvent()]),
    );

    const run = await collectRun(
      runResearchLoop(makeProcessed(), BILLING, { maxIterations: 3, maxSearches: 15 }),
    );
    expect(streamRequestMock).toHaveBeenCalledTimes(3);
    const phases = researchStatuses(run).map((s) => s['phase']);
    expect(phases[phases.length - 1]).toBe('complete');
    expect(run.doneCount).toBe(1);
  });

  it('stops gathering when the search cap is reached and flags the report as cut short', async () => {
    // Each gathering round yields 2 search events; cap of 3 stops after round 2.
    let call = 0;
    streamRequestMock.mockImplementation(async () => {
      call += 1;
      if (call <= 5) {
        // Two distinct search events per round (each x_search_results event
        // counts as one search).
        return sseStream([
          searchResultsEvent([{ url: `https://s${call}a.com` }]),
          searchResultsEvent([{ url: `https://s${call}b.com` }]),
          contentEvent('notes'),
          finishEvent(),
        ]);
      }
      return sseStream([contentEvent('report'), finishEvent()]);
    });

    await collectRun(
      runResearchLoop(makeProcessed(), BILLING, { maxIterations: 8, maxSearches: 3 }),
    );
    // Planning turn, then round 1: searches=2 (<3, continue). Round 2:
    // searches=4 (>=3, stop). +synthesis.
    expect(streamRequestMock).toHaveBeenCalledTimes(4);
    const synthesisRequest = streamRequestMock.mock.calls[3]?.[2] as {
      messages: Array<{ role: string; content: string }>;
    };
    const directive = synthesisRequest.messages[synthesisRequest.messages.length - 1];
    expect(directive?.content).toContain('search budget was reached');
  });

  it('does not credit a zero-search round toward the search cap or the displayed count', async () => {
    let call = 0;
    streamRequestMock.mockImplementation(async () => {
      call += 1;
      if (call === 1) return planStream();
      if (call === 2) {
        return sseStream([
          searchResultsEvent([{ url: 'https://round1.com' }]),
          contentEvent('notes'),
          finishEvent(),
        ]);
      }
      if (call === 3) {
        // A gap-filling round that ran no real search: no x_search_results
        // event at all, just review notes.
        return sseStream([contentEvent('reviewing notes, nothing new'), finishEvent()]);
      }
      if (call === 4) {
        return sseStream([
          searchResultsEvent([{ url: 'https://round3.com' }]),
          contentEvent('notes'),
          finishEvent(),
        ]);
      }
      return sseStream([contentEvent('report'), finishEvent()]);
    });

    const run = await collectRun(
      runResearchLoop(makeProcessed(), BILLING, { maxIterations: 5, maxSearches: 2 }),
    );

    // Plan + 3 gathering rounds + synthesis. A phantom floor on round 2 would
    // have tripped the cap of 2 after round 2 and skipped round 3 entirely.
    expect(streamRequestMock).toHaveBeenCalledTimes(5);
    const statuses = researchStatuses(run);
    expect(statuses[statuses.length - 1]?.['searches']).toBe(2);
  });

  it('stops gathering when the wall-clock budget is exhausted', async () => {
    streamRequestMock.mockImplementation(async () =>
      sseStream([contentEvent('notes, never ready'), finishEvent()]),
    );
    // Injected clock: each call advances 31s; 60s budget exhausts after round 2.
    let t = 0;
    const now = () => {
      t += 31_000;
      return t;
    };

    await collectRun(
      runResearchLoop(makeProcessed(), BILLING, {
        maxIterations: 8,
        maxSearches: 15,
        budgetMs: 60_000,
        now,
      }),
    );
    // Fewer than the full 7 gathering rounds ran, and synthesis still happened.
    const calls = streamRequestMock.mock.calls.length;
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(calls).toBeLessThan(8);
    const synthesisRequest = streamRequestMock.mock.calls[calls - 1]?.[2] as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(synthesisRequest.messages[synthesisRequest.messages.length - 1]?.content).toContain(
      'time budget was reached',
    );
  });

  it('surfaces an honest error and stops when the FIRST gathering turn fails', async () => {
    streamRequestMock
      .mockResolvedValueOnce(planStream())
      .mockRejectedValueOnce(new Error('provider exploded'));

    const run = await collectRun(runResearchLoop(makeProcessed(), BILLING));
    expect(streamRequestMock).toHaveBeenCalledTimes(2);
    const phases = researchStatuses(run).map((s) => s['phase']);
    expect(phases[phases.length - 1]).toBe('error');
    expect(forwardedContent(run)).not.toContain('provider exploded');
    expect(forwardedContent(run)).toContain(
      'Deep research failed before any results were gathered',
    );
    expect(run.doneCount).toBe(1);
  });

  it('keeps partial material and synthesizes when a LATER gathering round fails', async () => {
    streamRequestMock
      .mockResolvedValueOnce(planStream())
      .mockResolvedValueOnce(
        sseStream([
          searchResultsEvent([{ url: 'https://kept.com', title: 'Kept' }]),
          contentEvent('round 1 notes'),
          finishEvent(),
        ]),
      )
      .mockRejectedValueOnce(new Error('round 2 died'))
      .mockResolvedValueOnce(sseStream([contentEvent('partial report [1]'), finishEvent()]));

    const run = await collectRun(
      runResearchLoop(makeProcessed(), BILLING, { maxIterations: 6, maxSearches: 15 }),
    );
    expect(streamRequestMock).toHaveBeenCalledTimes(4);
    expect(forwardedContent(run)).toBe('partial report [1]');
    expect(lastSearchResults(run)?.[0]).toMatchObject({ url: 'https://kept.com', position: 1 });
    const synthesisRequest = streamRequestMock.mock.calls[3]?.[2] as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(synthesisRequest.messages[synthesisRequest.messages.length - 1]?.content).toContain(
      'web search round failed mid-run',
    );
    const phases = researchStatuses(run).map((s) => s['phase']);
    expect(phases[phases.length - 1]).toBe('complete');
  });

  it('reports an honest error (keeping sources) when the synthesis turn fails', async () => {
    streamRequestMock
      .mockResolvedValueOnce(planStream())
      .mockResolvedValueOnce(
        sseStream([
          searchResultsEvent([{ url: 'https://a.com', title: 'A' }]),
          contentEvent(`notes\n${READY_MARKER}`),
          finishEvent(),
        ]),
      )
      .mockRejectedValueOnce(new Error('synthesis died'));

    const run = await collectRun(runResearchLoop(makeProcessed(), BILLING));
    const phases = researchStatuses(run).map((s) => s['phase']);
    expect(phases[phases.length - 1]).toBe('error');
    expect(forwardedContent(run)).not.toContain('synthesis died');
    expect(forwardedContent(run)).toContain('failed while writing the report');
    expect(lastSearchResults(run)).toHaveLength(1);
    expect(run.doneCount).toBe(1);
  });

  it('exposes accumulated multi-turn usage for the route-owned settlement', async () => {
    streamRequestMock
      .mockResolvedValueOnce(
        sseStream([contentEvent(JSON.stringify(PLAN_QUERIES)), usageEvent(10, 5), finishEvent()]),
      )
      .mockResolvedValueOnce(
        sseStream([contentEvent(READY_MARKER), usageEvent(100, 50), finishEvent()]),
      )
      .mockResolvedValueOnce(
        sseStream([contentEvent('report'), usageEvent(200, 80), finishEvent()]),
      );

    const usage = createObservedProviderUsage();
    await collectRun(runResearchLoop(makeProcessed(), BILLING, { usage }));

    // The planning turn is billed like every other turn -- it is a real call.
    expect(usage).toMatchObject({
      providerCalls: 3,
      inputTokens: 310,
      outputTokens: 135,
    });
  });

  it('preserves observed usage when cancelled mid-stream (generator.return)', async () => {
    streamRequestMock
      .mockResolvedValueOnce(planStream())
      .mockResolvedValueOnce(
        sseStream([usageEvent(100, 50), contentEvent('notes'), finishEvent()]),
      );

    const usage = createObservedProviderUsage();
    const gen = runResearchLoop(makeProcessed(), BILLING, { usage });
    const decoder = new TextDecoder();
    // Consume until the first gathering round completes (its usage is then
    // recorded), then cancel like route.ts cancel() does.
    let guard = 0;
    while (guard < 50) {
      guard += 1;
      const { value, done } = await gen.next();
      if (done) throw new Error('stream ended before cancellation point');
      const text = decoder.decode(value);
      if (text.includes('"status":"completed"')) break;
    }
    await gen.return(new Uint8Array());
    expect(usage).toMatchObject({ providerCalls: 1, inputTokens: 100, outputTokens: 50 });
  });

  it('strips client-custom function tools but keeps provider-native search tools', async () => {
    const processed = makeProcessed();
    (processed.llmRequest.tools as unknown[]).push({
      type: 'function',
      function: { name: 'custom_tool', parameters: {} },
    });
    streamRequestMock
      .mockResolvedValueOnce(planStream())
      .mockResolvedValueOnce(sseStream([contentEvent(READY_MARKER), finishEvent()]))
      .mockResolvedValueOnce(sseStream([contentEvent('report'), finishEvent()]));

    await collectRun(runResearchLoop(processed, BILLING));
    // The planning turn is deliberately tool-free; gathering keeps the
    // provider-native search tool and drops the client's custom function tool.
    const planRequest = streamRequestMock.mock.calls[0]?.[2] as { tools?: unknown[] };
    expect(planRequest.tools).toBeUndefined();
    const gatheringRequest = streamRequestMock.mock.calls[1]?.[2] as { tools?: unknown[] };
    expect(gatheringRequest.tools).toEqual([{ google_search: {} }]);
  });
});

// ─── CAP-045 slice 2: plan surface ────────────────────────────────────────────

describe('researchPlanEvent', () => {
  it('emits the additive x_research_plan delta with snake_case wire fields', () => {
    const line = researchPlanEvent(
      [
        {
          id: 'plan-1',
          type: 'search',
          description: 'query one',
          status: 'completed',
          startedAt: '2026-08-05T10:00:00.000Z',
          completedAt: '2026-08-05T10:00:02.000Z',
          durationMs: 2000,
          sourcesConsulted: 4,
        },
        { id: 'plan-2', type: 'search', description: 'query two', status: 'pending' },
      ],
      'test-model',
    );
    const parsed = JSON.parse(line.replace(/^data: /, '')) as Record<string, unknown>;
    const plan = delta(parsed)['x_research_plan'] as Record<string, unknown>;
    expect(plan['steps']).toEqual([
      {
        id: 'plan-1',
        type: 'search',
        description: 'query one',
        status: 'completed',
        started_at: '2026-08-05T10:00:00.000Z',
        completed_at: '2026-08-05T10:00:02.000Z',
        duration_ms: 2000,
        sources_consulted: 4,
      },
      { id: 'plan-2', type: 'search', description: 'query two', status: 'pending' },
    ]);
    expect(parsed['model']).toBe('test-model');
  });
});

describe('parsePlanQueries', () => {
  it('parses a JSON array, trims, dedupes case-insensitively, and caps at 6', () => {
    expect(parsePlanQueries('["  a  ", "b", "A", "c", "d", "e", "f", "g"]')).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
    ]);
  });

  it('falls back to a markdown or numbered list when the model ignores JSON', () => {
    expect(parsePlanQueries('Here is my plan:\n- first query\n2. second query\n')).toEqual([
      'first query',
      'second query',
    ]);
  });

  it('returns an empty plan rather than inventing queries', () => {
    expect(parsePlanQueries('I will research this thoroughly.')).toEqual([]);
    expect(parsePlanQueries('[not json')).toEqual([]);
    expect(parsePlanQueries('[1, 2, 3]')).toEqual([]);
  });
});

describe('research plan emission', () => {
  it('emits the plan before any gathering and drives each step to completed', async () => {
    streamRequestMock
      .mockResolvedValueOnce(planStream(['alpha query', 'beta query']))
      .mockResolvedValueOnce(
        sseStream([
          searchResultsEvent([{ url: 'https://a.com', title: 'A' }]),
          contentEvent(`notes\n${READY_MARKER}`),
          finishEvent(),
        ]),
      )
      .mockResolvedValueOnce(sseStream([contentEvent('# Report\n\nBody [1]'), finishEvent()]));

    const run = await collectRun(runResearchLoop(makeProcessed(), BILLING));

    const plans = researchPlans(run);
    expect(plans.length).toBeGreaterThan(0);

    // The FIRST plan event precedes the first web_search running status.
    const firstPlanIndex = run.events.findIndex((e) => !!delta(e)['x_research_plan']);
    const firstSearchIndex = run.events.findIndex(
      (e) =>
        (delta(e)['x_tool_status'] as Record<string, unknown> | undefined)?.['name'] ===
        'web_search',
    );
    expect(firstPlanIndex).toBeGreaterThanOrEqual(0);
    expect(firstPlanIndex).toBeLessThan(firstSearchIndex);

    // Planned queries appear as search steps, in order.
    const first = planSteps(plans[0]);
    expect(first.map((s) => s['description'])).toEqual(['alpha query', 'beta query']);
    expect(first.every((s) => s['type'] === 'search')).toBe(true);
    expect(first.every((s) => s['status'] === 'running')).toBe(true);

    // The final plan has every search step completed plus a synthesize step.
    const last = planSteps(plans[plans.length - 1]);
    expect(last.map((s) => s['status'])).toEqual(['completed', 'completed', 'completed']);
    expect(last[last.length - 1]).toMatchObject({ type: 'synthesize', status: 'completed' });
  });

  it('sends the planned queries into the round-1 gathering directive', async () => {
    streamRequestMock
      .mockResolvedValueOnce(planStream(['alpha query', 'beta query']))
      .mockResolvedValueOnce(sseStream([contentEvent(READY_MARKER), finishEvent()]))
      .mockResolvedValueOnce(sseStream([contentEvent('report'), finishEvent()]));

    await collectRun(runResearchLoop(makeProcessed(), BILLING));

    const gathering = streamRequestMock.mock.calls[1]?.[2] as {
      messages: Array<{ role: string; content: string }>;
    };
    const directive = gathering.messages[gathering.messages.length - 1]?.content ?? '';
    expect(directive).toContain('- alpha query');
    expect(directive).toContain('- beta query');
  });

  it('falls back to an honest round step when the plan cannot be parsed', async () => {
    streamRequestMock
      .mockResolvedValueOnce(sseStream([contentEvent('I will look into it.'), finishEvent()]))
      .mockResolvedValueOnce(sseStream([contentEvent(READY_MARKER), finishEvent()]))
      .mockResolvedValueOnce(sseStream([contentEvent('report'), finishEvent()]));

    const run = await collectRun(runResearchLoop(makeProcessed(), BILLING));

    const first = planSteps(researchPlans(run)[0]);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ id: 'round-1', description: 'Initial web searches' });
  });

  it('marks the plan failed when the first gathering round dies', async () => {
    streamRequestMock
      .mockResolvedValueOnce(planStream(['alpha query']))
      .mockRejectedValueOnce(new Error('provider exploded'));

    const run = await collectRun(runResearchLoop(makeProcessed(), BILLING));

    const last = planSteps(researchPlans(run).at(-1));
    expect(last).toHaveLength(1);
    expect(last[0]).toMatchObject({ status: 'failed' });
  });

  it('stays additive: the pre-existing event shapes are untouched', async () => {
    streamRequestMock
      .mockResolvedValueOnce(planStream())
      .mockResolvedValueOnce(
        sseStream([
          searchResultsEvent([{ url: 'https://a.com', title: 'A' }]),
          contentEvent(READY_MARKER),
          finishEvent(),
        ]),
      )
      .mockResolvedValueOnce(sseStream([contentEvent('report'), finishEvent()]));

    const run = await collectRun(runResearchLoop(makeProcessed(), BILLING));

    // A client that ignores x_research_plan still sees the full legacy run.
    const legacy = run.events.filter((e) => !delta(e)['x_research_plan']);
    const phases = legacy
      .map((e) => (delta(e)['x_research_status'] as Record<string, unknown> | undefined)?.['phase'])
      .filter(Boolean);
    expect(phases[0]).toBe('planning');
    expect(phases[phases.length - 1]).toBe('complete');
    expect(legacy.map((e) => delta(e)['content']).filter((c) => typeof c === 'string')).toEqual([
      'report',
    ]);
    // Every plan event carries ONLY the new key -- it never rides on an
    // existing delta whose shape old clients depend on.
    for (const event of run.events) {
      if (!delta(event)['x_research_plan']) continue;
      expect(Object.keys(delta(event))).toEqual(['x_research_plan']);
    }
  });
});

// ─── CAP-045 slice 1: report persistence ──────────────────────────────────────

describe('extractReportOutline', () => {
  it('pulls the title, summary, and key findings out of a real report', () => {
    const outline = extractReportOutline(
      '# Node.js release status\n\nNode 24 is the active LTS line [1].\n\n## Key findings\n\n- v24.18.0 is LTS\n- v26.5.0 is Current\n',
    );
    expect(outline.title).toBe('Node.js release status');
    expect(outline.summary).toBe('Node 24 is the active LTS line [1].');
    expect(outline.keyFindings).toEqual(['v24.18.0 is LTS', 'v26.5.0 is Current']);
  });

  it('degrades to empty fields instead of inventing them', () => {
    expect(extractReportOutline('')).toEqual({ title: '', summary: '', keyFindings: [] });
  });
});

describe('extractUserQuery', () => {
  it('takes the last user turn, including multimodal text parts', () => {
    expect(
      extractUserQuery([
        { role: 'user', content: 'old question' },
        { role: 'assistant', content: 'answer' },
        { role: 'user', content: [{ type: 'text', text: 'new question' }, { type: 'image' }] },
      ] as ProcessedRequest['llmRequest']['messages']),
    ).toBe('new question');
  });

  it('returns an empty string when no user turn carries text', () => {
    expect(
      extractUserQuery([
        { role: 'system', content: 'be helpful' },
      ] as ProcessedRequest['llmRequest']['messages']),
    ).toBe('');
  });
});

describe('durable report persistence', () => {
  function reportDatabase(): DatabaseAdapter & { query: ReturnType<typeof vi.fn> } {
    const db = {
      query: vi.fn(async (_sql: string, params: unknown[]) => [
        {
          id: 'row-1',
          user_id: params[0],
          request_id: params[1],
          conversation_id: params[2],
          query: params[3],
          title: params[4],
          summary: params[5],
          content: params[6],
          citations: JSON.parse(params[7] as string),
          steps: JSON.parse(params[8] as string),
          key_findings: JSON.parse(params[9] as string),
          status: params[10],
          sources_consulted: params[11],
          duration_ms: params[12],
          error: params[13],
          model: params[14],
          provider: params[15],
          created_at: '2026-08-05T10:00:00.000Z',
          updated_at: '2026-08-05T10:00:00.000Z',
          completed_at: params[10] === 'completed' ? '2026-08-05T10:00:00.000Z' : null,
        },
      ]),
      execute: vi.fn(),
      transaction: vi.fn(),
      withUser: vi.fn(),
      dispose: vi.fn(),
    };
    return db as unknown as DatabaseAdapter & { query: ReturnType<typeof vi.fn> };
  }

  it('writes a completed row through the real service when a run finishes', async () => {
    streamRequestMock
      .mockResolvedValueOnce(planStream(['alpha query']))
      .mockResolvedValueOnce(
        sseStream([
          searchResultsEvent([{ url: 'https://a.com', title: 'A' }]),
          contentEvent(`notes\n${READY_MARKER}`),
          finishEvent(),
        ]),
      )
      .mockResolvedValueOnce(
        sseStream([
          contentEvent('# Findings\n\nPrices rose [1].\n\n## Key findings\n\n- Prices rose\n'),
          finishEvent(),
        ]),
      );

    const db = reportDatabase();
    await collectRun(
      runResearchLoop(makeProcessed(), BILLING, {
        persistReport: (report) =>
          saveResearchReport(db, {
            userId: BILLING.userId,
            requestId: 'req-1',
            conversationId: null,
            model: GOOGLE_CHAT_MODEL,
            provider: 'google',
            ...report,
          }),
      }),
    );

    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('insert into public.research_reports');
    expect(params[0]).toBe('user-1');
    expect(params[1]).toBe('req-1');
    expect(params[3]).toBe('research the topic'); // the user's question
    expect(params[4]).toBe('Findings'); // derived title
    expect(params[10]).toBe('completed');
    expect(params[11]).toBe(1); // one deduped source
    expect(JSON.parse(params[7] as string)).toEqual([
      expect.objectContaining({ id: '1', url: 'https://a.com', title: 'A' }),
    ]);
    // Plan steps ride along so a later retry knows what already ran.
    expect(JSON.parse(params[8] as string)).toEqual([
      expect.objectContaining({ id: 'plan-1', status: 'completed' }),
      expect.objectContaining({ type: 'synthesize', status: 'completed' }),
    ]);
    expect(JSON.parse(params[9] as string)).toEqual(['Prices rose']);
  });

  it('persists a failed run with its gathered sources so a retry can resume', async () => {
    streamRequestMock
      .mockResolvedValueOnce(planStream(['alpha query']))
      .mockResolvedValueOnce(
        sseStream([
          searchResultsEvent([{ url: 'https://kept.com', title: 'Kept' }]),
          contentEvent(`notes\n${READY_MARKER}`),
          finishEvent(),
        ]),
      )
      .mockRejectedValueOnce(new Error('synthesis died'));

    const reports: ResearchRunReport[] = [];
    await collectRun(
      runResearchLoop(makeProcessed(), BILLING, {
        persistReport: async (report) => {
          reports.push(report);
        },
      }),
    );

    expect(reports).toHaveLength(1);
    expect(reports[0]?.status).toBe('failed');
    expect(reports[0]?.error).not.toContain('synthesis died');
    expect(reports[0]?.error).toContain('Try again');
    expect(reports[0]?.citations).toEqual([
      expect.objectContaining({ url: 'https://kept.com', id: '1' }),
    ]);
  });

  it('persists an interrupted run when the request is cancelled', async () => {
    const reports: ResearchRunReport[] = [];
    await collectRun(
      runResearchLoop(makeProcessed(), BILLING, {
        isCancellationRequested: async () => true,
        persistReport: async (report) => {
          reports.push(report);
        },
      }),
    );

    expect(reports).toHaveLength(1);
    expect(reports[0]?.status).toBe('interrupted');
  });

  it('never lets a persistence failure break the stream', async () => {
    streamRequestMock
      .mockResolvedValueOnce(planStream())
      .mockResolvedValueOnce(sseStream([contentEvent(READY_MARKER), finishEvent()]))
      .mockResolvedValueOnce(sseStream([contentEvent('report body'), finishEvent()]));

    const run = await collectRun(
      runResearchLoop(makeProcessed(), BILLING, {
        persistReport: async () => {
          throw new Error('neon is down');
        },
      }),
    );

    expect(forwardedContent(run)).toBe('report body');
    const phases = researchStatuses(run).map((s) => s['phase']);
    expect(phases[phases.length - 1]).toBe('complete');
    expect(run.doneCount).toBe(1);
  });

  it('writes the report exactly once per run', async () => {
    streamRequestMock
      .mockResolvedValueOnce(planStream())
      .mockResolvedValueOnce(sseStream([contentEvent(READY_MARKER), finishEvent()]))
      .mockResolvedValueOnce(sseStream([contentEvent('report body'), finishEvent()]));

    const persistReport = vi.fn(async () => undefined);
    await collectRun(runResearchLoop(makeProcessed(), BILLING, { persistReport }));

    expect(persistReport).toHaveBeenCalledTimes(1);
  });
});

// ─── CAP-045 slice 4: retry with carried-forward material ─────────────────────

describe('retry with carried sources', () => {
  it('pre-seeds prior sources with stable leading positions and skips finished queries', async () => {
    streamRequestMock
      .mockResolvedValueOnce(planStream(['fresh query']))
      .mockResolvedValueOnce(
        sseStream([
          searchResultsEvent([{ url: 'https://new.com', title: 'New' }]),
          contentEvent(READY_MARKER),
          finishEvent(),
        ]),
      )
      .mockResolvedValueOnce(sseStream([contentEvent('report'), finishEvent()]));

    const run = await collectRun(
      runResearchLoop(makeProcessed(), BILLING, {
        priorSources: [{ url: 'https://prior.com', title: 'Prior' }],
        priorSteps: [
          { id: 'plan-1', type: 'search', description: 'already ran', status: 'completed' },
          { id: 'plan-2', type: 'search', description: 'never ran', status: 'pending' },
        ],
      }),
    );

    // Prior source keeps position 1; the new one is appended.
    const sources = lastSearchResults(run);
    expect(sources?.[0]).toMatchObject({ url: 'https://prior.com', position: 1 });
    expect(sources?.[1]).toMatchObject({ url: 'https://new.com', position: 2 });

    // The planning turn is told not to repeat the completed query.
    const planRequest = streamRequestMock.mock.calls[0]?.[2] as {
      messages: Array<{ role: string; content: string }>;
    };
    const planDirective = planRequest.messages[planRequest.messages.length - 1]?.content ?? '';
    expect(planDirective).toContain('do NOT repeat them');
    expect(planDirective).toContain('- already ran');

    // The restored completed step is carried into the plan surface as-is; the
    // pending step from the previous attempt is NOT resurrected as completed.
    const firstPlan = planSteps(researchPlans(run)[0]);
    expect(firstPlan[0]).toMatchObject({ id: 'plan-1', status: 'completed' });
    expect(firstPlan.some((s) => s['description'] === 'never ran')).toBe(false);
  });

  it('drops a replanned query that duplicates a completed one', async () => {
    streamRequestMock
      .mockResolvedValueOnce(planStream(['Already Ran', 'fresh query']))
      .mockResolvedValueOnce(sseStream([contentEvent(READY_MARKER), finishEvent()]))
      .mockResolvedValueOnce(sseStream([contentEvent('report'), finishEvent()]));

    const run = await collectRun(
      runResearchLoop(makeProcessed(), BILLING, {
        priorSteps: [
          { id: 'plan-1', type: 'search', description: 'already ran', status: 'completed' },
        ],
      }),
    );

    const firstPlan = planSteps(researchPlans(run)[0]);
    expect(firstPlan.map((s) => s['description'])).toEqual(['already ran', 'fresh query']);
  });
});

describe('plan approval gate', () => {
  it('stops after planning and waits instead of searching', async () => {
    streamRequestMock.mockResolvedValueOnce(planStream(['alpha query', 'beta query']));

    const run = await collectRun(
      runResearchLoop(makeProcessed(), BILLING, { requirePlanApproval: true }),
    );

    expect(streamRequestMock).toHaveBeenCalledTimes(1);
    const phases = researchStatuses(run).map((s) => s['phase']);
    expect(phases).toEqual(['planning', 'awaiting_approval']);
    expect(planSteps(researchPlans(run).at(-1)).map((s) => s['description'])).toEqual([
      'alpha query',
      'beta query',
    ]);
    expect(forwardedContent(run)).toBe('');
    expect(run.doneCount).toBe(1);
  });

  it('waits even when the budget is too small to afford a planning turn', async () => {
    // maxIterations below the planning threshold skips the planning turn
    // entirely. The gate used to require a parsed plan, so this path reached
    // the network with approval still outstanding and spent the user's budget
    // on searches they never saw.
    streamRequestMock.mockResolvedValueOnce(planStream(['alpha query']));

    const run = await collectRun(
      runResearchLoop(makeProcessed(), BILLING, { requirePlanApproval: true, maxIterations: 2 }),
    );

    const phases = researchStatuses(run).map((s) => s['phase']);
    expect(phases.at(-1)).toBe('awaiting_approval');
    expect(forwardedContent(run)).toBe('');
  });

  it('waits even when the planning turn produced nothing parseable', async () => {
    // A planning turn that returns prose rather than queries yields no steps.
    // That is a reason to ask the user, not a reason to start searching.
    streamRequestMock.mockResolvedValueOnce(planStream([]));

    const run = await collectRun(
      runResearchLoop(makeProcessed(), BILLING, { requirePlanApproval: true }),
    );

    const phases = researchStatuses(run).map((s) => s['phase']);
    expect(phases.at(-1)).toBe('awaiting_approval');
    expect(forwardedContent(run)).toBe('');
  });

  it('offers something concrete to accept when no plan could be drafted', async () => {
    streamRequestMock.mockResolvedValueOnce(planStream([]));

    const run = await collectRun(
      runResearchLoop(makeProcessed(), BILLING, { requirePlanApproval: true }),
    );

    expect(planSteps(researchPlans(run).at(-1)).length).toBeGreaterThan(0);
  });

  it('never persists a report for a run nobody approved', async () => {
    streamRequestMock.mockResolvedValueOnce(planStream(['alpha query']));
    const persistReport = vi.fn(async () => undefined);

    await collectRun(
      runResearchLoop(makeProcessed(), BILLING, { requirePlanApproval: true, persistReport }),
    );

    expect(persistReport).not.toHaveBeenCalled();
  });

  it('searches the approved plan without re-planning when the user starts it', async () => {
    streamRequestMock
      .mockResolvedValueOnce(
        sseStream([
          searchResultsEvent([{ url: 'https://a.com', title: 'A' }]),
          contentEvent(`notes\n${READY_MARKER}`),
          finishEvent(),
        ]),
      )
      .mockResolvedValueOnce(sseStream([contentEvent('# Report\n\nBody [1]'), finishEvent()]));

    const run = await collectRun(
      runResearchLoop(makeProcessed(), BILLING, {
        requirePlanApproval: true,
        approvedPlan: [
          { id: 'plan-1', type: 'search', description: 'alpha query', status: 'pending' },
          { id: 'plan-2', type: 'search', description: 'beta query', status: 'pending' },
        ],
      }),
    );

    expect(streamRequestMock).toHaveBeenCalledTimes(2);
    const gathering = streamRequestMock.mock.calls[0]?.[2] as {
      messages: Array<{ role: string; content: string }>;
    };
    const directive = gathering.messages[gathering.messages.length - 1]?.content ?? '';
    expect(directive).toContain('- alpha query');
    expect(directive).toContain('- beta query');
    expect(researchStatuses(run).map((s) => s['phase'])).not.toContain('awaiting_approval');
    expect(forwardedContent(run)).toContain('# Report');
  });

  it('asks rather than searching when the plan could not be parsed', async () => {
    // This previously asserted the opposite: an unparseable plan fell through
    // and the run searched to completion, on the reasoning that a plan nobody
    // could read should not strand the user. The browser audit found that this
    // is how research reached the network with approval still outstanding.
    //
    // The concern was right and is still honoured - the user is not stranded,
    // they are asked. What changed is that the loop no longer decides for them
    // that spending their budget is fine.
    streamRequestMock
      .mockResolvedValueOnce(sseStream([contentEvent('I will look into it.'), finishEvent()]))
      .mockResolvedValueOnce(sseStream([contentEvent(READY_MARKER), finishEvent()]))
      .mockResolvedValueOnce(sseStream([contentEvent('report'), finishEvent()]));

    const run = await collectRun(
      runResearchLoop(makeProcessed(), BILLING, { requirePlanApproval: true }),
    );

    expect(
      researchStatuses(run)
        .map((s) => s['phase'])
        .at(-1),
    ).toBe('awaiting_approval');
    expect(forwardedContent(run)).toBe('');
    expect(planSteps(researchPlans(run).at(-1)).length).toBeGreaterThan(0);
  });
});

describe('empty synthesis, attributing the cause honestly', () => {
  /**
   * Observed locally with an Anthropic key at $0: every upstream call was
   * rejected with "Your credit balance is too low to access the Anthropic API",
   * the run gathered nothing, synthesis came back empty, and the user was told
   * "the model returned an empty report. Try running the research again." Both
   * halves were wrong, the model never got a chance to speak, and the retry
   * could not have succeeded. Zero sources plus a captured upstream error is an
   * infrastructure failure, not a shy model.
   */
  it('names the upstream provider error instead of blaming the model when nothing was gathered', async () => {
    streamRequestMock
      .mockResolvedValueOnce(planStream())
      // Round 1: real content, but no search results at all.
      .mockResolvedValueOnce(sseStream([contentEvent('no luck this round'), finishEvent()]))
      // Round 2: the provider rejects outright.
      .mockRejectedValueOnce(
        new Error('400 Your credit balance is too low to access the Anthropic API.'),
      )
      // Synthesis: nothing to say, so it says nothing.
      .mockResolvedValueOnce(sseStream([contentEvent(''), finishEvent()]));

    const run = await collectRun(
      runResearchLoop(makeProcessed(), BILLING, { maxIterations: 6, maxSearches: 15 }),
    );

    const content = forwardedContent(run);
    expect(content).not.toContain('credit balance is too low');
    expect(content).not.toContain('Anthropic API');
    expect(content).toContain('every provider call failed');
    expect(content).toContain('Retrying will not help');
    // The two misattributions this test exists to prevent.
    expect(content).not.toContain('the model returned an empty report');
    expect(content).not.toContain('Try running the research again');

    const statuses = researchStatuses(run);
    const last = statuses[statuses.length - 1];
    expect(last?.['phase']).toBe('error');
    expect(last?.['label']).toBe('Report generation failed upstream');
  });

  it('still blames the model when sources WERE gathered and no upstream error was captured', async () => {
    streamRequestMock
      .mockResolvedValueOnce(planStream())
      .mockResolvedValueOnce(
        sseStream([
          contentEvent(`gathered fine\n${READY_MARKER}`),
          searchResultsEvent([{ url: 'https://a.com', title: 'A' }]),
          finishEvent(),
        ]),
      )
      .mockResolvedValueOnce(sseStream([contentEvent(''), finishEvent()]));

    const run = await collectRun(runResearchLoop(makeProcessed(), BILLING));

    const content = forwardedContent(run);
    expect(content).toContain('the model returned an empty report');
    expect(content).toContain('Try running the research again');
    expect(content).not.toContain('every provider call failed');
  });
});
