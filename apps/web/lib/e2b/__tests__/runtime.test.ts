import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env['CSRF_SECRET'] ||= 'a'.repeat(40);
process.env['NEXT_PUBLIC_APP_URL'] ||= 'https://app.agiworkforce.test';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('../gate', () => ({ e2bExecutionEnabled: vi.fn(() => true) }));

const templateVcpuCount = vi.fn(async (_templateId: unknown) => null as number | null);
vi.mock('../templates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../templates')>();
  return { ...actual, templateVcpuCount: (templateId: unknown) => templateVcpuCount(templateId) };
});

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

const buildServerProviderAdapter = vi.fn((providerId: string): { config: { apiKey?: string } } => {
  throw new Error(`no managed key configured for ${providerId}`);
});
vi.mock('@/lib/services/provider-adapter-service', () => ({
  buildServerProviderAdapter: (providerId: string) => buildServerProviderAdapter(providerId),
}));

interface TestScope {
  tenantId: string;
  userId: string;
  conversationId?: string;
  resource?: { kind: 'code_session'; id: string };
  networkAccess?: 'none' | 'trusted' | 'full';
  planTier?: string;
  templateId?: string | null;
  explicitCredential?: { envVar: string; value: string } | null;
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
  extra: Partial<Pick<TestScope, 'templateId' | 'explicitCredential'>> = {},
): TestScope {
  return {
    tenantId: 'managed-cloud',
    userId: 'user-code',
    resource: { kind: 'code_session', id: codeSessionId },
    networkAccess,
    planTier: 'pro',
    ...extra,
  };
}

interface TestSession {
  sandboxId: string;
  contexts: Record<string, unknown>;
  activeSinceMs?: number;
  templateId?: string;
  extraHosts?: readonly string[];
}

const sessions = new Map<string, TestSession>();
vi.mock('../session-store', () => ({
  CHAT_SANDBOX_NETWORK_ACCESS: 'trusted',
  getE2BSession: vi.fn(async (value: TestScope) => sessions.get(scopeKey(value)) ?? null),
  saveE2BSession: vi.fn(async (value: TestScope, session: unknown) => {
    sessions.set(scopeKey(value), session as TestSession);
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
// Killing takes the sandbox out of the listing, as the real API does, so a
// re-count after an eviction sees the slot it freed.
const staticKill = vi.fn(async (sandboxId?: string) => {
  if (sandboxId) listedSandboxes = listedSandboxes.filter((s) => s.sandboxId !== sandboxId);
  return true;
});
const staticPause = vi.fn(async () => true);

interface ListedSandbox {
  metadata: Record<string, string>;
  sandboxId: string;
  startedAt: Date;
  state: 'running' | 'paused';
}
let listedSandboxes: ListedSandbox[] = [];
const staticList = vi.fn(
  (opts?: { query?: { metadata?: Record<string, string>; state?: string[] } }) => {
    const wanted = opts?.query?.metadata ?? {};
    const wantedStates = opts?.query?.state;
    const items = listedSandboxes.filter(
      (s) =>
        Object.entries(wanted).every(([k, v]) => s.metadata[k] === v) &&
        (!wantedStates || wantedStates.includes(s.state)),
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
  },
);

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
    git: {
      clone: vi.fn(async () => ({ stdout: 'cloned', stderr: '', exitCode: 0 })),
      add: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 })),
      commit: vi.fn(async () => ({ stdout: 'committed', stderr: '', exitCode: 0 })),
      push: vi.fn(async () => ({ stdout: 'pushed', stderr: '', exitCode: 0 })),
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
  state: 'running' | 'paused' = 'running',
): ListedSandbox[] {
  return Array.from({ length: count }, (_, i) => ({
    metadata: { userId, conversationId: `conv-${userId}-${i}` },
    sandboxId: `sbx-${userId}-${i}`,
    startedAt: new Date(1_000 + i * 1_000),
    state,
  }));
}

describe('getE2BExecutor, unpriced compute (GOV-5)', () => {
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

describe('getE2BExecutor, ephemeral (no conversationId)', () => {
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

describe('getE2BExecutor, conversation-scoped', () => {
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

  it('kills the sandbox it could not reach before creating the replacement', async () => {
    sessions.set(scopeKey(scope('conv-transient')), { sandboxId: 'sbx-stranded', contexts: {} });
    connect.mockRejectedValueOnce(new Error('ECONNRESET'));

    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor(scope('conv-transient'));

    expect(executor).not.toBeNull();
    expect(staticKill).toHaveBeenCalledWith('sbx-stranded');
    expect(staticKill.mock.invocationCallOrder[0]!).toBeLessThan(
      create.mock.invocationCallOrder[0]!,
    );
    expect(sessions.get(scopeKey(scope('conv-transient')))!.sandboxId).not.toBe('sbx-stranded');
  });

  it('settles the stranded sandbox open compute interval before replacing it', async () => {
    sessions.set(scopeKey(scope('conv-transient-meter')), {
      sandboxId: 'sbx-stranded-meter',
      contexts: {},
      activeSinceMs: Date.now() - 120_000,
    });
    connect.mockRejectedValueOnce(new Error('ECONNRESET'));

    const { getE2BExecutor } = await import('../runtime');
    await getE2BExecutor(scope('conv-transient-meter'));

    expect(meterSandboxComputeInterval).toHaveBeenCalledWith(
      expect.objectContaining({ sandboxId: 'sbx-stranded-meter', reason: 'kill' }),
    );
  });

  it('still replaces the sandbox when the release kill itself fails', async () => {
    sessions.set(scopeKey(scope('conv-kill-fails')), { sandboxId: 'sbx-unkillable', contexts: {} });
    connect.mockRejectedValueOnce(new Error('ECONNRESET'));
    staticKill.mockRejectedValueOnce(new Error('kill API unavailable'));

    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor(scope('conv-kill-fails'));

    expect(executor).not.toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
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

  it('inherits the trusted chat default when the scope declares no networkAccess', async () => {
    const { getE2BExecutor } = await import('../runtime');
    await getE2BExecutor(scope('conv-net'));

    const createOptions = (create.mock.calls[0] as unknown[])[0] as {
      allowInternetAccess?: boolean;
      network?: { allowOut?: string[]; denyOut?: string[] };
    };
    expect(createOptions.allowInternetAccess).toBeUndefined();
    expect(createOptions.network?.allowOut).toContain('github.com');
    expect(createOptions.network?.allowOut).toContain('registry.npmjs.org');
    expect(createOptions.network?.denyOut).toContain('0.0.0.0/0');
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

describe('getE2BExecutor, managed Code session', () => {
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

  it('persists the template id on the session so a later close can resolve its vCPU cost', async () => {
    const { getE2BExecutor } = await import('../runtime');
    await getE2BExecutor(codeScope('code-template', 'trusted', { templateId: 'claude' }));

    const saved = sessions.get(scopeKey(codeScope('code-template', 'trusted')));
    expect(saved?.templateId).toBe('claude');
  });

  it('persists a code context across calls so a notebook cell can see an earlier one', async () => {
    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor(codeScope('code-notebook', 'trusted'));
    await executor!.runCode({ language: 'python', code: 'x = 1' });
    await executor!.runCode({ language: 'python', code: 'print(x)' });

    const instance = await create.mock.results[0]!.value;
    expect(instance.createCodeContext).toHaveBeenCalledTimes(1);
    expect(instance.runCode).toHaveBeenNthCalledWith(
      2,
      'print(x)',
      expect.objectContaining({ context: expect.objectContaining({ language: 'python' }) }),
    );
    const saved = sessions.get(scopeKey(codeScope('code-notebook', 'trusted')));
    expect(saved?.contexts['python']).toBeDefined();
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

describe('getE2BExecutor, harness credentials', () => {
  beforeEach(() => {
    sessions.clear();
    vi.clearAllMocks();
    sandboxCounter = 0;
    listedSandboxes = [];
    buildServerProviderAdapter.mockImplementation((providerId: string) => {
      throw new Error(`no managed key configured for ${providerId}`);
    });
  });

  it('withholds the raw managed provider key from a code-session sandbox for a harness the proxy does not cover, even when the platform has one', async () => {
    buildServerProviderAdapter.mockImplementation((providerId: string) => {
      if (providerId === 'factory') return { config: { apiKey: 'sk-managed-factory' } };
      throw new Error(`no managed key configured for ${providerId}`);
    });

    const { getE2BExecutor } = await import('../runtime');
    await getE2BExecutor(codeScope('code-droid', 'trusted', { templateId: 'droid' }));

    const createOptions = (create.mock.calls[0] as unknown[])[1] as {
      envs?: Record<string, string>;
    };
    expect(createOptions.envs).toBeUndefined();
    expect(buildServerProviderAdapter).not.toHaveBeenCalled();
  });

  it('withholds the raw key for opencode too, even though it is a multi-provider fallback, not a single-provider miss', async () => {
    buildServerProviderAdapter.mockImplementation((providerId: string) => {
      if (providerId === 'openai') return { config: { apiKey: 'sk-openai' } };
      throw new Error(`no managed key configured for ${providerId}`);
    });

    const { getE2BExecutor } = await import('../runtime');
    await getE2BExecutor(codeScope('code-opencode-danger', 'none', { templateId: 'opencode' }));

    const createOptions = (create.mock.calls[0] as unknown[])[1] as {
      envs?: Record<string, string>;
    };
    expect(createOptions.envs).toBeUndefined();
  });

  it('omits the credential entirely when no managed key resolves for the harness', async () => {
    const { getE2BExecutor } = await import('../runtime');
    await getE2BExecutor(codeScope('code-nokey', 'trusted', { templateId: 'droid' }));

    const createOptions = (create.mock.calls[0] as unknown[])[1] as {
      envs?: Record<string, string>;
    };
    expect(createOptions.envs).toBeUndefined();
  });

  it('never grants a harness key to a plan without managed sandbox entitlement', async () => {
    buildServerProviderAdapter.mockImplementation(() => ({
      config: { apiKey: 'sk-should-not-be-used' },
    }));

    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor({
      tenantId: 'managed-cloud',
      userId: 'user-free',
      resource: { kind: 'code_session', id: 'code-free' },
      networkAccess: 'trusted',
      planTier: 'free',
      templateId: 'claude',
    });

    expect(executor).toBeNull();
    expect(create).not.toHaveBeenCalled();
    expect(buildServerProviderAdapter).not.toHaveBeenCalled();
  });

  it('lets an explicit credential on the scope win over managed resolution', async () => {
    buildServerProviderAdapter.mockImplementation(() => ({
      config: { apiKey: 'sk-managed-should-be-ignored' },
    }));

    const { getE2BExecutor } = await import('../runtime');
    await getE2BExecutor(
      codeScope('code-explicit', 'trusted', {
        templateId: 'claude',
        explicitCredential: { envVar: 'ANTHROPIC_API_KEY', value: 'sk-explicit' },
      }),
    );

    const createOptions = (create.mock.calls[0] as unknown[])[1] as {
      envs?: Record<string, string>;
    };
    expect(createOptions.envs).toEqual({ ANTHROPIC_API_KEY: 'sk-explicit' });
  });

  it('lists every provider opencode can auto-detect for a non-code-session (bare) scope, where the multi-provider proxy gap does not apply', async () => {
    buildServerProviderAdapter.mockImplementation((providerId: string) => {
      if (providerId === 'openai') return { config: { apiKey: 'sk-openai' } };
      throw new Error(`no managed key configured for ${providerId}`);
    });

    const { getE2BExecutor } = await import('../runtime');
    await getE2BExecutor({
      tenantId: 'managed-cloud',
      userId: 'user-code',
      conversationId: 'convo-opencode',
      networkAccess: 'trusted',
      planTier: 'pro',
      templateId: 'opencode',
    });

    const createOptions = (create.mock.calls[0] as unknown[])[1] as {
      envs?: Record<string, string>;
    };
    expect(createOptions.envs).toEqual({ OPENAI_API_KEY: 'sk-openai' });
  });

  it('carries the resolved credential into every sandbox command, including a resumed one', async () => {
    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor(
      codeScope('code-cmd', 'trusted', {
        templateId: 'droid',
        explicitCredential: { envVar: 'FACTORY_API_KEY', value: 'sk-explicit-factory' },
      }),
    );
    await executor!.runCommand?.({ command: 'droid -p "hi"' });

    const instance = await create.mock.results[0]!.value;
    expect(instance.commands.run).toHaveBeenCalledWith(
      'droid -p "hi"',
      expect.objectContaining({ envs: { FACTORY_API_KEY: 'sk-explicit-factory' } }),
    );
  });

  it('forwards the caller signal to the sandbox command so an abort can kill it', async () => {
    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor(codeScope('code-signal', 'trusted'));
    const controller = new AbortController();
    await executor!.runCommand?.({ command: 'ls', signal: controller.signal });

    const instance = await create.mock.results[0]!.value;
    expect(instance.commands.run).toHaveBeenCalledWith(
      'ls',
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});

describe('getE2BExecutor, provider-proxy credential injection', () => {
  beforeEach(() => {
    sessions.clear();
    vi.clearAllMocks();
    sandboxCounter = 0;
    listedSandboxes = [];
    buildServerProviderAdapter.mockImplementation(() => ({
      config: { apiKey: 'sk-managed-should-never-reach-the-sandbox' },
    }));
  });

  it('injects the proxy base URL and a minted session token instead of the managed key', async () => {
    const { getE2BExecutor } = await import('../runtime');
    const { verifyProviderProxyToken } = await import('../provider-proxy-token');
    await getE2BExecutor(codeScope('code-claude-proxy', 'trusted', { templateId: 'claude' }));

    const createOptions = (create.mock.calls[0] as unknown[])[1] as {
      envs?: Record<string, string>;
    };
    expect(createOptions.envs?.['ANTHROPIC_BASE_URL']).toBe(
      'https://app.agiworkforce.test/api/code/sessions/code-claude-proxy/provider-proxy',
    );
    const token = createOptions.envs?.['ANTHROPIC_API_KEY'];
    expect(token).toBeDefined();
    expect(token).not.toBe('sk-managed-should-never-reach-the-sandbox');
    expect(verifyProviderProxyToken(token!)).toMatchObject({
      sessionId: 'code-claude-proxy',
      userId: 'user-code',
      providerId: 'anthropic',
    });
  });

  it('proxies the harness even under full network access', async () => {
    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor(
      codeScope('code-claude-full', 'full', { templateId: 'claude' }),
    );
    expect(executor).not.toBeNull();

    const createOptions = (create.mock.calls[0] as unknown[])[1] as {
      envs?: Record<string, string>;
    };
    expect(createOptions.envs?.['ANTHROPIC_API_KEY']).not.toBe(
      'sk-managed-should-never-reach-the-sandbox',
    );
  });

  it('an explicit credential still wins over the proxy', async () => {
    const { getE2BExecutor } = await import('../runtime');
    await getE2BExecutor(
      codeScope('code-claude-explicit', 'trusted', {
        templateId: 'claude',
        explicitCredential: { envVar: 'ANTHROPIC_API_KEY', value: 'sk-explicit' },
      }),
    );

    const createOptions = (create.mock.calls[0] as unknown[])[1] as {
      envs?: Record<string, string>;
    };
    expect(createOptions.envs).toEqual({ ANTHROPIC_API_KEY: 'sk-explicit' });
  });

  it('omits the credential rather than falling back to the raw key when the proxy has no base URL', async () => {
    const savedAppUrl = process.env['NEXT_PUBLIC_APP_URL'];
    delete process.env['NEXT_PUBLIC_APP_URL'];
    try {
      const { getE2BExecutor } = await import('../runtime');
      await getE2BExecutor(codeScope('code-claude-nourl', 'trusted', { templateId: 'claude' }));

      const createOptions = (create.mock.calls[0] as unknown[])[1] as {
        envs?: Record<string, string>;
      };
      expect(createOptions.envs).toBeUndefined();
    } finally {
      if (savedAppUrl === undefined) delete process.env['NEXT_PUBLIC_APP_URL'];
      else process.env['NEXT_PUBLIC_APP_URL'] = savedAppUrl;
    }
  });
});

describe('getE2BExecutor, full network interim guard', () => {
  beforeEach(() => {
    sessions.clear();
    vi.clearAllMocks();
    sandboxCounter = 0;
    listedSandboxes = [];
  });

  it('refuses full network when a managed credential would enter the sandbox unproxied', async () => {
    buildServerProviderAdapter.mockImplementation((providerId: string) => {
      if (providerId === 'factory') return { config: { apiKey: 'sk-managed-factory' } };
      throw new Error(`no managed key configured for ${providerId}`);
    });
    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor(
      codeScope('code-full-guard', 'full', { templateId: 'droid' }),
    );
    expect(executor).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('allows full network for a harness the credential proxy covers', async () => {
    buildServerProviderAdapter.mockImplementation((providerId: string) => {
      if (providerId === 'anthropic') return { config: { apiKey: 'sk-managed-anthropic' } };
      throw new Error(`no managed key configured for ${providerId}`);
    });
    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor(
      codeScope('code-full-proxied', 'full', { templateId: 'claude' }),
    );
    expect(executor).not.toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('still allows full network for a runtime with no harness credential', async () => {
    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor(
      codeScope('code-full-image', 'full', { templateId: 'code-interpreter-v1' }),
    );
    expect(executor).not.toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('lets an explicit credential proceed under full network', async () => {
    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor(
      codeScope('code-full-explicit', 'full', {
        templateId: 'claude',
        explicitCredential: { envVar: 'ANTHROPIC_API_KEY', value: 'sk-explicit' },
      }),
    );
    expect(executor).not.toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('getE2BExecutor, egress allowlist', () => {
  beforeEach(() => {
    sessions.clear();
    vi.clearAllMocks();
    sandboxCounter = 0;
    listedSandboxes = [];
  });

  it('always allows the provider-proxy host alongside the trusted preset', async () => {
    const { getE2BExecutor } = await import('../runtime');
    await getE2BExecutor(codeScope('code-proxy-host', 'trusted'));

    const createOptions = (create.mock.calls[0] as unknown[])[0] as {
      network: { allowOut: string[] };
    };
    expect(createOptions.network.allowOut).toContain('app.agiworkforce.test');
  });

  it('allows extra hostnames on top of the trusted preset', async () => {
    const { getE2BExecutor } = await import('../runtime');
    await getE2BExecutor({
      ...codeScope('code-extra-hosts', 'trusted'),
      extraHosts: ['api.example.com', '*.internal.example.com'],
    });

    const createOptions = (create.mock.calls[0] as unknown[])[0] as {
      network: { allowOut: string[] };
    };
    expect(createOptions.network.allowOut).toEqual(
      expect.arrayContaining(['api.example.com', '*.internal.example.com', 'github.com']),
    );
  });

  it('allows only the extra hosts and the proxy host under none, nothing else', async () => {
    const { getE2BExecutor } = await import('../runtime');
    await getE2BExecutor({
      ...codeScope('code-none-extra', 'none'),
      extraHosts: ['api.example.com'],
    });

    const createOptions = (create.mock.calls[0] as unknown[])[0] as {
      network: { allowOut: string[]; denyOut: string[] };
      allowInternetAccess?: boolean;
    };
    expect(createOptions.allowInternetAccess).toBeUndefined();
    expect(createOptions.network.allowOut.sort()).toEqual(
      ['api.example.com', 'app.agiworkforce.test'].sort(),
    );
    expect(createOptions.network.denyOut).toEqual(['0.0.0.0/0']);
  });

  it('stays fully closed under none with no extra hosts configured', async () => {
    const { getE2BExecutor } = await import('../runtime');
    await getE2BExecutor(codeScope('code-none-plain', 'none'));

    const createOptions = (create.mock.calls[0] as unknown[])[0] as {
      network?: { allowOut: string[] };
      allowInternetAccess?: boolean;
    };
    expect(createOptions.allowInternetAccess).toBeUndefined();
    expect(createOptions.network?.allowOut).toEqual(['app.agiworkforce.test']);
  });

  it('persists extra hosts so a later resumed call still enforces them', async () => {
    const { getE2BExecutor } = await import('../runtime');
    await getE2BExecutor({
      ...codeScope('code-sticky-hosts', 'trusted'),
      extraHosts: ['api.example.com'],
    });

    await getE2BExecutor(codeScope('code-sticky-hosts', 'trusted'));

    const instance = await connect.mock.results[0]!.value;
    expect(instance.updateNetwork).toHaveBeenCalledWith(
      expect.objectContaining({ allowOut: expect.arrayContaining(['api.example.com']) }),
    );
  });

  it('ignores extra hosts entirely under full network access', async () => {
    const { getE2BExecutor } = await import('../runtime');
    await getE2BExecutor({
      ...codeScope('code-full-extra', 'full'),
      extraHosts: ['api.example.com'],
    });

    const createOptions = (create.mock.calls[0] as unknown[])[0] as {
      allowInternetAccess?: boolean;
      network?: unknown;
    };
    expect(createOptions.allowInternetAccess).toBe(true);
    expect(createOptions.network).toBeUndefined();
  });
});

describe('getE2BExecutor, git operations', () => {
  beforeEach(() => {
    sessions.clear();
    vi.clearAllMocks();
    sandboxCounter = 0;
    listedSandboxes = [];
  });

  it('clones through the SDK git client with the given credential', async () => {
    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor(codeScope('code-git', 'trusted'));
    const result = await executor!.git!.clone({
      url: 'https://github.com/acme/widgets.git',
      path: '/home/user/project',
      depth: 1,
      username: 'x-access-token',
      password: 'installation-token',
    });

    const instance = await create.mock.results[0]!.value;
    expect(instance.git.clone).toHaveBeenCalledWith(
      'https://github.com/acme/widgets.git',
      expect.objectContaining({
        path: '/home/user/project',
        depth: 1,
        username: 'x-access-token',
        password: 'installation-token',
      }),
    );
    expect(result).toMatchObject({ ok: true, stdout: 'cloned' });
  });

  it('stages, commits and pushes through the git client', async () => {
    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor(codeScope('code-push', 'trusted'));

    await executor!.git!.add({ path: '/home/user/project', all: true });
    await executor!.git!.commit({ path: '/home/user/project', message: 'fix things' });
    const push = await executor!.git!.push({
      path: '/home/user/project',
      username: 'x-access-token',
      password: 'installation-token',
    });

    const instance = await create.mock.results[0]!.value;
    expect(instance.git.add).toHaveBeenCalledWith(
      '/home/user/project',
      expect.objectContaining({ all: true }),
    );
    expect(instance.git.commit).toHaveBeenCalledWith(
      '/home/user/project',
      'fix things',
      expect.any(Object),
    );
    expect(instance.git.push).toHaveBeenCalledWith(
      '/home/user/project',
      expect.objectContaining({ username: 'x-access-token', password: 'installation-token' }),
    );
    expect(push).toMatchObject({ ok: true, stdout: 'pushed' });
  });

  it('reports a failed clone as a normal command failure rather than throwing', async () => {
    const broken = makeSandboxInstance('sbx-git-error');
    broken.git.clone.mockRejectedValueOnce(
      Object.assign(new Error('auth failed'), { exitCode: 128, stderr: 'auth failed' }),
    );
    create.mockResolvedValueOnce(broken);

    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor(codeScope('code-git-error', 'trusted'));
    const result = await executor!.git!.clone({
      url: 'https://github.com/acme/private.git',
      path: '/home/user/project',
    });

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(128);
  });
});

describe('getE2BExecutor, per-user sandbox quota', () => {
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

  it('frees the coldest paused slot rather than refusing the turn', async () => {
    listedSandboxes = [
      ...liveSandboxesFor('user-evict', 3, 'running'),
      {
        metadata: { userId: 'user-evict', conversationId: 'conv-cold' },
        sandboxId: 'sbx-cold',
        startedAt: new Date(1),
        state: 'paused',
      },
      {
        metadata: { userId: 'user-evict', conversationId: 'conv-warm' },
        sandboxId: 'sbx-warm',
        startedAt: new Date(90_000),
        state: 'paused',
      },
    ];

    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor(scope('conv-new', 'user-evict'));

    expect(staticKill).toHaveBeenCalledWith('sbx-cold');
    expect(staticKill).not.toHaveBeenCalledWith('sbx-warm');
    expect(executor).not.toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('still refuses when every slot is held by a running sandbox', async () => {
    listedSandboxes = liveSandboxesFor('user-busy', 5, 'running');

    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor(scope('conv-busy', 'user-busy'));

    expect(staticKill).not.toHaveBeenCalled();
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

  it('meters with the vCPU count resolved from the sandbox session, not the caller scope', async () => {
    templateVcpuCount.mockResolvedValueOnce(4);
    sessions.set(scopeKey(scope('conv-vcpu')), {
      sandboxId: 'sbx-vcpu',
      contexts: {},
      activeSinceMs: Date.now() - 60_000,
      templateId: 'claude',
    });

    const { killE2BSession } = await import('../runtime');
    await killE2BSession(scope('conv-vcpu'));

    expect(templateVcpuCount).toHaveBeenCalledWith('claude');
    expect(meterSandboxComputeInterval).toHaveBeenCalledWith(
      expect.objectContaining({ sandboxId: 'sbx-vcpu', vcpuCount: 4 }),
    );
  });
});

describe('getE2BExecutor, notebook cell outputs', () => {
  beforeEach(() => {
    sessions.clear();
    vi.clearAllMocks();
    sandboxCounter = 0;
  });

  it('orders stream, image, html and text results the way the sandbox produced them', async () => {
    const instance = makeSandboxInstance('sbx-outputs');
    instance.runCode.mockResolvedValueOnce({
      logs: { stdout: ['hello\n'], stderr: [] },
      text: undefined,
      error: undefined,
      results: [{ png: 'ZmFrZS1wbmc=' }, { html: '<table></table>' }, { text: 'plain result' }],
    } as unknown as Awaited<ReturnType<typeof instance.runCode>>);
    create.mockResolvedValueOnce(instance);

    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor();
    const result = await executor!.runCode({ language: 'python', code: 'go()' });

    expect(result.outputs).toEqual([
      { kind: 'stream', data: 'hello\n' },
      { kind: 'image', data: 'ZmFrZS1wbmc=' },
      { kind: 'html', data: '<table></table>' },
      { kind: 'stream', data: 'plain result' },
    ]);
    expect(result.pngResults).toEqual(['ZmFrZS1wbmc=']);
  });

  it('appends the traceback as the final error output and marks the cell failed', async () => {
    const instance = makeSandboxInstance('sbx-error');
    instance.runCode.mockResolvedValueOnce({
      logs: { stdout: [], stderr: [] },
      text: undefined,
      error: { name: 'NameError', value: 'x is not defined', traceback: 'Traceback...' },
      results: [],
    } as unknown as Awaited<ReturnType<typeof instance.runCode>>);
    create.mockResolvedValueOnce(instance);

    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor();
    const result = await executor!.runCode({ language: 'python', code: 'print(x)' });

    expect(result.ok).toBe(false);
    expect(result.outputs).toEqual([
      { kind: 'error', data: 'NameError: x is not defined\nTraceback...' },
    ]);
  });

  it('decodes base64 content into bytes before writing to the sandbox', async () => {
    const instance = makeSandboxInstance('sbx-write');
    create.mockResolvedValueOnce(instance);
    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor();
    const content = Buffer.from('hello').toString('base64');

    await executor!.writeFile({ path: '/home/user/hi.txt', content, encoding: 'base64' });

    expect(instance.files.write).toHaveBeenCalledTimes(1);
    const [writtenPath, writtenData] = instance.files.write.mock.calls[0] as [string, ArrayBuffer];
    expect(writtenPath).toBe('/home/user/hi.txt');
    expect(Buffer.from(writtenData).toString('utf8')).toBe('hello');
  });
});
