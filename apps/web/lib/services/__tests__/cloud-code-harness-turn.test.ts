import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { SLOT_REGISTRY } from '@agiworkforce/types';
import type { E2BExecutor } from '@/lib/e2b/types';
import { selectHarnessRunner } from '@/lib/e2b/harnesses';
import {
  createHarnessStepProjector,
  runCloudCodeHarnessTurn,
} from '@/lib/services/cloud-code-harness-turn';

const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'e2b',
  'harnesses',
  '__tests__',
  'fixtures',
);
const CLAUDE_STDOUT = readFileSync(join(FIXTURE_DIR, 'claude-stream-json.jsonl'), 'utf8');
const CLAUDE_SESSION_ID = '8f1b0a2c-6a1d-4a54-9f0e-1c2d3e4f5a6b';

const MODEL = SLOT_REGISTRY.coding_balanced.modelId;
const PROVIDER = 'anthropic';
const WORKSPACE = '/home/user/project';
const GOAL = 'Fix the failing auth test';
const MAX_TOOL_NAME_LENGTH = 64;

interface SandboxCommandInput {
  command: string;
  cwd?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

function runner(runtimeId: string) {
  const selected = selectHarnessRunner(runtimeId);
  if (!selected) throw new Error(`Expected a runner for ${runtimeId}`);
  return selected;
}

function executorStub(options: { stdout?: string; storedSessionId?: string } = {}) {
  const runCommand = vi.fn(async (_input: SandboxCommandInput) => ({
    ok: true,
    output: '',
    stdout: options.stdout ?? CLAUDE_STDOUT,
    stderr: '',
    exitCode: 0,
  }));
  const writeFile = vi.fn(async () => ({ ok: true, output: '' }));
  const createFolder = vi.fn(async () => ({ ok: true, output: '' }));
  const readFileBytes = vi.fn(async () =>
    options.storedSessionId ? new TextEncoder().encode(options.storedSessionId) : null,
  );
  const executor = {
    runCode: vi.fn(),
    writeFile,
    createFolder,
    readFileBytes,
    runCommand,
    dispose: vi.fn(),
  } as unknown as E2BExecutor;
  return { executor, runCommand, writeFile, readFileBytes };
}

function turnInput(
  overrides: Partial<Parameters<typeof runCloudCodeHarnessTurn>[0]> = {},
): Parameters<typeof runCloudCodeHarnessTurn>[0] {
  const { executor } = executorStub();
  return {
    runner: runner('claude'),
    executor,
    goal: GOAL,
    workspacePath: WORKSPACE,
    provider: PROVIDER,
    model: MODEL,
    signal: new AbortController().signal,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('a harness turn', () => {
  it('runs the selected harness and returns its own answer', async () => {
    const { executor, runCommand } = executorStub();
    const result = await runCloudCodeHarnessTurn(turnInput({ executor }));

    expect(runCommand.mock.calls[0]?.[0]).toMatchObject({ cwd: WORKSPACE });
    expect(String(runCommand.mock.calls[0]?.[0]?.command)).toContain('claude');
    expect(result.stopReason).toBe('done');
    expect(result.finalMessage).toBe(
      'Fixed the token refresh guard in auth.ts and the suite passes.',
    );
    expect(result.stepsUsed).toBe(1);
  });

  it('records the tokens the harness reported through the observed usage seam', async () => {
    const result = await runCloudCodeHarnessTurn(turnInput());

    expect(result.usage).toMatchObject({
      providerCalls: 1,
      inputTokens: 12,
      outputTokens: 712,
      cacheReadTokens: 18332,
      cacheWriteTokens: 2544,
    });
    expect(result.usage.providerCostDollars).toBeGreaterThan(0);
  });

  it('keeps a harness reported cost when the harness reported no tokens', async () => {
    const stdout = `${JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: 'done',
      total_cost_usd: 0.42,
      session_id: 'session-cost',
    })}\n`;
    const { executor } = executorStub({ stdout });

    const result = await runCloudCodeHarnessTurn(turnInput({ executor }));

    expect(result.usage.providerCalls).toBe(1);
    expect(result.usage.providerCostDollars).toBeCloseTo(0.42);
  });

  it('observes nothing when the harness reported neither tokens nor cost', async () => {
    const { executor } = executorStub({ stdout: 'work in progress\n' });

    const result = await runCloudCodeHarnessTurn(
      turnInput({ executor, runner: runner('opencode') }),
    );

    expect(result.usage.providerCalls).toBe(0);
    expect(result.usage.providerCostDollars).toBeUndefined();
  });

  it('resumes from the stored session and stores the one it just used', async () => {
    const { executor, runCommand, writeFile, readFileBytes } = executorStub({
      storedSessionId: 'previous-session',
    });

    await runCloudCodeHarnessTurn(turnInput({ executor }));

    expect(readFileBytes).toHaveBeenCalledWith('/home/user/.agi-harness/claude.session');
    expect(String(runCommand.mock.calls[0]?.[0]?.command)).toContain("--resume 'previous-session'");
    expect(writeFile).toHaveBeenCalledWith({
      path: '/home/user/.agi-harness/claude.session',
      content: CLAUDE_SESSION_ID,
    });
  });

  it('never reaches for stored state for a harness with no documented resume', async () => {
    const { executor, writeFile, readFileBytes } = executorStub({ stdout: 'done\n' });

    await runCloudCodeHarnessTurn(turnInput({ executor, runner: runner('grok') }));

    expect(readFileBytes).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('fails the turn when the sandbox cannot run commands', async () => {
    const executor = {
      runCode: vi.fn(),
      writeFile: vi.fn(),
      createFolder: vi.fn(),
      dispose: vi.fn(),
    } as unknown as E2BExecutor;

    const result = await runCloudCodeHarnessTurn(turnInput({ executor }));

    expect(result.stopReason).toBe('error');
    expect(result.errorMessage).toBe('This sandbox cannot run the selected coding harness.');
  });

  it('reports a cancelled turn when the request was aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await runCloudCodeHarnessTurn(turnInput({ signal: controller.signal }));

    expect(result.stopReason).toBe('cancelled');
  });
});

describe('projecting harness events onto persisted steps', () => {
  it('carries the tool argument from the start event onto the recorded step', () => {
    const project = createHarnessStepProjector();

    expect(
      project({
        type: 'tool-execution-start',
        toolCallId: 'call-1',
        name: 'Bash',
        category: 'shell',
        summary: 'Bash: ls',
        input: { command: 'ls' },
      }),
    ).toEqual({
      type: 'tool-start',
      stepIndex: 1,
      toolName: 'Bash',
      toolArgs: { command: 'ls' },
    });
    expect(
      project({
        type: 'tool-execution-end',
        toolCallId: 'call-1',
        name: 'Bash',
        output: 'a\nb',
        isError: false,
      }),
    ).toEqual({
      type: 'tool-end',
      stepIndex: 1,
      toolName: 'Bash',
      toolArgs: { command: 'ls' },
      output: 'a\nb',
      isError: false,
    });
  });

  it('keeps a tool name inside the column the step row declares', () => {
    const project = createHarnessStepProjector();
    const name = `mcp__${'x'.repeat(120)}`;

    const step = project({
      type: 'tool-execution-end',
      toolCallId: 'call-2',
      name,
      output: null,
      isError: true,
    });

    expect(step?.toolName).toHaveLength(MAX_TOOL_NAME_LENGTH);
  });

  it('projects assistant text and ignores events the step journal has no column for', () => {
    const project = createHarnessStepProjector();

    expect(project({ type: 'text-delta', delta: 'hello' })).toEqual({
      type: 'assistant-text',
      stepIndex: 0,
      text: 'hello',
    });
    expect(project({ type: 'reasoning-delta', delta: 'thinking' })).toBeNull();
    expect(project({ type: 'stop', reason: 'end-turn' })).toBeNull();
  });
});
