/**
 * AGI-27: the sandbox a code-execution turn runs in never held the file the
 * user attached to that turn, so the model's first tool call was a write_file
 * carrying the whole attachment back in, which costs the user an approval
 * before any analysis starts. These cases pin the two orderings that fix it:
 * the bytes are in the sandbox before the first execute_code, and they are in
 * the baseline snapshot before it is taken, so the harvest does not hand the
 * user their own upload back as a generated download.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockBuildToolLoopStream = vi.fn();
type ClaimedUserScopeDbModule = typeof import('@/lib/server/claimed-user-scope-db');
type NeonDbModule = typeof import('@/lib/server/neon-db');
type AttachmentStagingModule = typeof import('@/lib/e2b/attachment-staging');
type ObjectStorageModule = typeof import('@/lib/server/object-storage');

vi.mock('./tool-loop-anthropic', () => ({
  buildToolLoopStream: (...args: unknown[]) => mockBuildToolLoopStream(...args),
  buildServingRouteId: (...args: unknown[]) => args.join(':'),
}));

const mockGetE2BExecutor = vi.fn();
const mockPauseE2BSession = vi.fn();
vi.mock('@/lib/e2b/runtime', () => ({
  getE2BExecutor: (...args: unknown[]) => mockGetE2BExecutor(...args),
  pauseE2BSession: (...args: unknown[]) => mockPauseE2BSession(...args),
}));

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
const stagingCalls = vi.hoisted(() => ({ options: [] as unknown[] }));
vi.mock('@/lib/e2b/attachment-staging', async (importOriginal) => {
  const actual = await importOriginal<AttachmentStagingModule>();
  return {
    ...actual,
    stageStorageFiles: (...args: Parameters<typeof actual.stageStorageFiles>) => {
      stagingCalls.options.push(args[2]);
      return actual.stageStorageFiles(...args);
    },
  };
});
const privateStorage = vi.hoisted(() => ({ getPrivateObjectStream: vi.fn() }));
vi.mock('@/lib/server/object-storage', async (importOriginal) => {
  const actual = await importOriginal<ObjectStorageModule>();
  return { ...actual, getPrivateObjectStream: privateStorage.getPrivateObjectStream };
});

import { runToolLoop } from './tool-loop';
import type { ProcessedRequest } from './request-processor';
import type { E2BExecutor, SandboxFileEntry } from '@/lib/e2b/types';
import { EXECUTE_CODE_TOOL, e2bExecutionToolDefs } from '@/lib/e2b/execution-tools';
import { SANDBOX_WORKSPACE_ROOT, type TurnAttachment } from '@/lib/e2b/attachment-staging';
import { MAX_CHAT_ATTACHMENT_BYTES } from '@/lib/chat-attachment-policy';
import { FUNCTION_TEARDOWN_RESERVE_MS } from '@/lib/deadline-policy';

const MODEL = 'fixture-model';
const CSV = Buffer.from('region,total\nEMEA,12\nAPAC,30\n', 'utf8');

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
  return `data: ${JSON.stringify({
    choices: [{ index: 0, delta, finish_reason: finishReason }],
    model: MODEL,
  })}\n\n`;
}

function executionToolCallStep(): ReadableStream {
  return sseStreamFrom([
    chunk({
      tool_calls: [
        { index: 0, id: 'call_1', function: { name: EXECUTE_CODE_TOOL, arguments: '' } },
      ],
    }),
    chunk({
      tool_calls: [
        {
          index: 0,
          function: {
            arguments: JSON.stringify({
              language: 'python',
              code: "import pandas; print(pandas.read_csv('sales.csv').total.sum())",
            }),
          },
        },
      ],
    }),
    chunk({}, 'tool_calls'),
  ]);
}

function answerStep(text: string): ReadableStream {
  return sseStreamFrom([chunk({ content: text }), chunk({}, 'stop')]);
}

function makeProcessed(turnAttachments: TurnAttachment[]): ProcessedRequest {
  return {
    chatSurface: 'web' as const,
    requestId: 'req-staging',
    chatRequest: {
      model: MODEL,
      messages: [{ role: 'user', content: 'What is the total?' }],
      stream: true,
      code_execution: true,
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
    resolvedTaskType: 'coding' as never,
    turnAttachments,
    classifierConfidence: 1,
    resolvedSlot: null,
    quotaFeature: 'chat' as never,
    quotaWarningHeader: null,
    isFlagshipRequest: false,
    indicResult: undefined as never,
    llmRequest: {
      model: MODEL,
      messages: [{ role: 'user', content: 'What is the total?' }],
      max_tokens: 1000,
      stream: true,
      tools: e2bExecutionToolDefs(),
    },
  } as unknown as ProcessedRequest;
}

function stagedCsv(): TurnAttachment {
  return { filename: 'sales.csv', mimeType: 'text/csv', base64: CSV.toString('base64') };
}

function workspaceEntry(name: string, byteSize: number): SandboxFileEntry {
  return { path: `${SANDBOX_WORKSPACE_ROOT}/${name}`, name, isDir: false, byteSize };
}

function makeExecutor(calls: string[]): E2BExecutor {
  return {
    runCode: vi.fn(async () => {
      calls.push('runCode');
      return { ok: true, output: '42\n' };
    }),
    writeFile: vi.fn(async () => {
      calls.push('writeFile');
      return { ok: true, output: 'Wrote' };
    }),
    createFolder: vi.fn(),
    listFiles: vi.fn(async () => {
      calls.push('listFiles');
      return [workspaceEntry('sales.csv', CSV.byteLength)];
    }),
    dispose: vi.fn(),
  };
}

async function drain(gen: AsyncGenerator<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let out = '';
  for await (const value of gen) out += decoder.decode(value);
  return out;
}

describe('runToolLoop, staging the turn attachments into the sandbox', () => {
  beforeEach(() => {
    mockBuildToolLoopStream.mockReset();
    mockGetE2BExecutor.mockReset();
    mockPauseE2BSession.mockReset();
    vi.stubEnv('AGI_E2B_EXECUTION', '1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('writes the attachment into the workspace before the first execute_code runs', async () => {
    mockBuildToolLoopStream
      .mockResolvedValueOnce(executionToolCallStep())
      .mockResolvedValueOnce(answerStep('The total is 42.'));
    const calls: string[] = [];
    const executor = makeExecutor(calls);
    mockGetE2BExecutor.mockResolvedValue(executor);

    await drain(runToolLoop(makeProcessed([stagedCsv()]), { approvalMode: 'auto' }));

    expect(executor.writeFile).toHaveBeenCalledWith({
      path: `${SANDBOX_WORKSPACE_ROOT}/sales.csv`,
      content: CSV.toString('base64'),
      encoding: 'base64',
    });
    expect(calls.indexOf('writeFile')).toBeLessThan(calls.indexOf('runCode'));
  });

  /**
   * The baseline is how the harvest tells a file the turn produced from one
   * that was already there. Taken before staging, it would treat the user's own
   * upload as output and attach it back to the answer as a download.
   */
  it('stages before the baseline snapshot is taken', async () => {
    mockBuildToolLoopStream
      .mockResolvedValueOnce(executionToolCallStep())
      .mockResolvedValueOnce(answerStep('Done.'));
    const calls: string[] = [];
    mockGetE2BExecutor.mockResolvedValue(makeExecutor(calls));

    await drain(runToolLoop(makeProcessed([stagedCsv()]), { approvalMode: 'auto' }));

    expect(calls.indexOf('writeFile')).toBeLessThan(calls.indexOf('listFiles'));
  });

  it('writes nothing when the turn carried no attachment', async () => {
    mockBuildToolLoopStream
      .mockResolvedValueOnce(executionToolCallStep())
      .mockResolvedValueOnce(answerStep('Done.'));
    const calls: string[] = [];
    const executor = makeExecutor(calls);
    mockGetE2BExecutor.mockResolvedValue(executor);

    await drain(runToolLoop(makeProcessed([]), { approvalMode: 'auto' }));

    expect(executor.writeFile).not.toHaveBeenCalled();
    expect(executor.runCode).toHaveBeenCalled();
  });

  /**
   * Sandbox slots are a small per-user quota, so an attachment must never be
   * the reason a sandbox exists: staging only ever uses one the turn already
   * asked for by calling an execution tool.
   */
  it('provisions no sandbox for a turn that never calls an execution tool', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(answerStep('Answered from the file itself.'));
    mockGetE2BExecutor.mockResolvedValue(makeExecutor([]));

    await drain(runToolLoop(makeProcessed([stagedCsv()]), { approvalMode: 'auto' }));

    expect(mockGetE2BExecutor).not.toHaveBeenCalled();
  });
});

describe('runToolLoop, staging large chat files from storage', () => {
  const LARGE_ID = '11111111-1111-4111-8111-111111111111';
  const USER_ID = 'user-large-file';
  const STORAGE_KEY = `chat-attachments/${USER_ID}/ledger.csv`;
  const LARGE_BYTES = MAX_CHAT_ATTACHMENT_BYTES + 1;
  const MIB = 1024 * 1024;

  function largeObjectStream(bytes: number): ReadableStream<Uint8Array> {
    const block = new Uint8Array(MIB);
    let left = bytes;
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        if (left <= 0) {
          controller.close();
          return;
        }
        const size = Math.min(MIB, left);
        controller.enqueue(size === MIB ? block : block.subarray(0, size));
        left -= size;
      },
    });
  }

  /** The turn as an approval resumes it, with the code call the trifecta gate held. */
  function resumedLargeFileTurn(): ProcessedRequest {
    const processed = makeProcessed([]);
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
              code: "print(open('ledger.csv').read(10))",
            }),
          },
        },
      ],
    } as never);
    processed.largeFileTurn = {
      assetIds: [LARGE_ID],
      attachmentAssetIds: [LARGE_ID],
      limitTokens: 120_000,
      charged: 0,
      readingClosed: false,
      fileToolsOffered: false,
    };
    return processed;
  }

  beforeEach(() => {
    mockBuildToolLoopStream.mockReset();
    mockGetE2BExecutor.mockReset();
    privateStorage.getPrivateObjectStream.mockReset();
    scopedDb.query.mockReset();
    scopedDb.query.mockImplementation(async (sql: string) => {
      if (/to_regclass/.test(sql)) {
        return [{ intakes_table: true, preparations_table: true, scanned_sha256_column: true }];
      }
      if (sql.includes('public.media_assets')) {
        return [
          {
            id: LARGE_ID,
            mime_type: 'text/csv',
            byte_size: String(LARGE_BYTES),
            storage_pathname: STORAGE_KEY,
            file_name: 'ledger.csv',
            source: 'chat-attachment',
            scan_verified: true,
          },
        ];
      }
      return [];
    });
    privateStorage.getPrivateObjectStream.mockImplementation(async () => ({
      body: largeObjectStream(LARGE_BYTES),
    }));
    vi.stubEnv('AGI_E2B_EXECUTION', '1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('streams the large file into the workspace before the approved code runs and says where it is', async () => {
    const requests: { messages: { role: string; content: string; tool_call_id?: string }[] }[] = [];
    mockBuildToolLoopStream.mockImplementation(async (...args: unknown[]) => {
      requests.push(JSON.parse(JSON.stringify(args[2])));
      return answerStep('The ledger starts with zeros.');
    });
    const calls: string[] = [];
    let streamedBytes = 0;
    const executor: E2BExecutor = {
      ...makeExecutor(calls),
      listFiles: vi.fn(async () => []),
      writeFileStream: vi.fn(async ({ content }: { content: ReadableStream<Uint8Array> }) => {
        calls.push('writeFileStream');
        const reader = content.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          streamedBytes += value.byteLength;
        }
        return { ok: true, output: 'Wrote' };
      }),
    };
    mockGetE2BExecutor.mockResolvedValue(executor);

    await drain(
      runToolLoop(resumedLargeFileTurn(), {
        approvalMode: 'manual',
        userId: USER_ID,
        resume: { approvals: [{ toolCallId: 'call_code', decision: 'approved' }] },
      }),
    );

    expect(privateStorage.getPrivateObjectStream).toHaveBeenCalledWith(STORAGE_KEY);
    expect(executor.writeFileStream).toHaveBeenCalledWith(
      expect.objectContaining({ path: `${SANDBOX_WORKSPACE_ROOT}/ledger.csv` }),
    );
    expect(streamedBytes).toBe(LARGE_BYTES);
    expect(calls.indexOf('writeFileStream')).toBeLessThan(calls.indexOf('runCode'));
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
    const result = requests[0]?.messages.find((message) => message.tool_call_id === 'call_code');
    expect(
      result?.content.startsWith(
        `[code sandbox: ledger.csv is at ${SANDBOX_WORKSPACE_ROOT}/ledger.csv]`,
      ),
    ).toBe(true);
  });

  it('names every large file the owner check no longer returns in the first code result', async () => {
    const goneId = '99999999-9999-4999-8999-999999999999';
    const requests: { messages: { role: string; content: string; tool_call_id?: string }[] }[] = [];
    mockBuildToolLoopStream.mockImplementation(async (...args: unknown[]) => {
      requests.push(JSON.parse(JSON.stringify(args[2])));
      return answerStep('Done.');
    });
    const executor: E2BExecutor = {
      ...makeExecutor([]),
      listFiles: vi.fn(async () => []),
      writeFileStream: vi.fn(async ({ content }: { content: ReadableStream<Uint8Array> }) => {
        await new Response(content).arrayBuffer();
        return { ok: true, output: 'Wrote' };
      }),
    };
    mockGetE2BExecutor.mockResolvedValue(executor);
    const processed = resumedLargeFileTurn();
    processed.largeFileTurn!.assetIds = [LARGE_ID, goneId];

    await drain(
      runToolLoop(processed, {
        approvalMode: 'manual',
        userId: USER_ID,
        resume: { approvals: [{ toolCallId: 'call_code', decision: 'approved' }] },
      }),
    );

    const result = requests[0]?.messages.find((message) => message.tool_call_id === 'call_code');
    expect(result?.content).toContain(
      `[code sandbox: ledger.csv is at ${SANDBOX_WORKSPACE_ROOT}/ledger.csv]`,
    );
    expect(result?.content).toContain(
      `[code sandbox: the file with id ${goneId} was not placed in the code sandbox: the stored file could not be found.]`,
    );
  });

  it('says the file is not in the sandbox when the owner check returns no row at all', async () => {
    const requests: { messages: { role: string; content: string; tool_call_id?: string }[] }[] = [];
    mockBuildToolLoopStream.mockImplementation(async (...args: unknown[]) => {
      requests.push(JSON.parse(JSON.stringify(args[2])));
      return answerStep('Done.');
    });
    scopedDb.query.mockImplementation(async (sql: string) =>
      /to_regclass/.test(sql)
        ? [{ intakes_table: true, preparations_table: true, scanned_sha256_column: true }]
        : [],
    );
    const executor: E2BExecutor = { ...makeExecutor([]), writeFileStream: vi.fn() };
    mockGetE2BExecutor.mockResolvedValue(executor);

    await drain(
      runToolLoop(resumedLargeFileTurn(), {
        approvalMode: 'manual',
        userId: USER_ID,
        resume: { approvals: [{ toolCallId: 'call_code', decision: 'approved' }] },
      }),
    );

    expect(executor.writeFileStream).not.toHaveBeenCalled();
    const result = requests[0]?.messages.find((message) => message.tool_call_id === 'call_code');
    expect(
      result?.content.startsWith(
        `[code sandbox: the file with id ${LARGE_ID} was not placed in the code sandbox: the stored file could not be found.]`,
      ),
    ).toBe(true);
  });

  it('passes staging a finite positive cleanup bound even when the loop budget is spent', async () => {
    stagingCalls.options.length = 0;
    mockBuildToolLoopStream.mockResolvedValue(answerStep('Done.'));
    const executor: E2BExecutor = {
      ...makeExecutor([]),
      listFiles: vi.fn(async () => []),
      writeFileStream: vi.fn(async ({ content }: { content: ReadableStream<Uint8Array> }) => {
        await content.cancel();
        return { ok: false, output: 'copy failed' };
      }),
    };
    mockGetE2BExecutor.mockResolvedValue(executor);
    const maxDurationMs = 10_000;
    let clock = 1_000_000;
    const startedAt = clock;

    await drain(
      runToolLoop(resumedLargeFileTurn(), {
        approvalMode: 'manual',
        userId: USER_ID,
        maxDurationMs,
        now: () => {
          const current = clock;
          clock = startedAt + maxDurationMs;
          return current;
        },
        resume: { approvals: [{ toolCallId: 'call_code', decision: 'approved' }] },
      }),
    );

    expect(stagingCalls.options).toHaveLength(1);
    const { removeTimeoutMs, signal } = stagingCalls.options[0] as {
      removeTimeoutMs: number;
      signal: AbortSignal;
    };
    expect(Number.isFinite(removeTimeoutMs)).toBe(true);
    expect(removeTimeoutMs).toBeGreaterThan(0);
    expect(removeTimeoutMs).toBeLessThanOrEqual(FUNCTION_TEARDOWN_RESERVE_MS);
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it('stages nothing from storage for a turn with no large file', async () => {
    mockBuildToolLoopStream.mockResolvedValue(answerStep('Done.'));
    const executor: E2BExecutor = { ...makeExecutor([]), writeFileStream: vi.fn() };
    mockGetE2BExecutor.mockResolvedValue(executor);
    const processed = resumedLargeFileTurn();
    delete processed.largeFileTurn;

    await drain(
      runToolLoop(processed, {
        approvalMode: 'manual',
        userId: USER_ID,
        resume: { approvals: [{ toolCallId: 'call_code', decision: 'approved' }] },
      }),
    );

    expect(executor.runCode).toHaveBeenCalled();
    expect(executor.writeFileStream).not.toHaveBeenCalled();
    expect(
      scopedDb.query.mock.calls.some(([sql]) => String(sql).includes('public.media_assets')),
    ).toBe(false);
    expect(privateStorage.getPrivateObjectStream).not.toHaveBeenCalled();
  });
});
