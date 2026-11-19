import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
type UndiciModule = typeof import('undici');

const dnsMocks = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock('undici', async (importOriginal) => {
  const actual = await importOriginal<UndiciModule>();
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
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('./tool-loop-anthropic', async (importOriginal) => ({
  ...(await importOriginal<ToolLoopAnthropicModule>()),
  buildToolLoopStream: vi.fn(),
  buildServingRouteId: vi.fn(),
}));
vi.mock('@/lib/services/credit-service', async (importOriginal) => ({
  ...(await importOriginal<CreditServiceModule>()),
  MICROUSD_PER_LEDGER_CENT: 10_000,
  microusdFromLedgerCents: (cents: number) => Math.round(cents) * 10_000,
  ledgerCentsFromMicrousd: (microusd: number) => Math.floor((microusd + 5_000) / 10_000),
  CreditService: {
    generateIdempotencyKey: vi.fn(() => 'idem-key'),
    deductCredits: vi.fn(async () => ({ success: true })),
  },
  CreditSettlementUnavailableError: class extends Error {},
}));
vi.mock('@/lib/services/llm-cost-calculator', async (importOriginal) => ({
  ...(await importOriginal<LlmCostCalculatorModule>()),
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

import { buildToolLoopStream } from './tool-loop-anthropic';
import { runResearchLoop, READY_MARKER, type ResearchLoopCheckpoint } from './research-loop';
import { RESEARCH_CHECKPOINT_MAX_TOOL_CALL_IDS } from '@/lib/workflows/cloud-agent-workflow-input';
import { toolResultEvent } from './tool-loop';
import { fenceFetchedPage, urlFetchToolDef } from '@/lib/url-fetch/url-fetch-tool';
import { requireProviderDefaultModel } from '@agiworkforce/types';
import type { ProcessedRequest } from './request-processor';

type LoggerModule = typeof import('@/lib/logger');
type ToolLoopAnthropicModule = typeof import('./tool-loop-anthropic');
type CreditServiceModule = typeof import('@/lib/services/credit-service');
type LlmCostCalculatorModule = typeof import('@/lib/services/llm-cost-calculator');

const streamRequestMock = vi.mocked(buildToolLoopStream);
const SKIP_APPROVALS = { toolApprovalPolicy: 'autonomous' } as const;
const GOOGLE_CHAT_MODEL = requireProviderDefaultModel('google');

type ProviderMessage = {
  role: string;
  content?: unknown;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string }>;
};

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

function fetchCallsTurn(calls: Array<{ id: string; url: string }>): ReadableStream {
  return sseStream([
    ...calls.map((call, index) => ({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index,
                id: call.id,
                type: 'function',
                function: { name: 'url_fetch', arguments: JSON.stringify({ url: call.url }) },
              },
            ],
          },
          index: 0,
        },
      ],
    })),
    finishEvent('tool_calls'),
  ]);
}

function planStream(): ReadableStream {
  return sseStream([contentEvent('[]'), finishEvent()]);
}

function notesTurn(notes: string, ready = true): ReadableStream {
  return sseStream([contentEvent(ready ? `${notes}\n${READY_MARKER}` : notes), finishEvent()]);
}

function makeProcessed(messages: ProviderMessage[] = []): ProcessedRequest {
  return {
    requestId: 'req-ids',
    requestedModel: GOOGLE_CHAT_MODEL,
    provider: 'google',
    estimatedCostCents: 2,
    quotaFeature: 'chat',
    isFlagshipRequest: false,
    chatRequest: { model: GOOGLE_CHAT_MODEL },
    llmRequest: {
      model: GOOGLE_CHAT_MODEL,
      messages: [...messages, { role: 'user', content: 'research these pages in depth' }],
      max_tokens: 2048,
      tools: [{ google_search: {} }, urlFetchToolDef()],
    },
  } as unknown as ProcessedRequest;
}

async function collectRaw(gen: AsyncGenerator<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let raw = '';
  for await (const chunk of gen) raw += decoder.decode(chunk);
  return raw;
}

function toolResultFrames(raw: string): string[] {
  return raw
    .split('\n\n')
    .filter((frame) => frame.includes('"x_tool_result"'))
    .map((frame) => `${frame}\n\n`);
}

function toolResultOf(frame: string): {
  tool_call_id: string;
  name: string;
  content: string;
  is_error: boolean;
} {
  const event = JSON.parse(frame.trim().slice('data: '.length)) as {
    choices: Array<{ delta: { x_tool_result: ReturnType<typeof toolResultOf> } }>;
  };
  return event.choices[0]!.delta.x_tool_result;
}

function providerMessages(callIndex: number): ProviderMessage[] {
  return (streamRequestMock.mock.calls[callIndex]?.[2] as { messages: ProviderMessage[] }).messages;
}

function idsOfToolCalls(messages: ProviderMessage[]): string[] {
  return messages.flatMap((message) => (message.tool_calls ?? []).map((call) => call.id));
}

function idsOfToolMessages(messages: ProviderMessage[]): string[] {
  return messages.flatMap((message) =>
    message.role === 'tool' && message.tool_call_id ? [message.tool_call_id] : [],
  );
}

function pageResponse(url: unknown): Response {
  return new Response(
    `<html><head><title>T</title></head><body><p>page ${String(url)}</p></body></html>`,
    { status: 200, headers: { 'content-type': 'text/html' } },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  dnsMocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown) => pageResponse(url)),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('research loop tool call ids', () => {
  it('gives a call that reuses an earlier pass id in the same round a fresh id everywhere', async () => {
    streamRequestMock
      .mockResolvedValueOnce(planStream())
      .mockResolvedValueOnce(fetchCallsTurn([{ id: 'gemini-tool-1', url: 'https://one.example/' }]))
      .mockResolvedValueOnce(fetchCallsTurn([{ id: 'gemini-tool-1', url: 'https://two.example/' }]))
      .mockResolvedValueOnce(notesTurn('Both pages read.'))
      .mockResolvedValueOnce(sseStream([contentEvent('Report.'), finishEvent()]));

    const raw = await collectRaw(
      runResearchLoop(makeProcessed(), { userId: 'user-1', token: 't' }, SKIP_APPROVALS),
    );

    const results = toolResultFrames(raw).map(toolResultOf);
    expect(results).toHaveLength(2);
    expect(results[0]!.tool_call_id).toBe('gemini-tool-1');
    expect(results[0]!.content).toContain('one.example');
    const renamed = results[1]!.tool_call_id;
    expect(renamed).not.toBe('gemini-tool-1');
    expect(renamed.length).toBeGreaterThan(0);
    expect(results[1]!.content).toContain('two.example');

    const afterSecondPass = providerMessages(3);
    expect(idsOfToolCalls(afterSecondPass)).toEqual(['gemini-tool-1', renamed]);
    expect(idsOfToolMessages(afterSecondPass)).toEqual(['gemini-tool-1', renamed]);
  });

  it('gives a call that reuses an id from an earlier round a fresh id', async () => {
    streamRequestMock
      .mockResolvedValueOnce(planStream())
      .mockResolvedValueOnce(fetchCallsTurn([{ id: 'gemini-tool-1', url: 'https://one.example/' }]))
      .mockResolvedValueOnce(notesTurn('First page read, more to cover.', false))
      .mockResolvedValueOnce(fetchCallsTurn([{ id: 'gemini-tool-1', url: 'https://two.example/' }]))
      .mockResolvedValueOnce(notesTurn('Second page read.'))
      .mockResolvedValueOnce(sseStream([contentEvent('Report.'), finishEvent()]));

    const raw = await collectRaw(
      runResearchLoop(makeProcessed(), { userId: 'user-1', token: 't' }, SKIP_APPROVALS),
    );

    const ids = toolResultFrames(raw).map((frame) => toolResultOf(frame).tool_call_id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe('gemini-tool-1');
    expect(ids[1]).not.toBe('gemini-tool-1');

    const roundTwoContinuation = providerMessages(4);
    expect(idsOfToolCalls(roundTwoContinuation)).toEqual([ids[1]]);
    expect(idsOfToolMessages(roundTwoContinuation)).toEqual([ids[1]]);
  });

  it('never reuses an id the conversation already holds or one taken earlier in the same step', async () => {
    const history: ProviderMessage[] = [
      { role: 'user', content: 'earlier question' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'gemini-tool-1',
            type: 'function',
            function: { name: 'url_fetch', arguments: '{}' },
          } as unknown as { id: string },
        ],
      },
      { role: 'tool', content: 'earlier result', tool_call_id: 'gemini-tool-1' },
      { role: 'assistant', content: 'earlier answer' },
    ];
    streamRequestMock
      .mockResolvedValueOnce(planStream())
      .mockResolvedValueOnce(
        fetchCallsTurn([
          { id: 'gemini-tool-1', url: 'https://one.example/' },
          { id: 'gemini-tool-2', url: 'https://two.example/' },
          { id: 'gemini-tool-2', url: 'https://three.example/' },
        ]),
      )
      .mockResolvedValueOnce(notesTurn('Pages read.'))
      .mockResolvedValueOnce(sseStream([contentEvent('Report.'), finishEvent()]));

    const raw = await collectRaw(
      runResearchLoop(makeProcessed(history), { userId: 'user-1', token: 't' }, SKIP_APPROVALS),
    );

    const ids = toolResultFrames(raw).map((frame) => toolResultOf(frame).tool_call_id);
    expect(ids).toHaveLength(3);
    expect(ids[0]).not.toBe('gemini-tool-1');
    expect(ids[1]).toBe('gemini-tool-2');
    expect(new Set(['gemini-tool-1', ...ids]).size).toBe(4);

    const continuation = providerMessages(2);
    expect(idsOfToolCalls(continuation)).toEqual(['gemini-tool-1', ...ids]);
    expect(idsOfToolMessages(continuation)).toEqual(['gemini-tool-1', ...ids]);
  });

  it('forwards the provider ids unchanged when every id in the turn is already unique', async () => {
    streamRequestMock
      .mockResolvedValueOnce(planStream())
      .mockResolvedValueOnce(
        fetchCallsTurn([
          { id: 'gemini-tool-1', url: 'https://one.example/' },
          { id: 'gemini-tool-2', url: 'https://two.example/' },
        ]),
      )
      .mockResolvedValueOnce(
        fetchCallsTurn([{ id: 'gemini-tool-3', url: 'https://three.example/' }]),
      )
      .mockResolvedValueOnce(notesTurn('Pages read.'))
      .mockResolvedValueOnce(sseStream([contentEvent('Report.'), finishEvent()]));

    const raw = await collectRaw(
      runResearchLoop(makeProcessed(), { userId: 'user-1', token: 't' }, SKIP_APPROVALS),
    );

    const fetched: Array<[id: string, url: string]> = [
      ['gemini-tool-1', 'https://one.example/'],
      ['gemini-tool-2', 'https://two.example/'],
      ['gemini-tool-3', 'https://three.example/'],
    ];
    expect(toolResultFrames(raw)).toEqual(
      fetched.map(([id, url]) =>
        toolResultEvent(
          id,
          'url_fetch',
          fenceFetchedPage(url, 'T', `page ${url}`),
          false,
          GOOGLE_CHAT_MODEL,
        ),
      ),
    );

    const afterSecondPass = providerMessages(3);
    expect(idsOfToolCalls(afterSecondPass)).toEqual([
      'gemini-tool-1',
      'gemini-tool-2',
      'gemini-tool-3',
    ]);
    expect(idsOfToolMessages(afterSecondPass)).toEqual([
      'gemini-tool-1',
      'gemini-tool-2',
      'gemini-tool-3',
    ]);
  });
});

describe('research loop tool call ids across a durable hand-off', () => {
  const HAND_OFF_NOW = 1_000;

  async function runFirstLeg(
    history: ProviderMessage[] = [],
    firstCallId = 'gemini-tool-1',
    firstTurnCalls: Array<{ id: string; url: string }> = [
      { id: firstCallId, url: 'https://one.example/' },
    ],
  ): Promise<ResearchLoopCheckpoint> {
    streamRequestMock
      .mockResolvedValueOnce(planStream())
      .mockResolvedValueOnce(fetchCallsTurn(firstTurnCalls))
      .mockResolvedValueOnce(notesTurn('First page read, more to cover.', false));
    const checkpoints: ResearchLoopCheckpoint[] = [];
    await collectRaw(
      runResearchLoop(
        makeProcessed(history),
        { userId: 'user-1', token: 't' },
        {
          ...SKIP_APPROVALS,
          now: () => HAND_OFF_NOW,
          invocation: {
            startedAtMs: 0,
            handOffAfterMs: 0,
            synthesisStartsWithinMs: 0,
            deadlineMs: 600_000,
            onCheckpoint: async (checkpoint) => {
              checkpoints.push(checkpoint);
            },
          },
        },
      ),
    );
    expect(checkpoints).toHaveLength(1);
    return JSON.parse(JSON.stringify(checkpoints[0])) as ResearchLoopCheckpoint;
  }

  async function runSecondLeg(resumeFrom: ResearchLoopCheckpoint): Promise<string> {
    streamRequestMock
      .mockResolvedValueOnce(fetchCallsTurn([{ id: 'gemini-tool-1', url: 'https://two.example/' }]))
      .mockResolvedValueOnce(notesTurn('Second page read.'))
      .mockResolvedValueOnce(sseStream([contentEvent('Report.'), finishEvent()]));
    return collectRaw(
      runResearchLoop(
        makeProcessed(),
        { userId: 'user-1', token: 't' },
        {
          ...SKIP_APPROVALS,
          now: () => HAND_OFF_NOW,
          resumeFrom,
          invocation: {
            startedAtMs: 0,
            handOffAfterMs: Number.MAX_SAFE_INTEGER,
            synthesisStartsWithinMs: Number.MAX_SAFE_INTEGER,
            deadlineMs: 600_000,
            onCheckpoint: async () => {
              throw new Error('the resumed run must finish without another hand-off');
            },
          },
        },
      ),
    );
  }

  it('hands off a checkpoint that carries every tool call id used so far', async () => {
    const checkpoint = await runFirstLeg();

    expect(checkpoint.toolCallIds).toEqual(['gemini-tool-1']);
    expect(idsOfToolCalls(checkpoint.messages as ProviderMessage[])).toEqual([]);
  });

  it('gives a call that reuses an id from the previous leg a fresh id everywhere', async () => {
    const checkpoint = await runFirstLeg();
    streamRequestMock.mockReset();

    const raw = await runSecondLeg(checkpoint);

    const results = toolResultFrames(raw).map(toolResultOf);
    expect(results).toHaveLength(1);
    const renamed = results[0]!.tool_call_id;
    expect(renamed).not.toBe('gemini-tool-1');
    expect(renamed.length).toBeGreaterThan(0);
    expect(results[0]!.content).toContain('two.example');

    const afterFetch = providerMessages(1);
    expect(idsOfToolCalls(afterFetch)).toEqual([renamed]);
    expect(idsOfToolMessages(afterFetch)).toEqual([renamed]);
  });

  it('leaves the ids the carried thread already holds out of the checkpoint and still renames a reuse of one', async () => {
    const history: ProviderMessage[] = [
      { role: 'user', content: 'earlier question' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'gemini-tool-1',
            type: 'function',
            function: { name: 'search_maps', arguments: '{}' },
          } as unknown as { id: string },
        ],
      },
      { role: 'tool', content: 'earlier result', tool_call_id: 'gemini-tool-1' },
      { role: 'assistant', content: 'earlier answer' },
    ];

    const checkpoint = await runFirstLeg(history, 'gemini-tool-2');

    expect(idsOfToolCalls(checkpoint.messages as ProviderMessage[])).toEqual(['gemini-tool-1']);
    expect(checkpoint.toolCallIds).toEqual(['gemini-tool-2']);

    streamRequestMock.mockReset();
    const raw = await runSecondLeg(checkpoint);

    const results = toolResultFrames(raw).map(toolResultOf);
    expect(results).toHaveLength(1);
    expect(results[0]!.tool_call_id).not.toBe('gemini-tool-1');
    expect(results[0]!.tool_call_id).not.toBe('gemini-tool-2');
  });

  it('bounds the ids it hands off when a turn emits more calls than a checkpoint holds', async () => {
    const emitted = Array.from({ length: RESEARCH_CHECKPOINT_MAX_TOOL_CALL_IDS + 40 }, (_, i) => ({
      id: `gemini-tool-${i + 1}`,
      url: `https://page-${i + 1}.example/`,
    }));

    const checkpoint = await runFirstLeg([], 'gemini-tool-1', emitted);

    expect(checkpoint.toolCallIds).toEqual(
      emitted.slice(0, RESEARCH_CHECKPOINT_MAX_TOOL_CALL_IDS).map((call) => call.id),
    );
  });

  it('resumes a checkpoint saved before it carried ids without failing', async () => {
    const checkpoint = await runFirstLeg();
    streamRequestMock.mockReset();
    const { toolCallIds: _toolCallIds, ...saved } = checkpoint;

    const raw = await runSecondLeg(saved);

    expect(toolResultFrames(raw)).toHaveLength(1);
  });
});
