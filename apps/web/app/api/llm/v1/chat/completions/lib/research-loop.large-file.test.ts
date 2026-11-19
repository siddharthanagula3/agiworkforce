import { beforeEach, describe, expect, it, vi } from 'vitest';

type LoggerModule = typeof import('@/lib/logger');
type ToolLoopAnthropicModule = typeof import('./tool-loop-anthropic');

vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('./tool-loop-anthropic', async (importOriginal) => ({
  ...(await importOriginal<ToolLoopAnthropicModule>()),
  buildToolLoopStream: vi.fn(),
  buildServingRouteId: vi.fn(),
}));

import { requireProviderDefaultModel } from '@agiworkforce/types';
import { buildToolLoopStream } from './tool-loop-anthropic';
import { runResearchLoop, type ResearchLoopCheckpoint } from './research-loop';
import {
  LARGE_FILE_CARD_KEY,
  LARGE_FILE_MORE_KEY,
  applyAttachmentTurnStep,
  cardMarkerOf,
  attachmentPartTokens,
  largeFileTextPart,
  renderLargeFileCard,
  type LargeFileCardMarker,
} from './attachment-turn-budget';
import type { ProcessedRequest } from './request-processor';

const MODEL = requireProviderDefaultModel('google');
const LARGE_ID = '22222222-2222-4222-8222-222222222222';
const QUESTION = 'Which region grew fastest, and what do public sources say about why?';
const LIMIT_TOKENS = 40_000;
const BILLING = { userId: 'user-large-file', token: 'tok' };

const streamMock = vi.mocked(buildToolLoopStream);

interface SentMessage {
  role: string;
  content: string;
  multimodal_content?: unknown[];
}

const sentRequests: Array<{ messages: SentMessage[] }> = [];

function sseStream(events: unknown[]): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}

function textTurn(text: string, results: Array<{ url: string; title: string }> = []) {
  return sseStream([
    ...(results.length > 0
      ? [
          {
            choices: [
              {
                delta: {
                  x_search_results: {
                    content: results.map((result) => ({ type: 'web_search_result', ...result })),
                  },
                },
                index: 0,
              },
            ],
          },
        ]
      : []),
    { choices: [{ delta: { content: text }, index: 0 }] },
    { choices: [{ delta: {}, finish_reason: 'stop', index: 0 }] },
  ]);
}

function toolCallTurn(name: string) {
  return sseStream([
    {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call-not-offered',
                type: 'function',
                function: { name, arguments: JSON.stringify({ url: 'https://example.org/apac' }) },
              },
            ],
          },
          index: 0,
        },
      ],
    },
    { choices: [{ delta: {}, finish_reason: 'tool_calls', index: 0 }] },
  ]);
}

const PLAN_TURN = () =>
  textTurn(JSON.stringify(['regional growth 2026', 'growth drivers', 'market outlook']));
const ROUND_TURNS = [
  () =>
    textTurn('APAC grew fastest.', [
      { url: 'https://example.org/apac-growth', title: 'APAC growth review' },
    ]),
  () =>
    textTurn('Drivers were exports.', [
      { url: 'https://example.org/drivers', title: 'Growth drivers report' },
    ]),
  () =>
    textTurn('The outlook is steady.', [
      { url: 'https://example.org/outlook', title: 'Market outlook brief' },
    ]),
];
const REPORT_TURN = () =>
  textTurn('# Regional growth\n\nAPAC grew fastest [1], driven by exports [2].');

function scriptResearchTurns(
  turns: Array<() => ReadableStream> = [PLAN_TURN, ...ROUND_TURNS, REPORT_TURN],
): void {
  sentRequests.length = 0;
  let call = 0;
  streamMock.mockImplementation(async (_provider, _processed, stepRequest) => {
    sentRequests.push(JSON.parse(JSON.stringify(stepRequest)) as { messages: SentMessage[] });
    const turn = turns[Math.min(call, turns.length - 1)]!;
    call += 1;
    return turn();
  });
}

const LARGE_FILE_TEXT = 'region,total\n'.concat('EMEA,12\nAPAC,30\n'.repeat(12_000));
const SMALL_FILE_TEXT = 'region,total\nEMEA,12\nAPAC,30\n';

function fileCard(assetId: string, filename: string, partial: boolean): LargeFileCardMarker {
  const first = `[attached file: ${filename} (text/csv), 30.0 MB, id ${assetId}]`;
  return {
    assetId,
    live: true,
    lines: [first, 'Text read: 2,000,000 characters.'],
    oneLine: first,
    partial,
  };
}

function cardPart(card: LargeFileCardMarker) {
  return {
    type: 'text',
    text: renderLargeFileCard(card, { oneLine: false, fileToolsOffered: false }),
    [LARGE_FILE_CARD_KEY]: card,
  };
}

function largeFileMessage(text = LARGE_FILE_TEXT): SentMessage {
  const card = cardPart(fileCard(LARGE_ID, 'sales.csv', text === LARGE_FILE_TEXT));
  const textPart = largeFileTextPart({
    assetId: LARGE_ID,
    filename: 'sales.csv',
    live: true,
    text,
  });
  return {
    role: 'user',
    content: `${QUESTION}\n${card.text}`,
    multimodal_content: [{ type: 'text', text: QUESTION }, card, textPart],
  };
}

const MANY_FILE_COUNT = 60;

function manyFileIds(): string[] {
  return Array.from(
    { length: MANY_FILE_COUNT },
    (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  );
}

function manyFilesMessage(): SentMessage {
  const cards = manyFileIds().map((assetId, index) =>
    cardPart(fileCard(assetId, `region-${index}.csv`, false)),
  );
  return {
    role: 'user',
    content: [QUESTION, ...cards.map((card) => card.text)].join('\n'),
    multimodal_content: [{ type: 'text', text: QUESTION }, ...cards],
  };
}

function makeProcessed(
  largeFileTurn?: ProcessedRequest['largeFileTurn'],
  message: SentMessage = largeFileMessage(),
): ProcessedRequest {
  const messages = [message];
  if (largeFileTurn) {
    const firstStep = applyAttachmentTurnStep(messages, largeFileTurn);
    largeFileTurn.pendingStepAllowance = firstStep.resultsAllowanceTokens;
  }
  return {
    requestId: 'req-research-large-file',
    requestedModel: MODEL,
    provider: 'google',
    estimatedCostCents: 2,
    quotaFeature: 'chat',
    isFlagshipRequest: false,
    organizationId: null,
    chatRequest: { model: MODEL },
    llmRequest: {
      model: MODEL,
      messages,
      max_tokens: 2048,
      tools: [{ google_search: {} }],
    },
    ...(largeFileTurn ? { largeFileTurn } : {}),
  } as unknown as ProcessedRequest;
}

function ledger(
  assetIds: string[] = [LARGE_ID],
  limitTokens = LIMIT_TOKENS,
): NonNullable<ProcessedRequest['largeFileTurn']> {
  return {
    assetIds,
    attachmentAssetIds: assetIds,
    limitTokens,
    charged: 0,
    readingClosed: false,
    fileToolsOffered: false,
  };
}

function totalFileInput(): number {
  return sentRequests.map(fileInputTokens).reduce((sum, tokens) => sum + tokens, 0);
}

function synthesisDirectiveSent(): string {
  const messages = sentRequests.at(-1)!.messages;
  return messages.at(-1)!.content;
}

const REPORT_ONLY_PHRASE = 'begin with the report itself';
const IN_PART_PHRASE = 'based on part of the attached files';

function filesAccountedFor(request: { messages: SentMessage[] }): number {
  const parts = request.messages.flatMap((message) => message.multimodal_content ?? []);
  const visible = parts.filter((part) => cardMarkerOf(part) !== null).length;
  const dropped = parts
    .map((part) => (part as Record<string, unknown>)[LARGE_FILE_MORE_KEY])
    .reduce<number>(
      (total, marker) => total + ((marker as { dropped?: number } | undefined)?.dropped ?? 0),
      0,
    );
  return visible + dropped;
}

function fileInputTokens(request: { messages: SentMessage[] }): number {
  return request.messages
    .flatMap((message) => message.multimodal_content ?? [])
    .reduce<number>((total, part) => total + attachmentPartTokens(part), 0);
}

async function drain(gen: AsyncGenerator<Uint8Array>): Promise<void> {
  for await (const _chunk of gen) void _chunk;
}

beforeEach(() => {
  vi.clearAllMocks();
  scriptResearchTurns();
});

describe('research loop under the large-file turn ledger', () => {
  it('keeps the file input of every research call together within the turn budget', async () => {
    const turnLedger = ledger();
    const processed = makeProcessed(turnLedger);
    const firstStepTokens = fileInputTokens({
      messages: processed.llmRequest.messages as SentMessage[],
    });
    expect(firstStepTokens).toBeGreaterThan(LIMIT_TOKENS / 4);

    await drain(runResearchLoop(processed, BILLING, { maxIterations: 5, maxSearches: 12 }));

    expect(sentRequests).toHaveLength(5);
    const perCall = sentRequests.map(fileInputTokens);
    expect(perCall[0]).toBe(firstStepTokens);
    const total = perCall.reduce((sum, tokens) => sum + tokens, 0);
    expect(total).toBeLessThanOrEqual(LIMIT_TOKENS);
    expect(turnLedger.charged).toBeLessThanOrEqual(LIMIT_TOKENS);
    expect(turnLedger.pendingStepAllowance).toBeUndefined();
  });

  it('sends a research turn without a large file exactly as it was built', async () => {
    const processed = makeProcessed();
    const built = JSON.parse(JSON.stringify(processed.llmRequest.messages)) as SentMessage[];

    await drain(runResearchLoop(processed, BILLING, { maxIterations: 5, maxSearches: 12 }));

    expect(sentRequests).toHaveLength(5);
    for (const request of sentRequests) {
      expect(request.messages[0]).toEqual(built[0]);
      expect(fileInputTokens(request)).toBe(fileInputTokens({ messages: built }));
    }
  });

  it('charges a tool pass inside a gathering round like any other research call', async () => {
    scriptResearchTurns([
      PLAN_TURN,
      () => toolCallTurn('not_offered_tool'),
      ...ROUND_TURNS,
      REPORT_TURN,
    ]);
    const turnLedger = ledger();
    const processed = makeProcessed(turnLedger);

    await drain(runResearchLoop(processed, BILLING, { maxIterations: 5, maxSearches: 12 }));

    expect(sentRequests).toHaveLength(6);
    expect(sentRequests[2]!.messages.some((message) => message.role === 'tool')).toBe(true);
    expect(fileInputTokens(sentRequests[2]!)).toBeLessThan(fileInputTokens(sentRequests[1]!));
    expect(totalFileInput()).toBeLessThanOrEqual(LIMIT_TOKENS);
    expect(turnLedger.charged).toBeLessThanOrEqual(LIMIT_TOKENS);
  });

  it('keeps the count of files left out on every call, not only the call that left them out', async () => {
    const ids = manyFileIds();
    const turnLedger = ledger(ids, 4_000);
    const processed = makeProcessed(turnLedger, manyFilesMessage());
    const firstStep = { messages: processed.llmRequest.messages as SentMessage[] };
    expect(
      firstStep.messages[0]!.multimodal_content!.filter((part) => cardMarkerOf(part)),
    ).not.toHaveLength(MANY_FILE_COUNT);

    await drain(runResearchLoop(processed, BILLING, { maxIterations: 5, maxSearches: 12 }));

    expect(sentRequests).toHaveLength(5);
    for (const request of sentRequests) {
      expect(filesAccountedFor(request)).toBe(MANY_FILE_COUNT);
    }
    expect(turnLedger.readingClosed).toBe(true);
    expect(turnLedger.charged).toBeLessThanOrEqual(4_000);
  });

  it('keeps the file input within the turn budget across a research continuation', async () => {
    const turnLedger = ledger();
    const processed = makeProcessed(turnLedger);
    const checkpoints: ResearchLoopCheckpoint[] = [];
    const clock = () => 1_000;

    await drain(
      runResearchLoop(processed, BILLING, {
        maxIterations: 5,
        maxSearches: 12,
        now: clock,
        invocation: {
          startedAtMs: 0,
          handOffAfterMs: 0,
          synthesisStartsWithinMs: 0,
          deadlineMs: 600_000,
          onCheckpoint: async (checkpoint) => {
            checkpoints.push(checkpoint);
          },
        },
      }),
    );
    expect(checkpoints).toHaveLength(1);
    const callsBeforeHandOff = sentRequests.length;
    expect(callsBeforeHandOff).toBeLessThan(5);

    const resumedProcessed = JSON.parse(JSON.stringify(processed)) as ProcessedRequest;
    const resumeFrom = JSON.parse(JSON.stringify(checkpoints[0])) as ResearchLoopCheckpoint;
    await drain(
      runResearchLoop(resumedProcessed, BILLING, {
        maxIterations: 5,
        maxSearches: 12,
        now: clock,
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
      }),
    );

    expect(sentRequests.length).toBeGreaterThan(callsBeforeHandOff);
    expect(sentRequests.at(-1)!.messages.at(-1)!.content).toContain(REPORT_ONLY_PHRASE);
    expect(totalFileInput()).toBeLessThanOrEqual(LIMIT_TOKENS);
    expect(resumedProcessed.largeFileTurn!.charged).toBeLessThanOrEqual(LIMIT_TOKENS);
  });
});

describe('research report directive', () => {
  it('tells the report call that its reply is shown as the report, from the first word', async () => {
    await drain(runResearchLoop(makeProcessed(), BILLING, { maxIterations: 5, maxSearches: 12 }));

    const directive = synthesisDirectiveSent();
    expect(directive).toMatch(/^Synthesis phase:/);
    expect(directive).toContain('shown to the person as the report exactly as you write it');
    expect(directive).toContain(REPORT_ONLY_PHRASE);
    expect(directive).not.toContain(IN_PART_PHRASE);
  });

  it('asks the report to say it rests on part of a file the ledger cut', async () => {
    const turnLedger = ledger();
    await drain(
      runResearchLoop(makeProcessed(turnLedger), BILLING, { maxIterations: 5, maxSearches: 12 }),
    );

    expect(synthesisDirectiveSent()).toContain(IN_PART_PHRASE);
  });

  it('does not ask for that when the whole file was sent', async () => {
    const turnLedger = ledger();
    await drain(
      runResearchLoop(makeProcessed(turnLedger, largeFileMessage(SMALL_FILE_TEXT)), BILLING, {
        maxIterations: 5,
        maxSearches: 12,
      }),
    );

    expect(turnLedger.readingClosed).toBe(false);
    expect(synthesisDirectiveSent()).not.toContain(IN_PART_PHRASE);
    expect(sentRequests.at(-1)!.messages[0]!.multimodal_content).toHaveLength(3);
  });
});
