import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyCronRequest: vi.fn(),
  reportEnterpriseOverageUsage: vi.fn(),
}));

vi.mock('@/lib/server/cron-auth', () => ({ verifyCronRequest: mocks.verifyCronRequest }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({}) }));
vi.mock('@/lib/services/enterprise-usage-metering', () => ({
  reportEnterpriseOverageUsage: (...args: unknown[]) => mocks.reportEnterpriseOverageUsage(...args),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET } from './route';

function req() {
  return new Request('http://localhost/api/cron/report-enterprise-usage') as never;
}

const ORIGINAL_STRIPE_SECRET_KEY = process.env['STRIPE_SECRET_KEY'];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyCronRequest.mockReturnValue(true);
  mocks.reportEnterpriseOverageUsage.mockResolvedValue([]);
  process.env['STRIPE_SECRET_KEY'] = 'sk_test_fixture';
});

afterEach(() => {
  if (ORIGINAL_STRIPE_SECRET_KEY === undefined) {
    delete process.env['STRIPE_SECRET_KEY'];
  } else {
    process.env['STRIPE_SECRET_KEY'] = ORIGINAL_STRIPE_SECRET_KEY;
  }
});

describe('GET /api/cron/report-enterprise-usage', () => {
  it('401s and never reports usage without cron authorization', async () => {
    mocks.verifyCronRequest.mockReturnValue(false);

    const response = await GET(req());

    expect(response.status).toBe(401);
    expect(mocks.reportEnterpriseOverageUsage).not.toHaveBeenCalled();
  });

  it('skips reporting when Stripe is not configured', async () => {
    delete process.env['STRIPE_SECRET_KEY'];

    const response = await GET(req());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toEqual([]);
    expect(mocks.reportEnterpriseOverageUsage).not.toHaveBeenCalled();
  });

  it('reports overage for every metered contract', async () => {
    mocks.reportEnterpriseOverageUsage.mockResolvedValue([
      {
        organizationId: 'org_1',
        status: 'reported',
        reportedCents: 500,
        cumulativeOverageCents: 500,
      },
      {
        organizationId: 'org_2',
        status: 'skipped_no_new_overage',
        reportedCents: 0,
        cumulativeOverageCents: 200,
      },
    ]);

    const response = await GET(req());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toHaveLength(2);
    expect(mocks.reportEnterpriseOverageUsage).toHaveBeenCalledTimes(1);
  });

  it('reports failure when every contract failed to report', async () => {
    mocks.reportEnterpriseOverageUsage.mockResolvedValue([
      {
        organizationId: 'org_1',
        status: 'failed',
        reportedCents: 0,
        cumulativeOverageCents: 0,
        error: 'stripe down',
      },
    ]);

    const response = await GET(req());

    expect(response.status).toBe(500);
  });

  it('stays healthy when only some contracts fail', async () => {
    mocks.reportEnterpriseOverageUsage.mockResolvedValue([
      {
        organizationId: 'org_1',
        status: 'failed',
        reportedCents: 0,
        cumulativeOverageCents: 0,
        error: 'stripe down',
      },
      {
        organizationId: 'org_2',
        status: 'reported',
        reportedCents: 100,
        cumulativeOverageCents: 100,
      },
    ]);

    const response = await GET(req());

    expect(response.status).toBe(200);
  });
});
