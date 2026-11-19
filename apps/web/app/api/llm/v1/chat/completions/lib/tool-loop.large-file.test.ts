import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockBuildToolLoopStream = vi.fn();
type ToolLoopAnthropicModule = typeof import('./tool-loop-anthropic');
type RuntimeModule = typeof import('@/lib/e2b/runtime');
type FileSearchToolModule = typeof import('@/lib/server/tools/file-search-tool');
type ClaimedUserScopeDbModule = typeof import('@/lib/server/claimed-user-scope-db');
type NeonDbModule = typeof import('@/lib/server/neon-db');

vi.mock('./tool-loop-anthropic', async (importOriginal) => ({
  ...(await importOriginal<ToolLoopAnthropicModule>()),
  buildToolLoopStream: (...args: unknown[]) => mockBuildToolLoopStream(...args),
  buildServingRouteId: (...args: unknown[]) => args.join(':'),
}));

const mockGetE2BExecutor = vi.fn();
vi.mock('@/lib/e2b/runtime', async (importOriginal) => ({
  ...(await importOriginal<RuntimeModule>()),
  getE2BExecutor: (...args: unknown[]) => mockGetE2BExecutor(...args),
  pauseE2BSession: vi.fn(),
}));

const fileTool = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('@/lib/server/tools/file-search-tool', async (importOriginal) => {
  const actual = await importOriginal<FileSearchToolModule>();
  return { ...actual, executeFileTool: fileTool.execute };
});

const scopedDb = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@/lib/server/claimed-user-scope-db', async (importOriginal) => {
  const actual = await importOriginal<ClaimedUserScopeDbModule>();
  return { ...actual, createClaimedUserScopedDb: () => scopedDb };
});
vi.mock('@/lib/server/neon-db', async (importOriginal) => {
  const actual = await importOriginal<NeonDbModule>();
  return {
    ...actual,
    getNeonDb: () => ({
      query: async () => {
        throw new Error('The service database is not part of this test.');
      },
    }),
  };
});

import { runToolLoop } from './tool-loop';
import {
  buildApprovalCheckpointRequest,
  restoreCheckpointedTurn,
} from './approval-checkpoint-request';
import type { ProcessedRequest } from './request-processor';
import type { E2BExecutor } from '@/lib/e2b/types';
import { EXECUTE_CODE_TOOL, e2bExecutionToolDefs } from '@/lib/e2b/execution-tools';
import {
  OPEN_FILE_TOOL_NAME,
  fileSearchToolDefinitions,
  type FileReadingBudget,
  type LargeFileToolTurn,
} from '@/lib/server/tools/file-search-tool';
import { CHAT_LARGE_FILE_POLICY } from '@/lib/chat-attachment-policy';
import { storageNotStagedNote } from '@/lib/e2b/attachment-staging';
import {
  FILE_READING_REMOVED_STUB,
  LARGE_FILE_CARD_KEY,
  LARGE_FILE_TEXT_KEY,
  largeFileTextPart,
  renderLargeFileCard,
  type LargeFileCardMarker,
} from './attachment-turn-budget';
import { withdrawnToolMessage } from './tool-turn-governor';

const MODEL = 'fixture-model';
const USER_ID = 'user-large-file';
const LARGE_ID = '11111111-1111-4111-8111-111111111111';
const QUESTION = 'Which region has the largest total?';

function sseStreamFrom(lines: string[]): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    },
  });
}

function chunk(delta: Record<string, unknown>, finishReason: string | null = null): string {
  return `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finishReason }], model: MODEL })}\n\n`;
}

function toolCallStep(id: string, name: string, args: Record<string, unknown>): ReadableStream {
  return sseStreamFrom([
    chunk({ tool_calls: [{ index: 0, id, function: { name, arguments: JSON.stringify(args) } }] }),
    chunk({}, 'tool_calls'),
  ]);
}

function answerStep(text: string): ReadableStream {
  return sseStreamFrom([chunk({ content: text }), chunk({}, 'stop')]);
}

interface ProviderRequest {
  messages: { role: string; content: string; multimodal_content?: Record<string, unknown>[] }[];
  tools?: { function: { name: string } }[];
}

const providerRequests: ProviderRequest[] = [];

function scriptSteps(steps: ReadableStream[]): void {
  providerRequests.length = 0;
  let index = 0;
  mockBuildToolLoopStream.mockImplementation(async (...args: unknown[]) => {
    providerRequests.push(JSON.parse(JSON.stringify(args[2])) as ProviderRequest);
    const step = steps[index] ?? answerStep('Done.');
    index += 1;
    return step;
  });
}

function toolNames(request: ProviderRequest | undefined): string[] {
  return (request?.tools ?? []).map((tool) => tool.function.name);
}

function card(): LargeFileCardMarker {
  const first = `[attached file: sales.csv (text/csv), 30.0 MiB, id ${LARGE_ID}]`;
  return {
    assetId: LARGE_ID,
    live: true,
    lines: [first, 'Text read: 2,000,000 characters.', 'Its text is searchable.'],
    oneLine: first,
    partial: true,
  };
}

function largeFileMessage() {
  const marker = card();
  const cardPart = {
    type: 'text',
    text: renderLargeFileCard(marker, { oneLine: false, fileToolsOffered: true }),
    [LARGE_FILE_CARD_KEY]: marker,
  };
  const text = largeFileTextPart({
    assetId: LARGE_ID,
    filename: 'sales.csv',
    live: true,
    text: 'region,total\n'.concat('EMEA,12\nAPAC,30\n'.repeat(4_000)),
  });
  return {
    role: 'user' as const,
    content: `${QUESTION}\n${cardPart.text}`,
    multimodal_content: [{ type: 'text', text: QUESTION }, cardPart, text],
  };
}

function makeProcessed(options: {
  largeFileTurn?: ProcessedRequest['largeFileTurn'];
  largeFileTools: boolean;
}): ProcessedRequest {
  const message = options.largeFileTurn
    ? largeFileMessage()
    : { role: 'user' as const, content: QUESTION };
  return {
    chatSurface: 'web' as const,
    requestId: 'req-large-file',
    chatRequest: {
      model: MODEL,
      messages: [{ role: 'user', content: QUESTION }],
      stream: true,
      code_execution: true,
      work_mode: 'agiwork',
    } as never,
    conversationId: undefined,
    requestedModel: MODEL,
    provider: 'openai',
    estimatedCostCents: 0,
    estimatedPromptTokens: 0,
    maxTokens: 1000,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: MODEL,
    resolvedTaskType: 'analysis' as never,
    classifierConfidence: 1,
    resolvedSlot: null,
    quotaFeature: 'chat' as never,
    quotaWarningHeader: null,
    isFlagshipRequest: false,
    indicResult: undefined as never,
    organizationId: null,
    llmRequest: {
      model: MODEL,
      messages: [message],
      max_tokens: 1000,
      stream: true,
      tools: [
        ...e2bExecutionToolDefs(),
        ...fileSearchToolDefinitions(options.largeFileTools ? { largeFileTurn: true } : {}),
      ],
    },
    ...(options.largeFileTurn ? { largeFileTurn: options.largeFileTurn } : {}),
  } as unknown as ProcessedRequest;
}

function ledger(limitTokens: number): NonNullable<ProcessedRequest['largeFileTurn']> {
  return {
    assetIds: [LARGE_ID],
    attachmentAssetIds: [LARGE_ID],
    limitTokens,
    charged: 0,
    readingClosed: false,
    fileToolsOffered: true,
  };
}

function makeExecutor(): E2BExecutor {
  return {
    runCode: vi.fn(async () => ({ ok: true, output: 'APAC\n' })),
    writeFile: vi.fn(async () => ({ ok: true, output: 'Wrote' })),
    createFolder: vi.fn(),
    listFiles: vi.fn(async () => []),
    dispose: vi.fn(),
  };
}

async function drain(gen: AsyncGenerator<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let out = '';
  for await (const value of gen) out += decoder.decode(value);
  return out;
}

/** P11's open_file as the ledger sees it: it returns what the step's budget allows and charges it. */
function readingFileTool() {
  fileTool.execute.mockImplementation(
    async (_name: string, _args: unknown, context: { largeFileTurn?: LargeFileToolTurn }) => {
      const budget: FileReadingBudget | undefined = context.largeFileTurn?.budget;
      if (!budget) return { content: 'region,total\nEMEA,12', isError: false };
      const room = budget.remainingTokens();
      if (room <= 0)
        return { content: 'The reading budget for this turn is used up.', isError: false };
      const text = 'APAC,30\n'.repeat(Math.max(1, Math.floor((room * 3.5) / 8)));
      budget.charge(budget.tokensFor(text));
      return { content: text, isError: false };
    },
  );
}

/** The turn as an approval resumes it: the code call the trifecta gate held, now approved. */
function approvedCodeCall(processed: ProcessedRequest): ProcessedRequest {
  processed.llmRequest.messages.push({
    role: 'assistant',
    content: '',
    tool_calls: [
      {
        id: 'call_code',
        type: 'function',
        function: {
          name: EXECUTE_CODE_TOOL,
          arguments: JSON.stringify({
            language: 'python',
            code: "print(open('sales.csv').readline())",
          }),
        },
      },
    ],
  } as never);
  return processed;
}

/** The turn as an approval resumes it: an open_file call the gate held, now approved. */
function approvedOpenFileCall(processed: ProcessedRequest): ProcessedRequest {
  processed.llmRequest.messages.push({
    role: 'assistant',
    content: '',
    tool_calls: [
      {
        id: 'call_open',
        type: 'function',
        function: {
          name: OPEN_FILE_TOOL_NAME,
          arguments: JSON.stringify({ file_id: LARGE_ID, offset: 0 }),
        },
      },
    ],
  } as never);
  return processed;
}

function textPartsOf(request: ProviderRequest | undefined): unknown[] {
  return (request?.messages ?? []).flatMap((message) =>
    (message.multimodal_content ?? []).filter((part) => part[LARGE_FILE_TEXT_KEY] !== undefined),
  );
}

function toolMessageFor(request: ProviderRequest | undefined, id: string) {
  return request?.messages.find(
    (message) =>
      message.role === 'tool' && (message as { tool_call_id?: string }).tool_call_id === id,
  );
}

describe('runToolLoop with a large file in the turn', () => {
  beforeEach(() => {
    mockBuildToolLoopStream.mockReset();
    mockGetE2BExecutor.mockReset();
    fileTool.execute.mockReset();
    scopedDb.query.mockReset();
    scopedDb.query.mockImplementation(async (sql: string) => {
      if (/to_regclass/.test(sql)) {
        return [{ intakes_table: true, preparations_table: true, scanned_sha256_column: true }];
      }
      return [];
    });
    vi.stubEnv('AGI_E2B_EXECUTION', '1');
    readingFileTool();
    mockGetE2BExecutor.mockResolvedValue(makeExecutor());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('a Work turn with one large CSV still offers code execution at step 30', async () => {
    const steps = Array.from({ length: 29 }, (_, index) =>
      toolCallStep(`call_${index}`, OPEN_FILE_TOOL_NAME, {
        file_id: LARGE_ID,
        offset: index * 1_000,
      }),
    );
    scriptSteps([...steps, answerStep('APAC has the largest total.')]);
    const processed = makeProcessed({
      largeFileTurn: ledger(CHAT_LARGE_FILE_POLICY.turnBudget.maxAttachmentTokensPerTurn),
      largeFileTools: true,
    });

    await drain(runToolLoop(processed, { approvalMode: 'auto', userId: USER_ID, maxSteps: 40 }));

    expect(providerRequests.length).toBeGreaterThanOrEqual(30);
    expect(toolNames(providerRequests[29])).toContain(EXECUTE_CODE_TOOL);
    expect(toolNames(providerRequests[29])).toEqual(toolNames(providerRequests[0]));
    const turn = processed.largeFileTurn!;
    expect(turn.readingClosed).toBe(true);
    expect(turn.charged).toBeLessThanOrEqual(turn.limitTokens);
    expect(fileTool.execute).toHaveBeenCalledWith(
      OPEN_FILE_TOOL_NAME,
      expect.anything(),
      expect.objectContaining({
        largeFileTurn: expect.objectContaining({ attachmentAssetIds: [LARGE_ID] }),
      }),
    );
  });

  it("after reading closes a call to open_file returns the withdrawn-tool message and the step's tool list is unchanged", async () => {
    scriptSteps([
      toolCallStep('call_open', OPEN_FILE_TOOL_NAME, { file_id: LARGE_ID, offset: 0 }),
      answerStep('Answered from the card.'),
    ]);
    const processed = makeProcessed({
      largeFileTurn: { ...ledger(1_000), charged: 990 },
      largeFileTools: true,
    });

    await drain(runToolLoop(processed, { approvalMode: 'auto', userId: USER_ID }));

    expect(processed.largeFileTurn?.readingClosed).toBe(true);
    expect(fileTool.execute).not.toHaveBeenCalled();
    expect(toolMessageFor(providerRequests[1], 'call_open')?.content).toBe(
      withdrawnToolMessage(OPEN_FILE_TOOL_NAME),
    );
    expect(toolNames(providerRequests[1])).toEqual(toolNames(providerRequests[0]));
    expect(toolNames(providerRequests[0])).toContain(OPEN_FILE_TOOL_NAME);
    const firstUser = providerRequests[0]!.messages[0]!;
    expect(
      firstUser.multimodal_content?.some((part) => part[LARGE_FILE_TEXT_KEY] !== undefined),
    ).toBe(false);
    expect(firstUser.content).toContain(
      `[attached file: sales.csv (text/csv), 30.0 MiB, id ${LARGE_ID}]`,
    );
  });

  it.each([
    ['unset', undefined],
    ['on', 'on'],
  ])(
    'a turn with no large file runs open_file and the tool loop as today, flag %s',
    async (_label, flag) => {
      const run = async () => {
        fileTool.execute.mockClear();
        scriptSteps([
          toolCallStep('call_open', OPEN_FILE_TOOL_NAME, { file_id: LARGE_ID }),
          answerStep('The total is 42.'),
        ]);
        await drain(
          runToolLoop(makeProcessed({ largeFileTools: false }), {
            approvalMode: 'auto',
            userId: USER_ID,
          }),
        );
        return {
          requests: providerRequests.map((request) => ({
            messages: request.messages,
            tools: toolNames(request),
          })),
          context: fileTool.execute.mock.calls[0]?.[2] as Record<string, unknown> | undefined,
        };
      };

      vi.stubEnv('CHAT_LARGE_FILES_ENABLED', '');
      const today = await run();
      if (flag === undefined) vi.stubEnv('CHAT_LARGE_FILES_ENABLED', '');
      else vi.stubEnv('CHAT_LARGE_FILES_ENABLED', flag);
      const withFlag = await run();

      expect(withFlag.requests).toEqual(today.requests);
      expect(today.context).toBeDefined();
      expect(today.context).not.toHaveProperty('largeFileTurn');
      expect(withFlag.context).not.toHaveProperty('largeFileTurn');
      expect(toolMessageFor(providerRequests[1], 'call_open')?.content).toBe(
        'region,total\nEMEA,12',
      );
      expect(scopedDb.query).not.toHaveBeenCalledWith(
        expect.stringContaining('media_assets'),
        expect.anything(),
      );
      for (const recorded of [today, withFlag]) {
        expect(recorded.requests[0]!.messages.filter((message) => message.role === 'user')).toEqual(
          [{ role: 'user', content: QUESTION }],
        );
        expect(recorded.requests[0]!.tools).toEqual(
          [...e2bExecutionToolDefs(), ...fileSearchToolDefinitions()].map(
            (tool) => tool.function.name,
          ),
        );
        expect(JSON.stringify(recorded.requests)).not.toMatch(/x_large_file/);
      }
    },
  );

  it('a read that takes the whole step allowance reaches the next request', async () => {
    scriptSteps([
      toolCallStep('call_open', OPEN_FILE_TOOL_NAME, { file_id: LARGE_ID, offset: 0 }),
      answerStep('APAC has the largest total.'),
    ]);
    const processed = makeProcessed({ largeFileTurn: ledger(33_333), largeFileTools: true });

    await drain(runToolLoop(processed, { approvalMode: 'auto', userId: USER_ID }));

    const result = toolMessageFor(providerRequests[1], 'call_open')?.content ?? '';
    expect(result).not.toBe(FILE_READING_REMOVED_STUB);
    expect(result).toContain('APAC,30');
    expect(processed.largeFileTurn!.readingClosed).toBe(false);
    expect(processed.largeFileTurn!.charged).toBeLessThanOrEqual(33_333);
  });

  it('an open_file call approved on resume reads with what the step had left', async () => {
    scriptSteps([answerStep('APAC has the largest total.')]);
    const paused = approvedOpenFileCall(
      makeProcessed({
        largeFileTurn: { ...ledger(120_000), charged: 40_000, stepAllowanceLeft: 5_000 },
        largeFileTools: true,
      }),
    );
    const checkpoint = JSON.parse(
      JSON.stringify({
        request: buildApprovalCheckpointRequest(
          paused.chatRequest,
          {},
          [],
          undefined,
          undefined,
          undefined,
          undefined,
          paused.largeFileTurn,
        ),
        messages: paused.llmRequest.messages,
      }),
    );
    const processed = makeProcessed({ largeFileTools: false });
    processed.llmRequest.tools = e2bExecutionToolDefs();
    restoreCheckpointedTurn(processed, checkpoint);
    let roomSeen = -1;
    fileTool.execute.mockImplementationOnce(
      async (_name: string, _args: unknown, context: { largeFileTurn?: LargeFileToolTurn }) => {
        const budget = context.largeFileTurn!.budget;
        roomSeen = budget.remainingTokens();
        const text = 'APAC,30\n'.repeat(100);
        budget.charge(budget.tokensFor(text));
        return { content: text, isError: false };
      },
    );

    await drain(
      runToolLoop(processed, {
        approvalMode: 'manual',
        userId: USER_ID,
        resume: { approvals: [{ toolCallId: 'call_open', decision: 'approved' }] },
      }),
    );

    expect(roomSeen).toBe(5_000);
    expect(toolMessageFor(providerRequests[0], 'call_open')?.content).toContain('APAC,30');
  });

  it('a provider failover resends the same prepared text and charges the step once', async () => {
    providerRequests.length = 0;
    let call = 0;
    mockBuildToolLoopStream.mockImplementation(async (...args: unknown[]) => {
      providerRequests.push(JSON.parse(JSON.stringify(args[2])) as ProviderRequest);
      call += 1;
      if (call === 1) throw new Error('upstream unavailable');
      return answerStep('APAC has the largest total.');
    });
    const processed = makeProcessed({ largeFileTurn: ledger(120_000), largeFileTools: true });
    const single = makeProcessed({ largeFileTurn: ledger(120_000), largeFileTools: true });

    await drain(
      runToolLoop(processed, {
        approvalMode: 'auto',
        userId: USER_ID,
        failover: {
          next: () => ({
            provider: 'anthropic',
            processed: { ...processed, provider: 'anthropic' } as ProcessedRequest,
          }),
        },
      }),
    );
    const failoverRequests = providerRequests.splice(0);
    scriptSteps([answerStep('APAC has the largest total.')]);
    await drain(runToolLoop(single, { approvalMode: 'auto', userId: USER_ID }));

    expect(failoverRequests).toHaveLength(2);
    expect(textPartsOf(failoverRequests[1])).toHaveLength(1);
    expect(textPartsOf(failoverRequests[1])).toEqual(textPartsOf(failoverRequests[0]));
    expect(processed.largeFileTurn!.charged).toBe(single.largeFileTurn!.charged);
    expect(processed.largeFileTurn!.charged).toBeLessThanOrEqual(120_000);
  });

  it('when the large files cannot be staged the first code result says so', async () => {
    scriptSteps([answerStep('Done.')]);
    scopedDb.query.mockImplementation(async (sql: string) => {
      if (/to_regclass/.test(sql)) {
        return [{ intakes_table: true, preparations_table: true, scanned_sha256_column: true }];
      }
      if (/public\.media_assets/.test(sql)) throw new Error('connection reset');
      return [];
    });

    await drain(
      runToolLoop(
        approvedCodeCall(makeProcessed({ largeFileTurn: ledger(120_000), largeFileTools: true })),
        {
          approvalMode: 'manual',
          userId: USER_ID,
          resume: { approvals: [{ toolCallId: 'call_code', decision: 'approved' }] },
        },
      ),
    );

    expect(toolMessageFor(providerRequests[0], 'call_code')?.content).toContain(
      storageNotStagedNote(`the file with id ${LARGE_ID}`, 'stream_failed'),
    );
  });

  it('a large file whose row the caller does not own is never staged into the sandbox', async () => {
    const executor = { ...makeExecutor(), writeFileStream: vi.fn() };
    mockGetE2BExecutor.mockResolvedValue(executor);
    scriptSteps([answerStep('Done.')]);

    await drain(
      runToolLoop(
        approvedCodeCall(makeProcessed({ largeFileTurn: ledger(120_000), largeFileTools: true })),
        {
          approvalMode: 'manual',
          userId: USER_ID,
          resume: { approvals: [{ toolCallId: 'call_code', decision: 'approved' }] },
        },
      ),
    );

    const lookup = scopedDb.query.mock.calls.find(([sql]) =>
      String(sql).includes('public.media_assets'),
    );
    expect(lookup?.[1]).toEqual([
      [LARGE_ID],
      USER_ID,
      null,
      'chat-attachment',
      'chat-attachments/',
    ]);
    expect(String(lookup?.[0])).toContain('user_id = $2');
    expect(executor.runCode).toHaveBeenCalled();
    expect(executor.writeFileStream).not.toHaveBeenCalled();
  });
});
