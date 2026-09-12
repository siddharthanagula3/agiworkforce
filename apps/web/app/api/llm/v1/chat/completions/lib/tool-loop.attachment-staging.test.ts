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

import { runToolLoop } from './tool-loop';
import type { ProcessedRequest } from './request-processor';
import type { E2BExecutor, SandboxFileEntry } from '@/lib/e2b/types';
import { EXECUTE_CODE_TOOL, e2bExecutionToolDefs } from '@/lib/e2b/execution-tools';
import { SANDBOX_WORKSPACE_ROOT, type TurnAttachment } from '@/lib/e2b/attachment-staging';

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
