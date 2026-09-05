/**
 * NON-mocked-pipeline integration test for the Deep Research loop against the
 * REAL Anthropic translation pipeline.
 *
 * route.ts used to exclude Anthropic from `runResearchLoop` entirely
 * (`processed.provider.toLowerCase() !== 'anthropic'`), on the belief that the
 * loop consumed raw provider SSE. It does not: it dispatches only through
 * `buildToolLoopStream`, so the exclusion silently downgraded the DEFAULT
 * provider to the single-turn research fallback, the Deep Research badge lit
 * up, real citations came back, but there was no plan card, no process
 * narration, and no persisted report. This test is the evidence the exclusion
 * was unnecessary; it feeds the loop through:
 *
 *   Anthropic SDK MessageStreamEvents -> real translateAnthropicStream
 *     -> real chunksToOpenAiSse (legacy-web wireMode, real OpenAIWireAssembler)
 *     -> runResearchLoop's collector.
 *
 * Only the network call itself is replaced; every translation layer between
 * provider events and the research loop is real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
// Only the network side of url_fetch is replaced; isUrlFetchTool/urlFetchToolDef
// stay real so the loop's own tool routing is exercised.
const urlFetchMock = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('@/lib/url-fetch/url-fetch-tool', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/url-fetch/url-fetch-tool')>();
  return { ...actual, executeUrlFetch: urlFetchMock.execute };
});
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
// Keep chunksToOpenAiSse REAL; replace only buildToolLoopStream (the network
// dispatch) with the recorded-events pipeline.
vi.mock('./tool-loop-anthropic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./tool-loop-anthropic')>();
  return {
    ...actual,
    buildToolLoopStream: vi.fn(),
  };
});

import type Anthropic from '@anthropic-ai/sdk';
import { translateAnthropicStream } from '@agiworkforce/providers-anthropic';
import { requireProviderDefaultModel } from '@agiworkforce/types';
import {
  buildToolLoopStream,
  chunksToOpenAiSse,
  type ToolLoopStepSink,
} from './tool-loop-anthropic';
import { runResearchLoop, type ResearchRunReport } from './research-loop';
import { urlFetchToolDef } from '@/lib/url-fetch/url-fetch-tool';
import type { ProcessedRequest } from './request-processor';

const ANTHROPIC_CHAT_MODEL = requireProviderDefaultModel('anthropic');
const streamMock = vi.mocked(buildToolLoopStream);

// ─── Anthropic event fixtures ─────────────────────────────────────────────────

async function* asEvents(seq: unknown[]): AsyncIterable<Anthropic.MessageStreamEvent> {
  for (const event of seq) yield event as Anthropic.MessageStreamEvent;
}

/** A signed extended-thinking block, exactly as Anthropic streams one. */
function thinkingBlock(index: number, text: string, signature: string): unknown[] {
  return [
    { type: 'content_block_start', index, content_block: { type: 'thinking' } },
    { type: 'content_block_delta', index, delta: { type: 'thinking_delta', thinking: text } },
    { type: 'content_block_delta', index, delta: { type: 'signature_delta', signature } },
    { type: 'content_block_stop', index },
  ];
}

function textBlock(index: number, text: string): unknown[] {
  return [
    { type: 'content_block_start', index, content_block: { type: 'text' } },
    { type: 'content_block_delta', index, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index },
  ];
}

function messageStart(): unknown {
  return { type: 'message_start', message: { usage: { input_tokens: 420 } } };
}

function messageEnd(stopReason: 'end_turn' | 'tool_use'): unknown[] {
  return [
    {
      type: 'message_delta',
      delta: { stop_reason: stopReason },
      usage: { output_tokens: 180 },
    },
    { type: 'message_stop' },
  ];
}

/** Anthropic's server-side web_search: a `server_tool_use` block followed by a
 *  complete `web_search_tool_result` block carrying the real result list. */
function webSearchBlocks(
  startIndex: number,
  query: string,
  results: Array<{ url: string; title: string }>,
): unknown[] {
  return [
    {
      type: 'content_block_start',
      index: startIndex,
      content_block: { type: 'server_tool_use', id: `srvtool_${startIndex}`, name: 'web_search' },
    },
    {
      type: 'content_block_delta',
      index: startIndex,
      delta: { type: 'input_json_delta', partial_json: JSON.stringify({ query }) },
    },
    { type: 'content_block_stop', index: startIndex },
    {
      type: 'content_block_start',
      index: startIndex + 1,
      content_block: {
        type: 'web_search_tool_result',
        tool_use_id: `srvtool_${startIndex}`,
        content: results.map((result) => ({
          type: 'web_search_result',
          url: result.url,
          title: result.title,
          encrypted_content: `snippet for ${result.title}`,
          page_age: null,
        })),
      },
    },
    { type: 'content_block_stop', index: startIndex + 1 },
  ];
}

const PLAN_QUERIES = [
  'node.js 24 lts release date',
  'node.js 26 current release notes',
  'node.js release schedule 2026',
];

const PLAN_TURN: unknown[] = [
  messageStart(),
  ...thinkingBlock(0, 'The user wants a release-status report; three angles cover it.', 'sig-plan'),
  ...textBlock(1, JSON.stringify(PLAN_QUERIES)),
  ...messageEnd('end_turn'),
];

const GATHER_TURN: unknown[] = [
  messageStart(),
  ...thinkingBlock(0, 'Search first, then take notes.', 'sig-gather'),
  ...webSearchBlocks(1, PLAN_QUERIES[0]!, [
    { url: 'https://nodejs.org/en/about/previous-releases', title: 'Previous releases' },
    { url: 'https://nodejs.org/en/blog/release', title: 'Node.js release blog' },
  ]),
  ...textBlock(3, 'v24.18.0 is the active LTS line.\nREADY_TO_REPORT'),
  ...messageEnd('end_turn'),
];

const REPORT_TEXT =
  '# Node.js release status\n\nv24.18.0 is the active LTS line [1]. v26.5.0 is Current [2].';

const SYNTHESIS_TURN: unknown[] = [
  messageStart(),
  ...thinkingBlock(0, 'Structure the report around LTS vs Current.', 'sig-synth'),
  ...textBlock(1, REPORT_TEXT),
  ...messageEnd('end_turn'),
];

function anthropicWireStream(
  seq: unknown[],
  responseModel: string,
  sink?: ToolLoopStepSink,
): ReadableStream {
  // The sink is forwarded exactly as the real buildToolLoopStream forwards it,
  // so the loop sees the same signed-thinking/tag-free-text side-channel.
  return chunksToOpenAiSse(
    translateAnthropicStream(asEvents(seq)),
    responseModel,
    'legacy-web',
    sink,
  );
}

// ─── Loop harness ─────────────────────────────────────────────────────────────

function makeProcessed(): ProcessedRequest {
  return {
    requestId: 'req-anthropic-wire',
    requestedModel: ANTHROPIC_CHAT_MODEL,
    provider: 'anthropic',
    estimatedCostCents: 2,
    quotaFeature: 'chat',
    isFlagshipRequest: false,
    chatRequest: { model: ANTHROPIC_CHAT_MODEL },
    llmRequest: {
      model: ANTHROPIC_CHAT_MODEL,
      messages: [{ role: 'user', content: 'what is the current Node.js release status?' }],
      max_tokens: 2048,
      // Exactly what request-processor injects for an Anthropic research run.
      tools: [
        {
          type: 'web_search_20260209',
          name: 'web_search',
          allowed_callers: ['direct'],
          max_uses: 20,
        },
      ],
    },
  } as unknown as ProcessedRequest;
}

async function collectRun(gen: AsyncGenerator<Uint8Array>) {
  const decoder = new TextDecoder();
  let raw = '';
  for await (const chunk of gen) raw += decoder.decode(chunk);
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

beforeEach(() => {
  vi.clearAllMocks();
  const turns = [PLAN_TURN, GATHER_TURN, SYNTHESIS_TURN];
  let call = 0;
  streamMock.mockImplementation(async (_provider, _processed, _stepRequest, responseModel, sink) =>
    anthropicWireStream(turns[Math.min(call++, turns.length - 1)]!, responseModel, sink),
  );
});

describe('research loop over the REAL Anthropic wire', () => {
  it('gives Anthropic the same plan card, narration, sources, and report as every other provider', async () => {
    const persisted: ResearchRunReport[] = [];
    const run = await collectRun(
      runResearchLoop(
        makeProcessed(),
        { userId: 'user-1', token: 'tok' },
        {
          // plan turn + 1 gathering round + synthesis
          maxIterations: 3,
          maxSearches: 12,
          persistReport: async (report) => {
            persisted.push(report);
          },
        },
      ),
    );

    // Every provider takes the same dispatch, so this must have gone through
    // buildToolLoopStream with the anthropic provider id.
    expect(streamMock).toHaveBeenCalledTimes(3);
    expect(streamMock.mock.calls[0]?.[0]).toBe('anthropic');

    // 1. THE PLAN CARD, the surface the excluded Anthropic cohort never got.
    const planSteps = run.events
      .map((e) => (delta(e)['x_research_plan'] as { steps?: unknown[] } | undefined)?.steps)
      .filter((steps): steps is unknown[] => Array.isArray(steps));
    expect(planSteps.length).toBeGreaterThan(0);
    const firstPlan = planSteps[0] as Array<Record<string, unknown>>;
    expect(firstPlan.map((step) => step['description'])).toEqual(PLAN_QUERIES);
    // The plan really advances rather than sitting pending forever.
    const lastPlan = planSteps[planSteps.length - 1] as Array<Record<string, unknown>>;
    expect(lastPlan.some((step) => step['status'] === 'completed')).toBe(true);
    expect(lastPlan.some((step) => step['type'] === 'synthesize')).toBe(true);

    // 2. PROCESS NARRATION, the research phases the badge implies.
    const phases = run.events
      .map((e) => (delta(e)['x_research_status'] as Record<string, unknown> | undefined)?.['phase'])
      .filter(Boolean);
    expect(phases).toContain('planning');
    expect(phases).toContain('searching');
    expect(phases).toContain('synthesizing');
    expect(phases[phases.length - 1]).toBe('complete');

    // 3. REAL Anthropic web_search results flow into the cumulative list with
    //    stable positions (translated from `web_search_tool_result` blocks).
    const searchEvents = run.events
      .map((e) => delta(e)['x_search_results'] as { content?: unknown[] } | undefined)
      .filter((s): s is { content: unknown[] } => Array.isArray(s?.content));
    const lastSources = searchEvents[searchEvents.length - 1]!.content as Array<
      Record<string, unknown>
    >;
    expect(lastSources).toHaveLength(2);
    expect(lastSources[0]?.['url']).toBe('https://nodejs.org/en/about/previous-releases');
    expect(lastSources[0]?.['position']).toBe(1);
    expect(lastSources[1]?.['position']).toBe(2);

    // 4. The report body streams as ordinary content deltas.
    const content = run.events
      .map((e) => delta(e)['content'])
      .filter((c): c is string => typeof c === 'string')
      .join('');
    expect(content).toContain(REPORT_TEXT);
    // The client-facing wire keeps Anthropic's inline reasoning tags (the web
    // client splits them into the "Thought for Ns" chip), so the stripping
    // asserted below is real work, not a no-op on a tag-free stream.
    expect(content).toContain('<thinking>');

    // 5. The report is PERSISTED, with citations numbered to match the inline
    //    `[n]` markers, and with the wire's inline `<thinking>` markers
    //    stripped out of the stored body.
    expect(persisted).toHaveLength(1);
    const report = persisted[0]!;
    expect(report.status).toBe('completed');
    expect(report.content).toBe(REPORT_TEXT);
    expect(report.content).not.toContain('<thinking>');
    expect(report.title).toBe('Node.js release status');
    expect(report.citations.map((citation) => citation.id)).toEqual(['1', '2']);
    expect(report.sourcesConsulted).toBe(2);

    expect(run.doneCount).toBe(1);
  });

  it('forwards the wire thinking tags to the client while keeping them out of the thread', async () => {
    await collectRun(
      runResearchLoop(
        makeProcessed(),
        { userId: 'user-1', token: 'tok' },
        { maxIterations: 3, maxSearches: 12 },
      ),
    );

    // The synthesis turn is the third call; its thread must carry the
    // gathering round's TAG-FREE notes, never the `<thinking>` wire rendering.
    const synthesisRequest = streamMock.mock.calls[2]?.[2] as
      | { messages: Array<{ role: string; content: string }> }
      | undefined;
    const assistantNotes = (synthesisRequest?.messages ?? []).filter(
      (message) => message.role === 'assistant',
    );
    expect(assistantNotes.length).toBeGreaterThan(0);
    for (const message of assistantNotes) {
      expect(message.content).not.toContain('<thinking>');
      expect(message.content).not.toContain('Search first, then take notes.');
    }
    expect(assistantNotes.some((m) => m.content.includes('v24.18.0 is the active LTS line.'))).toBe(
      true,
    );
  });

  it('replays signed thinking on the assistant tool_use turn it sends back to Anthropic', async () => {
    // Anthropic rejects a `tool_use` turn replayed without its signed thinking
    // block when extended thinking is on (known-flaw
    // TOOLLOOP-ANTHROPIC-THINKING-CONTINUITY-01). runToolLoop already handled
    // this; the research loop's own fetch-resolution replay did not, which only
    // became reachable once Anthropic entered this loop.
    const fetchTurn: unknown[] = [
      messageStart(),
      ...thinkingBlock(0, 'That release page is worth reading in full.', 'sig-fetch'),
      ...textBlock(1, 'Reading the release page.'),
      {
        type: 'content_block_start',
        index: 2,
        content_block: { type: 'tool_use', id: 'call_fetch_1', name: 'url_fetch' },
      },
      {
        type: 'content_block_delta',
        index: 2,
        delta: {
          type: 'input_json_delta',
          partial_json: JSON.stringify({ url: 'https://nodejs.org/en/about/previous-releases' }),
        },
      },
      { type: 'content_block_stop', index: 2 },
      ...messageEnd('tool_use'),
    ];
    const turns = [PLAN_TURN, fetchTurn, GATHER_TURN, SYNTHESIS_TURN];
    let call = 0;
    streamMock.mockImplementation(
      async (_provider, _processed, _stepRequest, responseModel, sink) =>
        anthropicWireStream(turns[Math.min(call++, turns.length - 1)]!, responseModel, sink),
    );
    urlFetchMock.execute.mockResolvedValue({
      ok: true,
      url: 'https://nodejs.org/en/about/previous-releases',
      title: 'Previous releases',
      content: 'Node.js 24 entered Active LTS on 2025-10-28.',
    });

    const processed = makeProcessed();
    processed.llmRequest.tools = [...(processed.llmRequest.tools ?? []), urlFetchToolDef()];

    await collectRun(
      runResearchLoop(
        processed,
        { userId: 'user-1', token: 'tok' },
        { maxIterations: 3, maxSearches: 12 },
      ),
    );

    expect(urlFetchMock.execute).toHaveBeenCalledTimes(1);

    // Call 2 is the fetch-resolution turn: its thread must carry the assistant
    // tool_use turn WITH the signed thinking block and tag-free text.
    const resolutionRequest = streamMock.mock.calls[2]?.[2] as
      | {
          messages: Array<{
            role: string;
            content: string;
            tool_calls?: unknown[];
            __canonicalThinking?: Array<{ thinking: string; signature?: string }>;
          }>;
        }
      | undefined;
    const toolUseTurn = (resolutionRequest?.messages ?? []).find(
      (message) => message.role === 'assistant' && Array.isArray(message.tool_calls),
    );
    expect(toolUseTurn).toBeDefined();
    expect(toolUseTurn?.__canonicalThinking?.[0]?.signature).toBe('sig-fetch');
    expect(toolUseTurn?.__canonicalThinking?.[0]?.thinking).toBe(
      'That release page is worth reading in full.',
    );
    expect(toolUseTurn?.content).toBe('Reading the release page.');
    expect(toolUseTurn?.content).not.toContain('<thinking>');
    // The tool result the model gets back is paired to the call it made.
    const toolResult = (resolutionRequest?.messages ?? []).find(
      (message) => message.role === 'tool',
    );
    expect(toolResult?.content).toContain('Node.js 24 entered Active LTS');
  });
});
