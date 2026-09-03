import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { E2BExecutor } from '@/lib/e2b/types';
import { createExecutorProcessPort } from '../executor-port';

interface SandboxCommandInput {
  command: string;
  cwd?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

const COMMAND = 'claude -p run';
const WORKSPACE = '/home/user/project';
const TIMEOUT_MS = 540_000;
const ABORTED_EXIT_CODE = 130;

function executorWith(runCommand: unknown): E2BExecutor {
  return {
    runCode: vi.fn(),
    writeFile: vi.fn(),
    createFolder: vi.fn(),
    dispose: vi.fn(),
    ...(runCommand ? { runCommand } : {}),
  } as unknown as E2BExecutor;
}

async function runThrough(
  executor: E2BExecutor,
  signal: AbortSignal,
): Promise<{ stdout: string[]; stderr: string[]; exitCode: number }> {
  const port = createExecutorProcessPort(executor);
  if (!port) throw new Error('Expected a process port');
  const stdout: string[] = [];
  const stderr: string[] = [];
  const result = await port.run({
    command: COMMAND,
    cwd: WORKSPACE,
    timeoutMs: TIMEOUT_MS,
    signal,
    onStdout: (line) => stdout.push(line),
    onStderr: (line) => stderr.push(line),
  });
  return { stdout, stderr, exitCode: result.exitCode };
}

describe('running a harness through the sandbox executor', () => {
  it('has no port when the sandbox cannot run commands at all', () => {
    expect(createExecutorProcessPort(executorWith(null))).toBeNull();
  });

  it('replays buffered output as lines when the sandbox does not stream', async () => {
    const executor = executorWith(
      vi.fn(async (_input: SandboxCommandInput) => ({
        ok: true,
        output: '',
        stdout: 'first\nsecond\n',
        stderr: 'warning\n',
        exitCode: 0,
      })),
    );

    const { stdout, stderr, exitCode } = await runThrough(executor, new AbortController().signal);

    expect(stdout).toEqual(['first', 'second']);
    expect(stderr).toEqual(['warning']);
    expect(exitCode).toBe(0);
  });

  it('assembles streamed chunks into lines and does not replay them twice', async () => {
    const executor = executorWith(
      vi.fn(async (input: SandboxCommandInput) => {
        input.onStdout?.('fir');
        input.onStdout?.('st\nsec');
        input.onStdout?.('ond\n');
        return { ok: true, output: '', stdout: 'first\nsecond\n', stderr: '', exitCode: 0 };
      }),
    );

    const { stdout } = await runThrough(executor, new AbortController().signal);

    expect(stdout).toEqual(['first', 'second']);
  });

  it('forwards the command, workspace, budget and abort signal to the sandbox', async () => {
    const runCommand = vi.fn(async (_input: SandboxCommandInput) => ({
      ok: true,
      output: '',
      stdout: '',
      stderr: '',
      exitCode: 0,
    }));
    const controller = new AbortController();
    await runThrough(executorWith(runCommand), controller.signal);

    expect(runCommand.mock.calls[0]?.[0]).toMatchObject({
      command: COMMAND,
      cwd: WORKSPACE,
      timeoutMs: TIMEOUT_MS,
      signal: controller.signal,
    });
  });

  it('reports a cancelled process rather than its truncated exit code', async () => {
    const controller = new AbortController();
    const executor = executorWith(
      vi.fn(async (_input: SandboxCommandInput) => {
        controller.abort();
        return { ok: false, output: '', stdout: '', stderr: '', exitCode: 0 };
      }),
    );

    const { exitCode } = await runThrough(executor, controller.signal);

    expect(exitCode).toBe(ABORTED_EXIT_CODE);
  });
});
