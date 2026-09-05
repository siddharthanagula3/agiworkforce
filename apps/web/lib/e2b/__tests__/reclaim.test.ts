import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('../gate', () => ({ e2bExecutionEnabled: vi.fn(() => true) }));

const meterSandboxComputeInterval = vi.fn(async (_interval: unknown) => 5);
vi.mock('../compute-metering', () => ({
  meterSandboxComputeInterval: (interval: unknown) => meterSandboxComputeInterval(interval),
}));

const templateVcpuCount = vi.fn(async (_templateId: unknown): Promise<number | null> => null);
vi.mock('../templates', () => ({
  templateVcpuCount: (templateId: unknown) => templateVcpuCount(templateId),
}));

interface FakeSession {
  sandboxId: string;
  activeSinceMs?: number;
  templateId?: string;
}

const sessions = new Map<string, FakeSession>();
const getE2BSession = vi.fn(
  async (scope: { userId: string; resource?: { id: string } }) =>
    sessions.get(scope.resource?.id ?? scope.userId) ?? null,
);
const deleteE2BSession = vi.fn(async (_scope?: unknown) => {});
vi.mock('../session-store', () => ({
  MANAGED_CLOUD_E2B_TENANT_ID: 'managed-cloud',
  getE2BSession: (scope: unknown) =>
    getE2BSession(scope as { userId: string; resource?: { id: string } }),
  deleteE2BSession: (scope: unknown) => deleteE2BSession(scope),
}));

const kill = vi.fn(async () => true);
let listedSandboxes: Array<{
  sandboxId: string;
  startedAt: Date;
  metadata: Record<string, string>;
  state?: 'running' | 'paused';
}> = [];
const list = vi.fn(() => {
  let served = false;
  return {
    get hasNext() {
      return !served;
    },
    nextItems: vi.fn(async () => {
      if (served) return [];
      served = true;
      return listedSandboxes;
    }),
  };
});

vi.mock('@e2b/code-interpreter', () => ({ Sandbox: { kill, list } }));

beforeEach(() => {
  vi.clearAllMocks();
  sessions.clear();
  listedSandboxes = [];
  meterSandboxComputeInterval.mockResolvedValue(5);
  templateVcpuCount.mockResolvedValue(null);
  getE2BSession.mockImplementation(
    async (scope: { userId: string; resource?: { id: string } }) =>
      sessions.get(scope.resource?.id ?? scope.userId) ?? null,
  );
});

describe('reclaimAbandonedE2BSandboxes', () => {
  it('kills an aged code-session sandbox and meters its open interval using the template vCPU count', async () => {
    sessions.set('code-1', { sandboxId: 'sbx-1', activeSinceMs: 0, templateId: 'claude' });
    templateVcpuCount.mockResolvedValue(4);
    listedSandboxes = [
      {
        sandboxId: 'sbx-1',
        startedAt: new Date(0),
        metadata: { userId: 'user-1', codeSessionId: 'code-1' },
      },
    ];

    const { reclaimAbandonedE2BSandboxes, SANDBOX_MAX_AGE_MS } = await import('../reclaim');
    const report = await reclaimAbandonedE2BSandboxes({
      now: new Date(SANDBOX_MAX_AGE_MS + 1),
    });

    expect(report.reclaimed).toBe(1);
    expect(kill).toHaveBeenCalledWith('sbx-1');
    expect(templateVcpuCount).toHaveBeenCalledWith('claude');
    expect(meterSandboxComputeInterval).toHaveBeenCalledWith(
      expect.objectContaining({ vcpuCount: 4, sandboxId: 'sbx-1', codeSessionId: 'code-1' }),
    );
    expect(deleteE2BSession).toHaveBeenCalledTimes(1);
  });

  it('retains a sandbox that is neither expired nor orphaned', async () => {
    sessions.set('code-2', { sandboxId: 'sbx-2', activeSinceMs: 0 });
    listedSandboxes = [
      {
        sandboxId: 'sbx-2',
        startedAt: new Date(0),
        metadata: { userId: 'user-1', codeSessionId: 'code-2' },
      },
    ];

    const { reclaimAbandonedE2BSandboxes } = await import('../reclaim');
    const report = await reclaimAbandonedE2BSandboxes({ maxAgeMs: 60_000, now: new Date(1_000) });

    expect(report.retained).toBe(1);
    expect(kill).not.toHaveBeenCalled();
  });

  it('reclaims an orphan whose mapping already moved to a different sandbox, without metering it', async () => {
    sessions.set('code-3', { sandboxId: 'sbx-current' });
    listedSandboxes = [
      {
        sandboxId: 'sbx-orphan',
        startedAt: new Date(0),
        metadata: { userId: 'user-1', codeSessionId: 'code-3' },
      },
    ];

    const { reclaimAbandonedE2BSandboxes } = await import('../reclaim');
    const report = await reclaimAbandonedE2BSandboxes({ maxAgeMs: 60_000, now: new Date(1_000) });

    expect(report.reclaimed).toBe(1);
    expect(kill).toHaveBeenCalledWith('sbx-orphan');
    expect(meterSandboxComputeInterval).not.toHaveBeenCalled();
    expect(deleteE2BSession).not.toHaveBeenCalled();
  });

  it('is skipped when E2B execution is not enabled', async () => {
    const { e2bExecutionEnabled } = await import('../gate');
    vi.mocked(e2bExecutionEnabled).mockReturnValueOnce(false);

    const { reclaimAbandonedE2BSandboxes } = await import('../reclaim');
    const report = await reclaimAbandonedE2BSandboxes();

    expect(report.skipped).toBe(true);
    expect(list).not.toHaveBeenCalled();
  });
});

describe('paused sandboxes give up their slot sooner', () => {
  const HOUR_MS = 60 * 60 * 1000;

  it('reclaims a paused sandbox past the paused window a running one would keep', async () => {
    const now = new Date(20 * HOUR_MS);
    listedSandboxes = [
      {
        sandboxId: 'sbx-paused',
        startedAt: new Date(now.getTime() - 3 * HOUR_MS),
        metadata: { userId: 'user-1', codeSessionId: 'cs-1' },
        state: 'paused',
      },
      {
        sandboxId: 'sbx-running',
        startedAt: new Date(now.getTime() - 3 * HOUR_MS),
        metadata: { userId: 'user-1', codeSessionId: 'cs-2' },
        state: 'running',
      },
    ];
    sessions.set('cs-1', { sandboxId: 'sbx-paused' });
    sessions.set('cs-2', { sandboxId: 'sbx-running' });

    const { reclaimAbandonedE2BSandboxes } = await import('../reclaim');
    const report = await reclaimAbandonedE2BSandboxes({ now });

    expect(report.reclaimed).toBe(1);
    expect(report.retained).toBe(1);
    expect(kill).toHaveBeenCalledWith('sbx-paused');
    expect(kill).not.toHaveBeenCalledWith('sbx-running');
  });

  it('keeps a paused sandbox that is still inside the paused window', async () => {
    const now = new Date(20 * HOUR_MS);
    listedSandboxes = [
      {
        sandboxId: 'sbx-warm',
        startedAt: new Date(now.getTime() - 10 * 60 * 1000),
        metadata: { userId: 'user-1', codeSessionId: 'cs-1' },
        state: 'paused',
      },
    ];
    sessions.set('cs-1', { sandboxId: 'sbx-warm' });

    const { reclaimAbandonedE2BSandboxes } = await import('../reclaim');
    const report = await reclaimAbandonedE2BSandboxes({ now });

    expect(report.reclaimed).toBe(0);
    expect(report.retained).toBe(1);
    expect(kill).not.toHaveBeenCalled();
  });
});
