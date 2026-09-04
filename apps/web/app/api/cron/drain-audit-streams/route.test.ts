import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  verifyCronRequest: vi.fn(),
  getNeonDb: vi.fn(),
  listStreamingOrganizations: vi.fn(),
  drainAuditDestination: vi.fn(),
  hasActiveAuditStreamDestinations: vi.fn(),
}));

vi.mock('@/lib/server/cron-auth', () => ({ verifyCronRequest: mocks.verifyCronRequest }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: mocks.getNeonDb }));
vi.mock('@/lib/services/audit-streaming-service', () => ({
  listStreamingOrganizations: mocks.listStreamingOrganizations,
  drainAuditDestination: mocks.drainAuditDestination,
  hasActiveAuditStreamDestinations: mocks.hasActiveAuditStreamDestinations,
}));
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

  it('queries Postgres when the redis flag reports active destinations', async () => {
    mocks.hasActiveAuditStreamDestinations.mockResolvedValue(true);
    mocks.listStreamingOrganizations.mockResolvedValue(['org-1']);
    mocks.drainAuditDestination.mockResolvedValue({
      organizationId: 'org-1',
      delivered: 3,
      status: 'delivered',
      error: null,
    });

    const response = await GET(req());

    expect(response.status).toBe(200);
    expect(mocks.getNeonDb).toHaveBeenCalled();
    expect(mocks.listStreamingOrganizations).toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      destinationsConsidered: 1,
      eventsDelivered: 3,
    });
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
