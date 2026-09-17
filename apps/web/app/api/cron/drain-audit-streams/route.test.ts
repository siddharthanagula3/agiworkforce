import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  verifyCronRequest: vi.fn(),
  getNeonDb: vi.fn(),
  listStreamingOrganizations: vi.fn(),
  drainAuditDestination: vi.fn(),
  hasActiveAuditStreamDestinations: vi.fn(),
  enqueueJob: vi.fn(),
}));

vi.mock('@/lib/server/cron-auth', () => ({ verifyCronRequest: mocks.verifyCronRequest }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: mocks.getNeonDb }));
vi.mock('@/lib/services/audit-streaming-service', () => ({
  listStreamingOrganizations: mocks.listStreamingOrganizations,
  drainAuditDestination: mocks.drainAuditDestination,
  hasActiveAuditStreamDestinations: mocks.hasActiveAuditStreamDestinations,
}));
vi.mock('@/lib/jobs/job-service', () => ({ enqueueJob: mocks.enqueueJob }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET } from './route';

function req() {
  return new Request('http://localhost/api/cron/drain-audit-streams') as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyCronRequest.mockReturnValue(true);
  mocks.getNeonDb.mockReturnValue({});
  mocks.listStreamingOrganizations.mockResolvedValue([]);
  mocks.enqueueJob.mockResolvedValue({ id: 'job-1', status: 'queued', created: true });
});

describe('GET /api/cron/drain-audit-streams', () => {
  it('401s without cron authorization and never checks the flag', async () => {
    mocks.verifyCronRequest.mockReturnValue(false);

    const response = await GET(req());

    expect(response.status).toBe(401);
    expect(mocks.hasActiveAuditStreamDestinations).not.toHaveBeenCalled();
  });

  it('skips Postgres entirely when the redis flag reports no active destinations', async () => {
    mocks.hasActiveAuditStreamDestinations.mockResolvedValue(false);

    const response = await GET(req());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      destinationsConsidered: 0,
      skippedDatabase: true,
    });
    expect(mocks.getNeonDb).not.toHaveBeenCalled();
    expect(mocks.listStreamingOrganizations).not.toHaveBeenCalled();
  });

  it('queues one delivery job per destination instead of delivering inline', async () => {
    mocks.hasActiveAuditStreamDestinations.mockResolvedValue(true);
    mocks.listStreamingOrganizations.mockResolvedValue(['org-1']);

    const response = await GET(req());

    expect(response.status).toBe(200);
    expect(mocks.getNeonDb).toHaveBeenCalled();
    expect(mocks.drainAuditDestination).not.toHaveBeenCalled();
    expect(mocks.enqueueJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        kind: 'webhooks.audit-stream-delivery',
        organizationId: 'org-1',
        idempotencyKey: expect.stringContaining('audit-stream:org-1:'),
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      destinationsConsidered: 1,
      destinationsQueued: 1,
    });
  });

  it('counts a destination whose job is already queued rather than queuing a second', async () => {
    mocks.hasActiveAuditStreamDestinations.mockResolvedValue(true);
    mocks.listStreamingOrganizations.mockResolvedValue(['org-1']);
    mocks.enqueueJob.mockResolvedValue({ id: 'job-1', status: 'queued', created: false });

    const response = await GET(req());

    await expect(response.json()).resolves.toMatchObject({
      destinationsQueued: 0,
      destinationsAlreadyQueued: 1,
    });
  });

  it('reports a destination whose job could not be queued without failing the sweep', async () => {
    mocks.hasActiveAuditStreamDestinations.mockResolvedValue(true);
    mocks.listStreamingOrganizations.mockResolvedValue(['org-1', 'org-2']);
    mocks.enqueueJob
      .mockRejectedValueOnce(new Error('queue unavailable'))
      .mockResolvedValueOnce({ id: 'job-2', status: 'queued', created: true });

    const response = await GET(req());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ failed: 1, destinationsQueued: 1 });
  });

  it('falls through to Postgres when the flag check cannot answer', async () => {
    mocks.hasActiveAuditStreamDestinations.mockResolvedValue(null);
    mocks.listStreamingOrganizations.mockResolvedValue([]);

    const response = await GET(req());

    expect(response.status).toBe(200);
    expect(mocks.getNeonDb).toHaveBeenCalled();
    expect(mocks.listStreamingOrganizations).toHaveBeenCalled();
  });
});
