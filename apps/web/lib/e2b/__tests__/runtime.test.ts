/**
 * E2B runtime — conversation-scoped session lifecycle (mocked SDK + mocked session
 * store; no live sandbox / no E2B_API_KEY in this environment).
 *
 * Verifies:
 *   - No conversationId → ephemeral: one sandbox per getE2BExecutor() call, dispose()
 *     kills it immediately (byte-for-byte the original per-call behavior).
 *   - owned scope + no prior session → creates a sandbox, caches a code context per
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

// GOV-5: metering is exercised by its own unit; here it must not reach the
// credit ledger.
const meterSandboxComputeInterval = vi.fn(async (_interval: unknown) => 0);
vi.mock('../compute-metering', () => ({
  meterSandboxComputeInterval: (interval: unknown) => meterSandboxComputeInterval(interval),
}));

// GOV-4: the plan tier is supplied on the scope in these tests, so the
// subscription lookup is never reached; mocked anyway so the module graph does
// not pull the live billing stack into a unit test.
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: vi.fn(async () => ({ plan_tier: 'pro' })) },
}));

interface TestScope {
  tenantId: string;
  userId: string;
  conversationId: string;
  planTier?: string;
}

/** Pro grants 5 sandboxes and a 20-minute lifetime (BILLING_PLAN_PRODUCT_LIMITS). */
function scope(conversationId: string, userId = 'user-1', planTier = 'pro'): TestScope {
  return { tenantId: 'managed-cloud', userId, conversationId, planTier };
}

function scopeKey(value: TestScope): string {
  return `${value.tenantId}:${value.userId}:${value.conversationId}`;
}

const sessions = new Map<
  string,
  { sandboxId: string; contexts: Record<string, unknown>; activeSinceMs?: number }
>();
vi.mock('../session-store', () => ({
  getE2BSession: vi.fn(async (value: TestScope) => sessions.get(scopeKey(value)) ?? null),
  saveE2BSession: vi.fn(async (value: TestScope, session: unknown) => {
    sessions.set(
      scopeKey(value),
      session as { sandboxId: string; contexts: Record<string, unknown>; activeSinceMs?: number },
    );
  }),
  deleteE2BSession: vi.fn(async (value: TestScope) => {
    sessions.delete(scopeKey(value));
  }),
  // GOV-24: count-then-create is now serialised per user. The unit under test
  // only needs the section to run; contention is covered by the store itself.
  withUserSandboxLock: vi.fn(async (_scope: TestScope, critical: () => Promise<unknown>) => ({
    locked: true,
    result: await critical(),
  })),
}));

let sandboxCounter = 0;
const create = vi.fn(async () => {
  sandboxCounter += 1;
  return makeSandboxInstance(`sbx-${sandboxCounter}`);
});
const connect = vi.fn(async (sandboxId: string) => makeSandboxInstance(sandboxId));
const staticKill = vi.fn(async () => true);
const staticPause = vi.fn(async () => true);

// Sandboxes the E2B account currently holds, as the list API would report them. Tests
// populate this to exercise the per-user concurrency quota. `staticList` filters by the
// query's metadata (server-side AND filter) and pages the result once.
let listedSandboxes: Array<{ metadata: Record<string, string> }> = [];
const staticList = vi.fn((opts?: { query?: { metadata?: Record<string, string> } }) => {
  const wanted = opts?.query?.metadata ?? {};
  const items = listedSandboxes.filter((s) =>
    Object.entries(wanted).every(([k, v]) => s.metadata[k] === v),
  );
  let served = false;
  return {
    get hasNext() {
      return !served;
    },
    nextItems: vi.fn(async () => {
      if (served) return [];
      served = true;
      return items;
    }),
  };
});

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
  Sandbox: { create, connect, kill: staticKill, pause: staticPause, list: staticList },
}));

/** Build `count` live sandboxes tagged for `userId` (as the E2B list API would report). */
function liveSandboxesFor(
  userId: string,
  count: number,
): Array<{ metadata: Record<string, string> }> {
  return Array.from({ length: count }, (_, i) => ({
    metadata: { userId, conversationId: `conv-${userId}-${i}` },
  }));
}

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
    listedSandboxes = [];
  });

  it('creates a sandbox + context on first use and persists the session', async () => {
    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor(scope('conv-1'));
    expect(create).toHaveBeenCalledTimes(1);
    expect(connect).not.toHaveBeenCalled();

    await executor!.runCode({ language: 'python', code: 'x = 1' });

    const saved = sessions.get(scopeKey(scope('conv-1')));
    expect(saved).toBeDefined();
    expect(saved!.contexts['python']).toBeDefined();
  });

  it('resumes via Sandbox.connect() instead of creating a new sandbox', async () => {
    sessions.set(scopeKey(scope('conv-2')), {
      sandboxId: 'sbx-existing',
      contexts: { python: { id: 'ctx-existing', language: 'python', cwd: '/home/user' } },
    });
    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor(scope('conv-2'));

    expect(connect).toHaveBeenCalledWith('sbx-existing', expect.any(Object));
    expect(create).not.toHaveBeenCalled();

    await executor!.runCode({ language: 'python', code: 'print(x)' });
    // Reused the cached context; did not create a new one.
    const instance = await connect.mock.results[0]!.value;
    expect(instance.createCodeContext).not.toHaveBeenCalled();
  });

  it('falls back to creating a fresh sandbox when resume fails', async () => {
    sessions.set(scopeKey(scope('conv-3')), { sandboxId: 'sbx-gone', contexts: {} });
    connect.mockRejectedValueOnce(new Error('sandbox not found'));

    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor(scope('conv-3'));

    expect(connect).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(executor).not.toBeNull();
  });

  it('dispose() persists the session instead of killing the sandbox', async () => {
    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor(scope('conv-4'));
    await executor!.runCode({ language: 'python', code: 'x = 1' });
    await executor!.dispose();

    const instance = await create.mock.results[0]!.value;
    expect(instance.kill).not.toHaveBeenCalled();
    expect(sessions.has(scopeKey(scope('conv-4')))).toBe(true);
  });

  it('does not resume another user sandbox when the conversation id collides', async () => {
    sessions.set(scopeKey(scope('shared-conv', 'user-a')), {
      sandboxId: 'sbx-user-a',
      contexts: {},
    });

    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor(scope('shared-conv', 'user-b'));

    expect(executor).not.toBeNull();
    expect(connect).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledOnce();
  });
});

describe('getE2BExecutor — per-user sandbox quota', () => {
  beforeEach(() => {
    sessions.clear();
    vi.clearAllMocks();
    sandboxCounter = 0;
    listedSandboxes = [];
  });

  it('tags a new sandbox with the userId so it is countable by the list API', async () => {
    const { getE2BExecutor } = await import('../runtime');
    await getE2BExecutor(scope('conv-q1', 'user-quota'));
    expect(create).toHaveBeenCalledTimes(1);
    const opts = (create.mock.calls[0] as unknown[])[0] as { metadata?: Record<string, string> };
    expect(opts.metadata?.['userId']).toBe('user-quota');
    expect(opts.metadata?.['conversationId']).toBe('conv-q1');
  });

  it('creates a fresh sandbox when the user is under the quota', async () => {
    listedSandboxes = liveSandboxesFor('user-under', 4); // Pro's limit is 5
    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor(scope('conv-q2', 'user-under'));
    expect(executor).not.toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('refuses a new sandbox (fail-closed) when the user is at the quota', async () => {
    listedSandboxes = liveSandboxesFor('user-max', 5); // at Pro's limit
    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor(scope('conv-q3', 'user-max'));
    expect(executor).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('counts only the requesting user, not other users, toward the quota', async () => {
    // Team is saturated by a different user; this user has none of their own.
    listedSandboxes = liveSandboxesFor('other-user', 20);
    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor(scope('conv-q4', 'fresh-user'));
    expect(executor).not.toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
  });

  // GOV-21-adjacent (CHANGED): this used to assert fail-OPEN, justified by the
  // team-wide cap being the backstop. That backstop disappears for every user
  // at once when the list API degrades — exactly when the per-user cap is the
  // only remaining limit — so a failed quota check now REFUSES.
  it('fails CLOSED when the quota list check throws', async () => {
    staticList.mockImplementationOnce(() => {
      throw new Error('list API unavailable');
    });
    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor(scope('conv-q5', 'user-listerr'));
    expect(executor).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  // GOV-4: sandbox count and lifetime are plan dimensions now, not one flat
  // constant that gave Free exactly what Max 15x got.
  it('scales the sandbox ceiling with the plan', async () => {
    const { getE2BExecutor } = await import('../runtime');

    listedSandboxes = liveSandboxesFor('user-basic', 2); // Basic's limit is 2
    expect(await getE2BExecutor(scope('conv-b', 'user-basic', 'basic'))).toBeNull();

    listedSandboxes = liveSandboxesFor('user-max15', 2); // Max 15x allows 20
    expect(await getE2BExecutor(scope('conv-m', 'user-max15', 'max_15x'))).not.toBeNull();
  });

  it('refuses managed sandboxes to tiers that are not entitled to them', async () => {
    const { getE2BExecutor } = await import('../runtime');
    for (const tier of ['free', 'byok', 'local-only', 'not-a-tier']) {
      expect(await getE2BExecutor(scope(`conv-${tier}`, `user-${tier}`, tier))).toBeNull();
    }
    expect(create).not.toHaveBeenCalled();
  });

  it('applies the plan sandbox lifetime to conversation-scoped sandboxes', async () => {
    const { getE2BExecutor } = await import('../runtime');
    await getE2BExecutor(scope('conv-ttl', 'user-ttl', 'max'));
    const opts = (create.mock.calls[0] as unknown[])[0] as { timeoutMs?: number };
    expect(opts.timeoutMs).toBe(30 * 60_000);
  });

  it('does not run the quota check for ephemeral (no-scope) callers', async () => {
    const { getE2BExecutor } = await import('../runtime');
    await getE2BExecutor();
    expect(staticList).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('pauseE2BSession / killE2BSession', () => {
  beforeEach(() => {
    sessions.clear();
    vi.clearAllMocks();
  });

  it('pauseE2BSession pauses by sandbox ID without connecting', async () => {
    sessions.set(scopeKey(scope('conv-5')), { sandboxId: 'sbx-5', contexts: {} });
    const { pauseE2BSession } = await import('../runtime');
    await pauseE2BSession(scope('conv-5'));
    expect(staticPause).toHaveBeenCalledWith('sbx-5');
    expect(connect).not.toHaveBeenCalled();
  });

  // GOV-5: sandbox seconds were never reserved, settled, or deducted — a user
  // could burn unbounded compute while every spend meter stayed flat.
  it('meters the open compute interval when a sandbox is paused', async () => {
    sessions.set(scopeKey(scope('conv-meter')), {
      sandboxId: 'sbx-meter',
      contexts: {},
      activeSinceMs: Date.now() - 120_000,
    });
    const { pauseE2BSession } = await import('../runtime');
    await pauseE2BSession(scope('conv-meter'));
    expect(meterSandboxComputeInterval).toHaveBeenCalledWith(
      expect.objectContaining({ sandboxId: 'sbx-meter', userId: 'user-1', reason: 'pause' }),
    );
  });

  it('does not meter a session with no open interval', async () => {
    sessions.set(scopeKey(scope('conv-nometer')), { sandboxId: 'sbx-nometer', contexts: {} });
    const { pauseE2BSession } = await import('../runtime');
    await pauseE2BSession(scope('conv-nometer'));
    expect(meterSandboxComputeInterval).not.toHaveBeenCalled();
  });

  it('pauseE2BSession is a no-op when there is no session', async () => {
    const { pauseE2BSession } = await import('../runtime');
    await pauseE2BSession(scope('conv-missing'));
    expect(staticPause).not.toHaveBeenCalled();
  });

  it('killE2BSession kills by sandbox ID and clears the mapping', async () => {
    sessions.set(scopeKey(scope('conv-6', 'user-a')), {
      sandboxId: 'sbx-user-a',
      contexts: {},
    });
    sessions.set(scopeKey(scope('conv-6', 'user-b')), {
      sandboxId: 'sbx-user-b',
      contexts: {},
    });
    const { killE2BSession } = await import('../runtime');
    await killE2BSession(scope('conv-6', 'user-b'));
    expect(staticKill).toHaveBeenCalledWith('sbx-user-b');
    expect(sessions.has(scopeKey(scope('conv-6', 'user-b')))).toBe(false);
    expect(sessions.has(scopeKey(scope('conv-6', 'user-a')))).toBe(true);
  });
});
