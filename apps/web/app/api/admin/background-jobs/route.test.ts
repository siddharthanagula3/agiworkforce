import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  requireCsrfToken: vi.fn(),
  requirePlatformAdmin: vi.fn(),
  readJobQueueStats: vi.fn(),
  listDeadJobs: vi.fn(),
  retryDeadJob: vi.fn(),
  recordAuditEvent: vi.fn(),
  query: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/auth-guards', () => ({ requirePlatformAdmin: mocks.requirePlatformAdmin }));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/security-audit')>()),
  recordAuditEvent: mocks.recordAuditEvent,
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: mocks.query, transaction: mocks.transaction }),
}));
vi.mock('@/lib/jobs/job-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/jobs/job-service')>();
  return {
    ...actual,
    readJobQueueStats: mocks.readJobQueueStats,
    listDeadJobs: mocks.listDeadJobs,
    retryDeadJob: mocks.retryDeadJob,
  };
});

import { NextRequest } from 'next/server';
import { GET, POST } from './route';

const JOB_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ORG_ID = '33333333-3333-4333-8333-333333333333';
const GRANT_ID = '44444444-4444-4444-8444-444444444444';

function deadJob(id: string, organizationId: string | null) {
  return {
    id,
    queue: 'event-triggers',
    kind: 'event-triggers.fire',
    organizationId,
    userId: 'user-1',
    payload: { event: { data: { body: 'the customer wrote this' } } },
    lastError: 'provider said: the customer wrote this',
    deadReason: 'gave up',
    attempts: 6,
  };
}

function liveGrantRow(organizationId: string) {
  return {
    id: GRANT_ID,
    organization_id: organizationId,
    requested_by_user_id: 'admin-1',
    approved_by_user_id: 'admin-2',
    revoked_by_user_id: null,
    reason: 'Investigating a stuck trigger the workspace reported on ticket OPS-4',
    ticket_ref: 'OPS-4',
    scopes: ['background_jobs'],
    status: 'approved',
    requested_at: '2026-09-20T00:00:00.000Z',
    decided_at: '2026-09-20T00:01:00.000Z',
    expires_at: '2026-09-20T01:00:00.000Z',
    revoked_at: null,
  };
}

function request(body?: unknown, search = '') {
  return new NextRequest(`https://agiworkforce.com/api/admin/background-jobs${search}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.requirePlatformAdmin.mockResolvedValue({ userId: 'admin-1' });
  mocks.readJobQueueStats.mockResolvedValue([
    { queue: 'email', queued: 1, running: 0, dead: 2, maxConcurrency: 5, oldestQueuedAt: null },
  ]);
  mocks.listDeadJobs.mockResolvedValue([deadJob(JOB_ID, ORG_ID)]);
  mocks.retryDeadJob.mockResolvedValue(true);
  mocks.query.mockResolvedValue([]);
  mocks.transaction.mockImplementation(
    async (run: (tx: unknown) => Promise<unknown>) =>
      await run({ query: mocks.query, execute: vi.fn(async () => 1) }),
  );
});

describe('GET /api/admin/background-jobs', () => {
  it('reads nothing when the caller is not a platform admin', async () => {
    mocks.requirePlatformAdmin.mockRejectedValue(new Error('not an admin'));

    const response = await GET(request());

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(mocks.listDeadJobs).not.toHaveBeenCalled();
    expect(mocks.readJobQueueStats).not.toHaveBeenCalled();
  });

  it('answers with the queue depths and the dead letters', async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toMatchObject({
      queues: [{ queue: 'email', dead: 2 }],
      dead: [{ id: JOB_ID }],
    });
  });

  it('refuses a queue filter that names no queue', async () => {
    const response = await GET(request(undefined, '?queue=made-up'));

    expect(response.status).toBe(400);
  });

  it('holds back the payload and the provider error of a workspace it has no grant over', async () => {
    const body = await (await GET(request())).json();

    expect(body.dead[0].payload).toEqual({});
    expect(body.dead[0].lastError).toBe('redacted');
    expect(body.dead[0].deadReason).toBe('gave up');
    expect(body.dead[0].attempts).toBe(6);
    expect(body.redacted).toBe(1);
    expect(JSON.stringify(body)).not.toContain('the customer wrote this');
  });

  it('holds back a job that belongs to no workspace, because no grant can cover one', async () => {
    mocks.listDeadJobs.mockResolvedValue([deadJob(JOB_ID, null)]);
    mocks.query.mockResolvedValue([liveGrantRow(ORG_ID)]);

    const body = await (await GET(request())).json();

    expect(body.dead[0].payload).toEqual({});
    expect(body.redacted).toBe(1);
  });

  it('serves the payload of the one workspace a live grant covers and holds the rest back', async () => {
    mocks.listDeadJobs.mockResolvedValue([
      deadJob(JOB_ID, ORG_ID),
      deadJob('55555555-5555-4555-8555-555555555555', OTHER_ORG_ID),
    ]);
    mocks.query.mockResolvedValue([liveGrantRow(ORG_ID)]);

    const body = await (await GET(request())).json();

    expect(body.dead[0].payload).toMatchObject({
      event: { data: { body: 'the customer wrote this' } },
    });
    expect(body.dead[1].payload).toEqual({});
    expect(body.redacted).toBe(1);
  });

  it('asks only for grants this operator holds, in this scope, over these workspaces', async () => {
    mocks.query.mockResolvedValue([liveGrantRow(ORG_ID)]);

    await GET(request());

    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('support_access_grants');
    expect(sql).toContain("status = 'approved'");
    expect(sql).toContain('expires_at > now()');
    expect(params).toEqual(['admin-1', 'background_jobs', [ORG_ID]]);
  });

  it('appends the served workspace to its own break-glass trail under the grant', async () => {
    mocks.query.mockResolvedValue([liveGrantRow(ORG_ID)]);

    await GET(request());

    const inserted = mocks.transaction.mock.calls.length;
    expect(inserted).toBeGreaterThan(0);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'data_accessed',
        userId: 'admin-1',
        detail: expect.objectContaining({ status: 'content_served', scope: 'background_jobs' }),
      }),
    );
  });

  it('records a metadata-only read when no grant covers anything in the page', async () => {
    await GET(request());

    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({ status: 'metadata_only', held: 1 }),
      }),
    );
  });
});

describe('POST /api/admin/background-jobs', () => {
  it('requires a CSRF token before it requeues anything', async () => {
    mocks.requireCsrfToken.mockResolvedValue(
      new Response(JSON.stringify({ error: 'csrf' }), { status: 403 }),
    );

    expect((await POST(request({ jobId: JOB_ID }))).status).toBe(403);
    expect(mocks.retryDeadJob).not.toHaveBeenCalled();
  });

  it('requeues a dead job and writes the admin action to the audit log', async () => {
    const response = await POST(request({ jobId: JOB_ID }));

    expect(response.status).toBe(200);
    expect(mocks.retryDeadJob).toHaveBeenCalledWith(expect.any(Object), JOB_ID);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'background_job_retried', userId: 'admin-1' }),
    );
  });

  it('answers a job that is not dead as not found', async () => {
    mocks.retryDeadJob.mockResolvedValue(false);

    expect((await POST(request({ jobId: JOB_ID }))).status).toBe(404);
  });
});
