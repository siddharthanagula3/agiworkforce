import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  requireCsrfToken: vi.fn(),
  requirePlatformAdmin: vi.fn(),
  readJobQueueStats: vi.fn(),
  listDeadJobs: vi.fn(),
  retryDeadJob: vi.fn(),
  recordAuditEvent: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/auth-guards', () => ({ requirePlatformAdmin: mocks.requirePlatformAdmin }));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/security-audit')>()),
  recordAuditEvent: mocks.recordAuditEvent,
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({}) }));
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
  mocks.listDeadJobs.mockResolvedValue([{ id: JOB_ID, deadReason: 'gave up' }]);
  mocks.retryDeadJob.mockResolvedValue(true);
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
    expect(mocks.retryDeadJob).toHaveBeenCalledWith({}, JOB_ID);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'background_job_retried', userId: 'admin-1' }),
    );
  });

  it('answers a job that is not dead as not found', async () => {
    mocks.retryDeadJob.mockResolvedValue(false);

    expect((await POST(request({ jobId: JOB_ID }))).status).toBe(404);
  });
});
