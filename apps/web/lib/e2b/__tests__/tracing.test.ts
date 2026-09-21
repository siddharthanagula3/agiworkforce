import { beforeEach, describe, expect, it, vi } from 'vitest';

import { outboundTraceparent } from '@/lib/observability/trace-propagation';
import { runWithTraceContext } from '@/lib/observability/trace-context';

const spans: Array<Record<string, unknown>> = [];

vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  logger: {
    info: (record: Record<string, unknown>) => spans.push(record),
    error: (record: Record<string, unknown>) => spans.push(record),
    warn: (record: Record<string, unknown>) => spans.push(record),
    debug: (record: Record<string, unknown>) => spans.push(record),
  },
}));

import { traceSandboxExecutor } from '../tracing';
import type {
  CommandExecutionResult,
  E2BExecutor,
  E2BGitExecutor,
  ExecutionResult,
} from '../types';

const GIT_OPERATIONS = [
  'clone',
  'createBranch',
  'add',
  'currentBranch',
  'status',
  'diff',
  'commit',
  'push',
] as const;

const COMMAND_OK: CommandExecutionResult = {
  ok: true,
  output: 'done',
  stdout: 'done',
  stderr: '',
  exitCode: 0,
};

beforeEach(() => {
  spans.length = 0;
});

const CONTEXT = {
  traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
  spanId: '00f067aa0ba902b7',
  sampled: true,
};

const SCOPE = { sandboxId: 'sbx_1', template: 'python', conversationId: 'conv_1' };

const OK: ExecutionResult = { ok: true, output: 'done' };

function executorStub(overrides: Partial<E2BExecutor> = {}): E2BExecutor {
  return {
    runCode: vi.fn(async () => OK),
    writeFile: vi.fn(async () => OK),
    createFolder: vi.fn(async () => OK),
    dispose: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('traceSandboxExecutor', () => {
  it('runs each sandbox op inside the calling turn trace', async () => {
    let seen: string | null = null;
    const traced = traceSandboxExecutor(
      executorStub({
        runCode: vi.fn(async () => {
          seen = outboundTraceparent();
          return OK;
        }),
      }),
      SCOPE,
    );

    const result = await runWithTraceContext(CONTEXT, () =>
      traced.runCode({ language: 'python', code: 'print(1)' }),
    );

    expect(result).toEqual(OK);
    expect(seen).not.toBeNull();
    expect(seen).toContain(CONTEXT.traceId);
    expect(seen).not.toBe(`00-${CONTEXT.traceId}-${CONTEXT.spanId}-01`);
  });

  it('passes arguments and results through untouched', async () => {
    const writeFile = vi.fn(async () => OK);
    const traced = traceSandboxExecutor(executorStub({ writeFile }), SCOPE);

    await traced.writeFile({ path: '/tmp/a', content: 'x', encoding: 'utf8' });

    expect(writeFile).toHaveBeenCalledWith({ path: '/tmp/a', content: 'x', encoding: 'utf8' });
  });

  it('lets a failing op reject so the span records the error', async () => {
    const traced = traceSandboxExecutor(
      executorStub({
        dispose: vi.fn(async () => {
          throw new Error('kill failed');
        }),
      }),
      SCOPE,
    );

    await expect(traced.dispose()).rejects.toThrow('kill failed');
  });

  it('keeps optional members absent rather than defining them as undefined', () => {
    const traced = traceSandboxExecutor(executorStub(), SCOPE);
    expect('runCommand' in traced).toBe(false);
    expect('git' in traced).toBe(false);
    expect('pause' in traced).toBe(false);
  });

  it('wraps the optional members an executor does provide, including git', async () => {
    const status = vi.fn(async () => ({ ...OK, stdout: '', stderr: '', exitCode: 0 }));
    const traced = traceSandboxExecutor(
      executorStub({
        listFiles: vi.fn(async () => []),
        pause: vi.fn(async () => {}),
        git: { status } as unknown as E2BExecutor['git'],
      }),
      SCOPE,
    );

    await traced.listFiles?.('/tmp');
    await traced.pause?.();
    await traced.git?.status({ path: '/tmp' });

    expect(status).toHaveBeenCalledWith({ path: '/tmp' });
  });

  it('opens a span for every operation a sandbox offers, git included', async () => {
    const emitted: string[] = [];
    const git = Object.fromEntries(
      GIT_OPERATIONS.map((name) => [name, vi.fn(async () => COMMAND_OK)]),
    ) as unknown as E2BGitExecutor;
    const executor = executorStub({
      runCommand: vi.fn(async () => COMMAND_OK),
      listFiles: vi.fn(async () => []),
      readFileBytes: vi.fn(async () => new Uint8Array()),
      pause: vi.fn(async () => {}),
      git,
    });
    const traced = traceSandboxExecutor(executor, SCOPE);
    const untraced: string[] = [];

    // The names are not predicted: an operation is traced when calling it opens
    // exactly one sandbox span, whatever that span ended up being called.
    const drive = async (name: string, call: () => Promise<unknown>): Promise<void> => {
      spans.length = 0;
      await call();
      emitted.push(name);
      const opened = spans.filter((span) => String(span['span_name'] ?? '').startsWith('sandbox.'));
      if (opened.length !== 1) untraced.push(`${name} opened ${opened.length} spans`);
    };

    for (const [name, member] of Object.entries(traced)) {
      if (typeof member !== 'function') continue;
      await drive(name, () =>
        (member as (input: unknown) => Promise<unknown>)({
          path: '/tmp',
          code: '',
          command: 'ls',
          content: '',
          language: 'python',
        }),
      );
    }
    for (const name of GIT_OPERATIONS) {
      const member = (traced.git as unknown as Record<string, () => Promise<unknown>>)[name];
      if (!member) {
        untraced.push(`git.${name} is missing from the traced executor`);
        continue;
      }
      await drive(`git.${name}`, () => member());
    }

    expect(untraced).toEqual([]);
    expect(emitted.length).toBe(Object.keys(executor).length - 1 + GIT_OPERATIONS.length);
  });
});
