import { describe, expect, it, vi } from 'vitest';

import { outboundTraceparent } from '@/lib/observability/trace-propagation';
import { runWithTraceContext } from '@/lib/observability/trace-context';

import { traceSandboxExecutor } from '../tracing';
import type { E2BExecutor, ExecutionResult } from '../types';

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
});
