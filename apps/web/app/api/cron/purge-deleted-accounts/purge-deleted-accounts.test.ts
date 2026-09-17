import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyCronRequest: vi.fn(),
  query: vi.fn(),
  enqueueJob: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/cron-auth', () => ({ verifyCronRequest: mocks.verifyCronRequest }));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: (...args: unknown[]) => mocks.query(...args) }),
}));
vi.mock('@/lib/jobs/job-service', () => ({ enqueueJob: mocks.enqueueJob }));

import { GET } from './route';

interface Fixture {
  due?: Array<{ id: string; deletion_scheduled_for: string | null }>;
  tombstones?: Array<{ user_id: string; profile_present: boolean }>;
}

function primeDb(fixture: Fixture = {}): void {
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes('deletion_scheduled_for <= now()')) {
      if (sql.includes('erasure_tombstones') && fixture.tombstones === undefined) {
        throw Object.assign(new Error('relation does not exist'), { code: '42P01' });
      }
      if (fixture.due === undefined) {
        throw Object.assign(new Error('column does not exist'), { code: '42703' });
      }
      return fixture.due;
    }
    if (sql.includes('erasure_tombstones')) {
      if (fixture.tombstones === undefined) {
        throw Object.assign(new Error('relation does not exist'), { code: '42P01' });
      }
      return fixture.tombstones;
    }
    return [];
  });
}

function cronRequest() {
  return new Request('https://agiworkforce.com/api/cron/purge-deleted-accounts') as never;
}

function queuedJobs(): Array<Record<string, unknown>> {
  return mocks.enqueueJob.mock.calls.map((call) => call[1] as Record<string, unknown>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyCronRequest.mockReturnValue(true);
  mocks.enqueueJob.mockResolvedValue({ id: 'job-1', status: 'queued', created: true });
});

describe('GET /api/cron/purge-deleted-accounts', () => {
  it('401s and queues NOTHING without cron authorization', async () => {
    mocks.verifyCronRequest.mockReturnValue(false);
    primeDb({ due: [{ id: 'user-1', deletion_scheduled_for: null }], tombstones: [] });

    const response = await GET(cronRequest());

    expect(response.status).toBe(401);
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
  });

  it('queues one erasure job per due account, keyed to the deletion it answers', async () => {
    primeDb({
      due: [{ id: 'user-1', deletion_scheduled_for: '2026-09-01T00:00:00.000Z' }],
      tombstones: [],
    });

    const response = await GET(cronRequest());

    await expect(response.json()).resolves.toMatchObject({ candidates: 1, queued: 1, failed: 0 });
    expect(queuedJobs()[0]).toMatchObject({
      kind: 'data-deletion.scheduled-account-erasure',
      idempotencyKey: 'account-erasure:user-1:2026-09-01T00:00:00.000Z',
      payload: { subjectUserId: 'user-1', mode: 'scheduled' },
    });
  });

  it('does not queue a second job for a deletion already queued', async () => {
    primeDb({
      due: [{ id: 'user-1', deletion_scheduled_for: '2026-09-01T00:00:00.000Z' }],
      tombstones: [],
    });
    mocks.enqueueJob.mockResolvedValue({ id: 'job-1', status: 'queued', created: false });

    const response = await GET(cronRequest());

    await expect(response.json()).resolves.toMatchObject({ queued: 0, alreadyQueued: 1 });
  });

  it('queues a re-erasure for a resurrected tombstoned subject', async () => {
    primeDb({ due: [], tombstones: [{ user_id: 'ghost-1', profile_present: true }] });

    const response = await GET(cronRequest());

    await expect(response.json()).resolves.toMatchObject({
      resurrected: 1,
      resweepsQueued: 1,
    });
    expect(queuedJobs()[0]).toMatchObject({
      payload: { subjectUserId: 'ghost-1', mode: 'resweep' },
    });
  });

  it('does not queue the same subject twice in one run', async () => {
    primeDb({
      due: [{ id: 'user-1', deletion_scheduled_for: '2026-09-01T00:00:00.000Z' }],
      tombstones: [{ user_id: 'user-1', profile_present: true }],
    });

    await GET(cronRequest());

    expect(queuedJobs()).toHaveLength(1);
    expect(queuedJobs()[0]).toMatchObject({ payload: { mode: 'scheduled' } });
  });

  it('queues resurrections first, then unfinished erasures, then a round-robin re-sweep', async () => {
    primeDb({ due: [], tombstones: [] });

    await GET(cronRequest());

    const sweep = mocks.query.mock.calls
      .map((call) => String(call[0]))
      .find((sql) => sql.includes('from public.erasure_tombstones as tombstone'))!;
    expect(sweep).toContain('profile.id is not null');
    expect(sweep).toContain('tombstone.erased_at is null');
    expect(sweep).toContain("tombstone.last_swept_at < now() - interval '30 days'");
    expect(sweep).toContain('order by (profile.id is not null) desc');
    expect(sweep).toContain('(tombstone.erased_at is null) desc');
    expect(sweep).toContain('limit 5');
  });

  it('rotates the due queue by last attempt so a poison account cannot hold the head', async () => {
    primeDb({ due: [], tombstones: [] });

    await GET(cronRequest());

    const dueQuery = mocks.query.mock.calls
      .map((call) => String(call[0]))
      .find((sql) => sql.includes('deletion_scheduled_for <= now()'))!;
    expect(dueQuery).toContain('left join public.erasure_tombstones as tombstone');
    expect(dueQuery).toContain('order by tombstone.last_swept_at asc nulls first');
  });

  it('falls back to schedule order when the tombstone table is absent', async () => {
    primeDb({ due: [{ id: 'user-1', deletion_scheduled_for: null }] });

    const response = await GET(cronRequest());

    await expect(response.json()).resolves.toMatchObject({ queued: 1, sweepAvailable: false });
    const dueQueries = mocks.query.mock.calls
      .map((call) => String(call[0]))
      .filter((sql) => sql.includes('deletion_scheduled_for <= now()'));
    expect(dueQueries).toHaveLength(2);
    expect(dueQueries[1]).not.toContain('erasure_tombstones');
  });

  it('sweeps the suppression list even where the deletion columns were never provisioned', async () => {
    primeDb({ tombstones: [{ user_id: 'ghost-1', profile_present: true }] });

    const response = await GET(cronRequest());

    await expect(response.json()).resolves.toMatchObject({
      message: 'Account deletion columns are not provisioned',
      resurrected: 1,
      resweepsQueued: 1,
    });
  });

  it('reports an account whose job could not be queued without failing the sweep', async () => {
    primeDb({
      due: [
        { id: 'user-1', deletion_scheduled_for: null },
        { id: 'user-2', deletion_scheduled_for: null },
      ],
      tombstones: [],
    });
    mocks.enqueueJob
      .mockRejectedValueOnce(new Error('queue unavailable'))
      .mockResolvedValueOnce({ id: 'job-2', status: 'queued', created: true });

    const response = await GET(cronRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ failed: 1, queued: 1 });
  });
});
