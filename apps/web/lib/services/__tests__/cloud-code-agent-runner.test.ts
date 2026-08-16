import { describe, expect, it, vi } from 'vitest';
import type { E2BExecutor } from '@/lib/e2b/types';
import { createCloudCodeToolRunner } from '../cloud-code-agent-runner';
import { CLOUD_CODE_COMMAND_DEADLINE_MS } from '@/lib/deadline-policy';

function executorStub(overrides: Partial<E2BExecutor> = {}): E2BExecutor {
  return {
    runCode: vi.fn(),
    writeFile: vi.fn(),
    createFolder: vi.fn(),
    dispose: vi.fn(),
    runCommand: vi.fn(async () => ({
      ok: true,
      output: 'ok',
      stdout: 'ok',
      stderr: '',
      exitCode: 0,
    })),
    readFileBytes: vi.fn(async () => new TextEncoder().encode('contents')),
    ...overrides,
  } as unknown as E2BExecutor;
}

describe('createCloudCodeToolRunner path safety', () => {
  it.each([
    ['/etc/passwd', 'absolute'],
    ['~/.ssh/id_rsa', 'home-relative'],
    ['../../etc/passwd', 'upward traversal'],
    ['src/../../secrets', 'traversal in the middle'],
  ])('refuses to read %s (%s)', async (path) => {
    const executor = executorStub();
    const runner = createCloudCodeToolRunner(executor, '/workspace');
    const result = await runner.readFile(path);
    expect(result.isError).toBe(true);
    expect(result.output).toContain('Refused');
    expect(executor.readFileBytes).not.toHaveBeenCalled();
  });

  it('reads a workspace-relative file', async () => {
    const executor = executorStub();
    const runner = createCloudCodeToolRunner(executor, '/workspace');
    const result = await runner.readFile('src/index.ts');
    expect(result.isError).toBe(false);
    expect(result.output).toBe('contents');
    expect(executor.readFileBytes).toHaveBeenCalledWith('/workspace/src/index.ts');
  });

  it('reports a missing file rather than returning empty content', async () => {
    const executor = executorStub({ readFileBytes: vi.fn(async () => null) });
    const runner = createCloudCodeToolRunner(executor, '/workspace');
    const result = await runner.readFile('nope.ts');
    expect(result.isError).toBe(true);
    expect(result.output).toContain('No such file');
  });

  it('refuses an oversized read instead of flooding the context', async () => {
    const huge = new Uint8Array(500_000);
    const executor = executorStub({ readFileBytes: vi.fn(async () => huge) });
    const runner = createCloudCodeToolRunner(executor, '/workspace');
    const result = await runner.readFile('big.log');
    expect(result.isError).toBe(true);
    expect(result.output).toContain('read limit');
  });

  it('refuses traversal in listFiles too', async () => {
    const executor = executorStub();
    const runner = createCloudCodeToolRunner(executor, '/workspace');
    const result = await runner.listFiles('../..');
    expect(result.isError).toBe(true);
    expect(executor.runCommand).not.toHaveBeenCalled();
  });

  it('quotes the listed path so a crafted name cannot inject a command', async () => {
    const executor = executorStub();
    const runner = createCloudCodeToolRunner(executor, '/workspace');
    await runner.listFiles('dir; rm -rf /');
    const call = vi.mocked(executor.runCommand!).mock.calls[0]?.[0];
    expect(call?.command).toContain('"dir; rm -rf /"');
  });

  it('bounds directory listings', async () => {
    const executor = executorStub();
    const runner = createCloudCodeToolRunner(executor, '/workspace');
    await runner.listFiles('.');
    const call = vi.mocked(executor.runCommand!).mock.calls[0]?.[0];
    expect(call?.command).toContain('head -500');
  });
});

describe('createCloudCodeToolRunner command execution', () => {
  it('does NOT re-check risk — the loop owns that decision', async () => {
    const executor = executorStub();
    const runner = createCloudCodeToolRunner(executor, '/workspace');
    await runner.runCommand('rm -rf build', CLOUD_CODE_COMMAND_DEADLINE_MS);
    expect(executor.runCommand).toHaveBeenCalled();
  });

  it('surfaces stderr and the exit code so a failure is legible to the model', async () => {
    const executor = executorStub({
      runCommand: vi.fn(async () => ({
        ok: false,
        output: '',
        stdout: '',
        stderr: 'boom',
        exitCode: 2,
      })),
    });
    const runner = createCloudCodeToolRunner(executor, '/workspace');
    const result = await runner.runCommand('make', CLOUD_CODE_COMMAND_DEADLINE_MS);
    expect(result.isError).toBe(true);
    expect(result.output).toContain('[stderr]');
    expect(result.output).toContain('boom');
    expect(result.output).toContain('[exit 2]');
  });

  it('runs in the session workspace, not the sandbox default cwd', async () => {
    const executor = executorStub();
    const runner = createCloudCodeToolRunner(executor, '/workspace/repo');
    await runner.runCommand('ls', CLOUD_CODE_COMMAND_DEADLINE_MS);
    const call = vi.mocked(executor.runCommand!).mock.calls[0]?.[0];
    expect(call?.cwd).toBe('/workspace/repo');
  });

  it('turns a thrown sandbox error into a tool error instead of failing the turn', async () => {
    const executor = executorStub({
      runCommand: vi.fn(async () => {
        throw new Error('sandbox died');
      }),
    });
    const runner = createCloudCodeToolRunner(executor, '/workspace');
    const result = await runner.runCommand('ls', CLOUD_CODE_COMMAND_DEADLINE_MS);
    expect(result.isError).toBe(true);
    expect(result.output).toContain('sandbox died');
  });

  it('reports honestly when the sandbox cannot run commands at all', async () => {
    const executor = executorStub({ runCommand: undefined });
    const runner = createCloudCodeToolRunner(executor, '/workspace');
    const result = await runner.runCommand('ls', CLOUD_CODE_COMMAND_DEADLINE_MS);
    expect(result.isError).toBe(true);
    expect(result.output).toContain('cannot run commands');
  });
});

describe('HARD-008 — the runner applies the deadline it is given', () => {
  it('passes the loop-computed timeout to the sandbox instead of a constant', async () => {
    const executor = executorStub();
    const runner = createCloudCodeToolRunner(executor, '/workspace');
    await runner.runCommand('pnpm test', 7_500);
    const call = vi.mocked(executor.runCommand!).mock.calls[0]?.[0];
    expect(call?.timeoutMs).toBe(7_500);
  });
});
