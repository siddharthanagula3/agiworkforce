import { beforeEach, describe, expect, it, vi } from 'vitest';

type LoggerModule = typeof import('@/lib/logger');
type GateModule = typeof import('../gate');
type ComputeMeteringModule = typeof import('../compute-metering');
type EffectiveSubscriptionServiceModule =
  typeof import('@/lib/services/effective-subscription-service');
type ProviderAdapterServiceModule = typeof import('@/lib/services/provider-adapter-service');
type SessionStoreModule = typeof import('../session-store');
type TemplatesModule = typeof import('../templates');

process.env['CSRF_SECRET'] ||= 'a'.repeat(40);
process.env['NEXT_PUBLIC_APP_URL'] ||= 'https://app.agiworkforce.test';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('../gate', async (importOriginal) => ({
  ...(await importOriginal<GateModule>()),
  e2bExecutionEnabled: vi.fn(() => true),
}));
vi.mock('../templates', async (importOriginal) => ({
  ...(await importOriginal<TemplatesModule>()),
  templateComputeShape: async () => ({ vcpuCount: null, memoryGib: null }),
}));

const RESERVATION = {
  idempotencyKey: 'agi.e2b.compute.res-1',
  requestHash: 'hash-1',
  leaseToken: 'lease-1',
  estimatedCostMicrousd: 1_000_000,
  provider: 'e2b',
  model: 'e2b',
};
vi.mock('../compute-metering', async (importOriginal) => ({
  ...(await importOriginal<ComputeMeteringModule>()),
  markSandboxComputeStarted: vi.fn(async () => {}),
  meterSandboxComputeInterval: vi.fn(async () => 0),
  sandboxComputeIsPriceable: () => true,
  getSandboxComputeMicrousdPerSecond: () => 46,
  reserveSandboxComputeInterval: vi.fn(async (input: unknown) => ({
    outcome: 'reserved' as const,
    ttlMs: (input as { ttlMs: number }).ttlMs,
    reservation: RESERVATION,
  })),
  releaseSandboxComputeReservation: vi.fn(async () => {}),
}));
vi.mock('@/lib/services/effective-subscription-service', async (importOriginal) => ({
  ...(await importOriginal<EffectiveSubscriptionServiceModule>()),
  resolveEntitlementBundle: async () => ({ entitled: true, subscription: { plan_tier: 'pro' } }),
}));
vi.mock('@/lib/services/provider-adapter-service', async (importOriginal) => ({
  ...(await importOriginal<ProviderAdapterServiceModule>()),
  buildServerProviderAdapter: () => {
    throw new Error('no managed key configured');
  },
}));

interface Scope {
  tenantId: string;
  userId: string;
  conversationId: string;
  planTier: string;
}

function scope(conversationId: string): Scope {
  return { tenantId: 'managed-cloud', userId: 'user-1', conversationId, planTier: 'pro' };
}

const scopeKey = (value: Scope) => `${value.tenantId}:${value.userId}:${value.conversationId}`;

const sessions = new Map<string, Record<string, unknown>>();
vi.mock('../session-store', async (importOriginal) => ({
  ...(await importOriginal<SessionStoreModule>()),
  getE2BSession: vi.fn(async (value: Scope) => sessions.get(scopeKey(value)) ?? null),
  saveE2BSession: vi.fn(async (value: Scope, session: Record<string, unknown>) => {
    sessions.set(scopeKey(value), session);
  }),
  deleteE2BSession: vi.fn(async (value: Scope) => {
    sessions.delete(scopeKey(value));
  }),
  withUserSandboxLock: vi.fn(async (_scope: Scope, critical: () => Promise<unknown>) => ({
    locked: true,
    result: await critical(),
  })),
}));

class TemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateError';
  }
}

const filesWrite = vi.fn();
const filesRemove = vi.fn();
let sandboxCounter = 0;
function makeSandbox(sandboxId: string) {
  return {
    sandboxId,
    createCodeContext: vi.fn(async ({ language }: { language: string }) => ({
      id: `ctx-${sandboxId}-${language}`,
      language,
      cwd: '/home/user',
    })),
    files: { write: filesWrite, remove: filesRemove, makeDir: vi.fn() },
    commands: { run: vi.fn(), list: vi.fn(async () => []), kill: vi.fn() },
    updateNetwork: vi.fn(async () => undefined),
    kill: vi.fn(async () => true),
  };
}
const create = vi.fn(async () => {
  sandboxCounter += 1;
  return makeSandbox(`sbx-${sandboxCounter}`);
});
const connect = vi.fn(async (sandboxId: string) => makeSandbox(sandboxId));
vi.mock('@e2b/code-interpreter', () => ({
  Sandbox: {
    create,
    connect,
    kill: vi.fn(async () => true),
    pause: vi.fn(async () => true),
    getInfo: vi.fn(async () => ({ state: 'running' })),
    list: vi.fn(() => ({ hasNext: false, nextItems: async () => [] })),
  },
}));

function streamOf(...chunks: number[][]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk));
      controller.close();
    },
  });
}

describe('the sandbox executor streams a file into the workspace', () => {
  beforeEach(() => {
    sessions.clear();
    sandboxCounter = 0;
    vi.clearAllMocks();
    filesWrite.mockReset();
    filesRemove.mockReset();
  });

  it('passes the stream itself to the sandbox without reading it', async () => {
    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor(scope('conv-stream'));
    const content = streamOf([1, 2], [3]);
    const turn = new AbortController();

    const result = await executor!.writeFileStream!({
      path: '/home/user/big.bin',
      content,
      signal: turn.signal,
    });

    expect(result).toEqual({ ok: true, output: 'Wrote /home/user/big.bin' });
    expect(filesWrite).toHaveBeenCalledTimes(1);
    expect(filesWrite).toHaveBeenCalledWith('/home/user/big.bin', content, {
      signal: turn.signal,
    });
    expect(content.locked).toBe(false);
  });

  it('hands the sandbox the caller signal so a stalled upload can be ended', async () => {
    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor(scope('conv-signal'));
    const content = streamOf([1]);
    const turn = new AbortController();

    await executor!.writeFileStream!({ path: '/home/user/big.bin', content, signal: turn.signal });

    expect(filesWrite).toHaveBeenCalledWith('/home/user/big.bin', content, {
      signal: turn.signal,
    });
  });

  it('removes a file from the workspace and answers a failed removal as a failure', async () => {
    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor(scope('conv-remove'));
    filesRemove.mockResolvedValueOnce(undefined);
    filesRemove.mockRejectedValueOnce(new Error('not found'));

    const removed = await executor!.removeFile!('/home/user/big.bin');
    const missing = await executor!.removeFile!('/home/user/gone.bin');

    expect(filesRemove).toHaveBeenNthCalledWith(1, '/home/user/big.bin');
    expect(removed).toEqual({ ok: true, output: 'Removed /home/user/big.bin' });
    expect(missing).toEqual({ ok: false, output: '', error: 'not found' });
  });

  it('bounds a removal by the caller deadline', async () => {
    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor(scope('conv-remove-bound'));
    filesRemove.mockResolvedValueOnce(undefined);

    await executor!.removeFile!('/home/user/big.bin', { requestTimeoutMs: 4_000 });

    expect(filesRemove).toHaveBeenCalledWith('/home/user/big.bin', { requestTimeoutMs: 4_000 });
  });

  it('answers an old sandbox image as unavailable, not as a failed copy', async () => {
    filesWrite.mockRejectedValueOnce(
      new TemplateError('Uploading stream data requires envd 0.5.7'),
    );
    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor(scope('conv-old-image'));

    const result = await executor!.writeFileStream!({
      path: '/home/user/big.bin',
      content: streamOf([1]),
      signal: new AbortController().signal,
    });

    expect(result).toMatchObject({ ok: false, unavailable: true });
  });

  it('answers any other upload error as a failed write', async () => {
    filesWrite.mockRejectedValueOnce(new Error('connection reset'));
    const { getE2BExecutor } = await import('../runtime');
    const executor = await getE2BExecutor(scope('conv-reset'));

    const result = await executor!.writeFileStream!({
      path: '/home/user/big.bin',
      content: streamOf([1]),
      signal: new AbortController().signal,
    });

    expect(result).toEqual({ ok: false, output: '', error: 'connection reset' });
  });

  it('remembers staged files for the conversation sandbox and loads them on the next turn', async () => {
    const { getE2BExecutor } = await import('../runtime');
    const first = await getE2BExecutor(scope('conv-memory'));
    await first!.storageStaging!.save({ 'asset-1': { path: '/home/user/big.csv', byteSize: 40 } });
    await first!.dispose();

    expect(sessions.get(scopeKey(scope('conv-memory')))).toMatchObject({
      stagedStorage: { 'asset-1': { path: '/home/user/big.csv', byteSize: 40 } },
    });

    const second = await getE2BExecutor(scope('conv-memory'));
    expect(connect).toHaveBeenCalledTimes(1);
    await expect(second!.storageStaging!.load()).resolves.toEqual({
      'asset-1': { path: '/home/user/big.csv', byteSize: 40 },
    });
  });

  it('forgets staged files when the sandbox had to be replaced', async () => {
    sessions.set(scopeKey(scope('conv-replaced')), {
      sandboxId: 'sbx-gone',
      contexts: {},
      stagedStorage: { 'asset-1': { path: '/home/user/big.csv', byteSize: 40 } },
    });
    connect.mockRejectedValueOnce(new Error('sandbox not found'));
    const { getE2BExecutor } = await import('../runtime');

    const executor = await getE2BExecutor(scope('conv-replaced'));

    await expect(executor!.storageStaging!.load()).resolves.toEqual({});
    expect(sessions.get(scopeKey(scope('conv-replaced')))).not.toHaveProperty('stagedStorage');
  });

  it('keeps a file another executor staged for the same sandbox when this one saves', async () => {
    const { getE2BExecutor } = await import('../runtime');
    const early = await getE2BExecutor(scope('conv-two'));
    const later = await getE2BExecutor(scope('conv-two'));
    await later!.storageStaging!.save({ 'asset-b': { path: '/home/user/b.csv', byteSize: 9 } });

    await early!.storageStaging!.save({ 'asset-a': { path: '/home/user/a.csv', byteSize: 5 } });
    await early!.dispose();

    expect(sessions.get(scopeKey(scope('conv-two')))).toMatchObject({
      stagedStorage: {
        'asset-a': { path: '/home/user/a.csv', byteSize: 5 },
        'asset-b': { path: '/home/user/b.csv', byteSize: 9 },
      },
    });
  });

  it('keeps a staged file when an executor that never staged persists last', async () => {
    const { getE2BExecutor } = await import('../runtime');
    const early = await getE2BExecutor(scope('conv-idle'));
    const later = await getE2BExecutor(scope('conv-idle'));
    await later!.storageStaging!.save({ 'asset-b': { path: '/home/user/b.csv', byteSize: 9 } });

    await early!.dispose();

    expect(sessions.get(scopeKey(scope('conv-idle')))).toMatchObject({
      stagedStorage: { 'asset-b': { path: '/home/user/b.csv', byteSize: 9 } },
    });
  });

  it('does not bring back an entry the saving executor was told to forget', async () => {
    const { getE2BExecutor } = await import('../runtime');
    const first = await getE2BExecutor(scope('conv-forget'));
    await first!.storageStaging!.save({ 'asset-a': { path: '/home/user/a.csv', byteSize: 5 } });
    const second = await getE2BExecutor(scope('conv-forget'));

    await second!.storageStaging!.save({}, ['asset-a']);
    await second!.dispose();

    expect(sessions.get(scopeKey(scope('conv-forget')))).not.toHaveProperty('stagedStorage');
  });

  it('keeps a file another executor staged after this one forgot it', async () => {
    const { getE2BExecutor } = await import('../runtime');
    const first = await getE2BExecutor(scope('conv-restaged'));
    await first!.storageStaging!.save({ 'asset-a': { path: '/home/user/a.csv', byteSize: 5 } });
    const forgetting = await getE2BExecutor(scope('conv-restaged'));
    const restaging = await getE2BExecutor(scope('conv-restaged'));

    await forgetting!.storageStaging!.save({}, ['asset-a']);
    await restaging!.storageStaging!.save({ 'asset-a': { path: '/home/user/a.csv', byteSize: 5 } });
    await forgetting!.dispose();

    expect(sessions.get(scopeKey(scope('conv-restaged')))).toMatchObject({
      stagedStorage: { 'asset-a': { path: '/home/user/a.csv', byteSize: 5 } },
    });
  });

  it('starts a stage from what another executor already saved', async () => {
    const { getE2BExecutor } = await import('../runtime');
    const first = await getE2BExecutor(scope('conv-load-stored'));
    const second = await getE2BExecutor(scope('conv-load-stored'));

    await second!.storageStaging!.save({ 'asset-b': { path: '/home/user/b.csv', byteSize: 9 } });

    expect(await first!.storageStaging!.load()).toEqual({
      'asset-b': { path: '/home/user/b.csv', byteSize: 9 },
    });
  });
});
