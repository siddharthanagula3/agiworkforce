/**
 * Unit tests for the Deep Research loop: iteration caps, search caps,
 * wall-clock budget, event emission (x_research_status / x_tool_status /
 * cumulative x_search_results), content suppression on gathering rounds,
 * mid-loop errors, cancellation, and usage accounting.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('./tool-loop-anthropic', () => ({
  buildToolLoopStream: vi.fn(),
}));
vi.mock('@/lib/services/llm-cost-calculator', () => ({
  LLMCostCalculator: { calculateCost: vi.fn(() => 7) },
}));
import { buildToolLoopStream } from './tool-loop-anthropic';
import { createObservedProviderUsage } from '@/lib/services/managed-usage-accounting-service';
import {
  runResearchLoop,
  researchStatusEvent,
  SourceAggregator,
  READY_MARKER,
} from './research-loop';
import type { ProcessedRequest } from './request-processor';

// buildToolLoopStream(provider, processed, stepRequest, responseModel) -- the
// per-step llmRequest is argument index 2.
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

function makeProcessed(): ProcessedRequest {
  return {
    requestId: 'req-1',
    requestedModel: 'gemini-3.6-flash',
    provider: 'google',
    estimatedCostCents: 2,
    quotaFeature: 'chat',
    isFlagshipRequest: false,
    chatRequest: { model: 'gemini-3.6-flash' },
    llmRequest: {
      model: 'gemini-3.6-flash',
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

  it('runs gather -> synthesis, suppresses notes, forwards the report, and emits cumulative deduped sources', async () => {
    streamRequestMock
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

    // Exactly 2 provider calls: one gathering round (READY marker) + synthesis.
    expect(streamRequestMock).toHaveBeenCalledTimes(2);

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
    const synthesisRequest = streamRequestMock.mock.calls[1]?.[2] as {
      messages: Array<{ role: string; content: string }>;
    };
    const synthDirective = synthesisRequest.messages[synthesisRequest.messages.length - 1];
    expect(synthDirective?.role).toBe('user');
    expect(synthDirective?.content).toContain('[1] A — https://a.com');
    expect(synthDirective?.content).toContain('[2] B — https://b.com');
    // Notes were appended (markers stripped) for the synthesis turn to build on.
    const appendedNotes = synthesisRequest.messages.find(
      (m) => m.role === 'assistant' && m.content.includes('secret gathering notes'),
    );
    expect(appendedNotes).toBeDefined();
    expect(appendedNotes?.content).not.toContain(READY_MARKER);
  });

  it('emits web_search tool running/completed status events per gathering round', async () => {
    streamRequestMock
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
    // Model never signals READY: with maxIterations=3, expect 2 gathering
    // rounds + 1 synthesis = 3 provider calls total.
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
    // Round 1: searches=2 (<3, continue). Round 2: searches=4 (>=3, stop). +synthesis.
    expect(streamRequestMock).toHaveBeenCalledTimes(3);
    const synthesisRequest = streamRequestMock.mock.calls[2]?.[2] as {
      messages: Array<{ role: string; content: string }>;
    };
    const directive = synthesisRequest.messages[synthesisRequest.messages.length - 1];
    expect(directive?.content).toContain('search budget was reached');
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
    streamRequestMock.mockRejectedValueOnce(new Error('provider exploded'));

    const run = await collectRun(runResearchLoop(makeProcessed(), BILLING));
    expect(streamRequestMock).toHaveBeenCalledTimes(1);
    const phases = researchStatuses(run).map((s) => s['phase']);
    expect(phases[phases.length - 1]).toBe('error');
    expect(forwardedContent(run)).toContain('provider exploded');
    expect(run.doneCount).toBe(1);
  });

  it('keeps partial material and synthesizes when a LATER gathering round fails', async () => {
    streamRequestMock
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
    expect(streamRequestMock).toHaveBeenCalledTimes(3);
    expect(forwardedContent(run)).toBe('partial report [1]');
    expect(lastSearchResults(run)?.[0]).toMatchObject({ url: 'https://kept.com', position: 1 });
    const synthesisRequest = streamRequestMock.mock.calls[2]?.[2] as {
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
    expect(forwardedContent(run)).toContain('synthesis died');
    expect(lastSearchResults(run)).toHaveLength(1);
    expect(run.doneCount).toBe(1);
  });

  it('exposes accumulated multi-turn usage for the route-owned settlement', async () => {
    streamRequestMock
      .mockResolvedValueOnce(
        sseStream([contentEvent(READY_MARKER), usageEvent(100, 50), finishEvent()]),
      )
      .mockResolvedValueOnce(
        sseStream([contentEvent('report'), usageEvent(200, 80), finishEvent()]),
      );

    const usage = createObservedProviderUsage();
    await collectRun(runResearchLoop(makeProcessed(), BILLING, { usage }));

    expect(usage).toMatchObject({
      providerCalls: 2,
      inputTokens: 300,
      outputTokens: 130,
    });
  });

  it('preserves observed usage when cancelled mid-stream (generator.return)', async () => {
    streamRequestMock.mockResolvedValueOnce(
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
      .mockResolvedValueOnce(sseStream([contentEvent(READY_MARKER), finishEvent()]))
      .mockResolvedValueOnce(sseStream([contentEvent('report'), finishEvent()]));

    await collectRun(runResearchLoop(processed, BILLING));
    const firstRequest = streamRequestMock.mock.calls[0]?.[2] as { tools?: unknown[] };
    expect(firstRequest.tools).toEqual([{ google_search: {} }]);
  });
});
