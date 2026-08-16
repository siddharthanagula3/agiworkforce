import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('../gate', () => ({ e2bExecutionEnabled: vi.fn(() => true) }));

const meterSandboxComputeInterval = vi.fn(async (_interval: unknown) => 0);
const sandboxComputeIsPriceable = vi.fn(() => true);
vi.mock('../compute-metering', () => ({
  E2B_COMPUTE_RATE_ENV: 'AGI_E2B_COMPUTE_MICROUSD_PER_SECOND',
  meterSandboxComputeInterval: (interval: unknown) => meterSandboxComputeInterval(interval),
  sandboxComputeIsPriceable: () => sandboxComputeIsPriceable(),
}));

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: vi.fn(async () => ({ plan_tier: 'pro' })) },
}));

interface TestScope {
  tenantId: string;
  userId: string;
  conversationId?: string;
  resource?: { kind: 'code_session'; id: string };
  networkAccess?: 'none' | 'trusted' | 'full';
  planTier?: string;
}

function scope(conversationId: string, userId = 'user-1', planTier = 'pro'): TestScope {
  return { tenantId: 'managed-cloud', userId, conversationId, planTier };
}

function scopeKey(value: TestScope): string {
  const resource = value.resource
    ? `${value.resource.kind}:${value.resource.id}`
    : value.conversationId;
  return `${value.tenantId}:${value.userId}:${resource}`;
}

function codeScope(
  codeSessionId: string,
  networkAccess: 'none' | 'trusted' | 'full' = 'none',
): TestScope {
  return {
    tenantId: 'managed-cloud',
    userId: 'user-code',
    resource: { kind: 'code_session', id: codeSessionId },
    networkAccess,
    planTier: 'pro',
  };
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
    commands: {
      run: vi.fn(async () => ({
        stdout: '/home/user\n',
        stderr: '',
        exitCode: 0,
      })),
    },
    updateNetwork: vi.fn(async () => undefined),
    kill: vi.fn(async () => true),
  };
}

vi.mock('@e2b/code-interpreter', () => ({
  Sandbox: { create, connect, kill: staticKill, pause: staticPause, list: staticList },
}));

function liveSandboxesFor(
  userId: string,
  count: number,
): Array<{ metadata: Record<string, string> }> {
  return Array.from({ length: count }, (_, i) => ({
    metadata: { userId, conversationId: `conv-${userId}-${i}` },
  }));
}

describe('getE2BExecutor — unpriced compute (GOV-5)', () => {
  beforeEach(() => {
    sessions.clear();
    vi.clearAllMocks();
  });

  it('refuses to provision any sandbox when compute cannot be priced', async () => {
    sandboxComputeIsPriceable.mockReturnValueOnce(false);
    const { getE2BExecutor } = await import('../runtime');

    await expect(getE2BExecutor(scope('conv-unpriced', 'user-unpriced'))).resolves.toBeNull();
    expect(create).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it('refuses ephemeral (unscoped) sandboxes too', async () => {
    sandboxComputeIsPriceable.mockReturnValueOnce(false);
    const { getE2BExecutor } = await import('../runtime');

    await expect(getE2BExecutor()).resolves.toBeNull();
    expect(create).not.toHaveBeenCalled();
  });
});

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

describe('getE2BExecutor — managed Code session', () => {
  beforeEach(() => {
    sessions.clear();
    vi.clearAllMocks();
    sandboxCounter = 0;
    listedSandboxes = [];
  });

  it('isolates its mapping, metadata, egress policy, and terminal command', async () => {
    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor(codeScope('code-1', 'trusted'));

    expect(executor).not.toBeNull();
    const createOptions = (create.mock.calls[0] as unknown[])[0] as {
      metadata: Record<string, string>;
      network: { allowOut: string[]; denyOut: string[] };
    };
    expect(createOptions.metadata).toMatchObject({
      userId: 'user-code',
      codeSessionId: 'code-1',
    });
    expect(createOptions.metadata['conversationId']).toBeUndefined();
    expect(createOptions.network.allowOut).toContain('github.com');
    expect(createOptions.network.denyOut).toContain('0.0.0.0/0');

    const instance = await create.mock.results[0]!.value;
    expect(instance.updateNetwork).toHaveBeenCalledWith(
      expect.objectContaining({
        allowOut: expect.arrayContaining(['github.com', 'registry.npmjs.org']),
        denyOut: ['0.0.0.0/0'],
      }),
    );
    await expect(
      executor!.runCommand?.({ command: 'pwd', cwd: '/home/user' }),
    ).resolves.toMatchObject({
      ok: true,
      stdout: '/home/user\n',
      exitCode: 0,
    });
    expect(sessions.has(scopeKey(codeScope('code-1', 'trusted')))).toBe(true);
  });

  it('fails closed when the requested network policy cannot be enforced', async () => {
    const broken = makeSandboxInstance('sbx-network-error');
    broken.updateNetwork.mockRejectedValueOnce(new Error('policy update failed'));
    create.mockResolvedValueOnce(broken);

    const { getE2BExecutor } = await import('../runtime');
    await expect(getE2BExecutor(codeScope('code-2', 'none'))).resolves.toBeNull();
    expect(staticPause).toHaveBeenCalledWith('sbx-network-error');
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
    listedSandboxes = liveSandboxesFor('user-under', 4);
    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor(scope('conv-q2', 'user-under'));
    expect(executor).not.toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('refuses a new sandbox (fail-closed) when the user is at the quota', async () => {
    listedSandboxes = liveSandboxesFor('user-max', 5);
    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor(scope('conv-q3', 'user-max'));
    expect(executor).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('counts only the requesting user, not other users, toward the quota', async () => {
    listedSandboxes = liveSandboxesFor('other-user', 20);
    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor(scope('conv-q4', 'fresh-user'));
    expect(executor).not.toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('fails CLOSED when the quota list check throws', async () => {
    staticList.mockImplementationOnce(() => {
      throw new Error('list API unavailable');
    });
    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor(scope('conv-q5', 'user-listerr'));
    expect(executor).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('scales the sandbox ceiling with the plan', async () => {
    const { getE2BExecutor } = await import('../runtime');

    listedSandboxes = liveSandboxesFor('user-basic', 2);
    expect(await getE2BExecutor(scope('conv-b', 'user-basic', 'basic'))).toBeNull();

    listedSandboxes = liveSandboxesFor('user-max15', 2);
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
