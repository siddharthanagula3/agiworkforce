/**
 * E2B runtime — conversation-scoped session lifecycle (mocked SDK + mocked session
 * store; no live sandbox / no E2B_API_KEY in this environment).
 *
 * Verifies:
 *   - No conversationId → ephemeral: one sandbox per getE2BExecutor() call, dispose()
 *     kills it immediately (byte-for-byte the original per-call behavior).
 *   - conversationId + no prior session → creates a sandbox, caches a code context per
 *     language, and persists the session (sandboxId + contexts) after each context
 *     create.
 *   - conversationId + a prior session → resumes via Sandbox.connect(sandboxId)
 *     instead of creating a new sandbox, and reuses the cached context.
 *   - conversationId + a prior session that fails to resume → falls back to creating a
 *     fresh sandbox (fail-open on resume, never surfaced to the model).
 *   - pauseE2BSession() / killE2BSession(): pause/kill the sandbox by ID without
 *     needing a live instance handle (static SandboxApi methods), and killE2BSession
 *     clears the Redis mapping.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('../gate', () => ({ e2bExecutionEnabled: vi.fn(() => true) }));

const sessions = new Map<string, { sandboxId: string; contexts: Record<string, unknown> }>();
vi.mock('../session-store', () => ({
  getE2BSession: vi.fn(async (id: string) => sessions.get(id) ?? null),
  saveE2BSession: vi.fn(async (id: string, session: unknown) => {
    sessions.set(id, session as { sandboxId: string; contexts: Record<string, unknown> });
  }),
  deleteE2BSession: vi.fn(async (id: string) => {
    sessions.delete(id);
  }),
}));

let sandboxCounter = 0;
const create = vi.fn(async () => {
  sandboxCounter += 1;
  return makeSandboxInstance(`sbx-${sandboxCounter}`);
});
const connect = vi.fn(async (sandboxId: string) => makeSandboxInstance(sandboxId));
const staticKill = vi.fn(async () => true);
const staticPause = vi.fn(async () => true);

function makeSandboxInstance(sandboxId: string) {
  return {
    sandboxId,
    createCodeContext: vi.fn(async ({ language }: { language: string }) => ({
      id: `ctx-${sandboxId}-${language}`,
      language,
      cwd: '/home/user',
    })),
    runCode: vi.fn(async (code: string) => ({
      logs: { stdout: [`ran: ${code}`], stderr: [] },
      text: undefined,
      error: undefined,
    })),
    files: { write: vi.fn(), makeDir: vi.fn() },
    kill: vi.fn(async () => true),
  };
}

vi.mock('@e2b/code-interpreter', () => ({
  Sandbox: { create, connect, kill: staticKill, pause: staticPause },
}));

describe('getE2BExecutor — ephemeral (no conversationId)', () => {
  beforeEach(() => {
    sessions.clear();
    vi.clearAllMocks();
  });

  it('creates one sandbox per call and kills it on dispose()', async () => {
    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor();
    expect(executor).not.toBeNull();
    expect(create).toHaveBeenCalledTimes(1);

    await executor!.runCode({ language: 'python', code: 'x = 1' });
    await executor!.dispose();

    // dispose() with no conversationId kills the underlying sandbox immediately.
    const instance = await create.mock.results[0]!.value;
    expect(instance.kill).toHaveBeenCalledTimes(1);
  });
});

describe('getE2BExecutor — conversation-scoped', () => {
  beforeEach(() => {
    sessions.clear();
    vi.clearAllMocks();
    sandboxCounter = 0;
  });

  it('creates a sandbox + context on first use and persists the session', async () => {
    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor('conv-1');
    expect(create).toHaveBeenCalledTimes(1);
    expect(connect).not.toHaveBeenCalled();

    await executor!.runCode({ language: 'python', code: 'x = 1' });

    const saved = sessions.get('conv-1');
    expect(saved).toBeDefined();
    expect(saved!.contexts['python']).toBeDefined();
  });

  it('resumes via Sandbox.connect() instead of creating a new sandbox', async () => {
    sessions.set('conv-2', {
      sandboxId: 'sbx-existing',
      contexts: { python: { id: 'ctx-existing', language: 'python', cwd: '/home/user' } },
    });
    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor('conv-2');

    expect(connect).toHaveBeenCalledWith('sbx-existing', expect.any(Object));
    expect(create).not.toHaveBeenCalled();

    await executor!.runCode({ language: 'python', code: 'print(x)' });
    // Reused the cached context; did not create a new one.
    const instance = await connect.mock.results[0]!.value;
    expect(instance.createCodeContext).not.toHaveBeenCalled();
  });

  it('falls back to creating a fresh sandbox when resume fails', async () => {
    sessions.set('conv-3', { sandboxId: 'sbx-gone', contexts: {} });
    connect.mockRejectedValueOnce(new Error('sandbox not found'));

    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor('conv-3');

    expect(connect).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(executor).not.toBeNull();
  });

  it('dispose() persists the session instead of killing the sandbox', async () => {
    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor('conv-4');
    await executor!.runCode({ language: 'python', code: 'x = 1' });
    await executor!.dispose();

    const instance = await create.mock.results[0]!.value;
    expect(instance.kill).not.toHaveBeenCalled();
    expect(sessions.has('conv-4')).toBe(true);
  });
});

describe('pauseE2BSession / killE2BSession', () => {
  beforeEach(() => {
    sessions.clear();
    vi.clearAllMocks();
  });

  it('pauseE2BSession pauses by sandbox ID without connecting', async () => {
    sessions.set('conv-5', { sandboxId: 'sbx-5', contexts: {} });
    const { pauseE2BSession } = await import('../runtime');
    await pauseE2BSession('conv-5');
    expect(staticPause).toHaveBeenCalledWith('sbx-5');
    expect(connect).not.toHaveBeenCalled();
  });

  it('pauseE2BSession is a no-op when there is no session', async () => {
    const { pauseE2BSession } = await import('../runtime');
    await pauseE2BSession('conv-missing');
    expect(staticPause).not.toHaveBeenCalled();
  });

  it('killE2BSession kills by sandbox ID and clears the mapping', async () => {
    sessions.set('conv-6', { sandboxId: 'sbx-6', contexts: {} });
    const { killE2BSession } = await import('../runtime');
    await killE2BSession('conv-6');
    expect(staticKill).toHaveBeenCalledWith('sbx-6');
    expect(sessions.has('conv-6')).toBe(false);
  });
});
