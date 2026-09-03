import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  readOrganizationPolicy: vi.fn(),
  getOrganizationMonthToDateSpendCents: vi.fn(),
  recordAuditEvent: vi.fn(async (_event: unknown) => undefined),
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/server/managed-usage-policy', () => ({
  getPlanSessionUsageCapCents: vi.fn(() => 1_000_000),
  getPlanWeeklyUsageCapCents: vi.fn(() => 1_000_000),
  getPlanFlagshipWeeklyUsageCapCents: vi.fn(() => 1_000_000),
}));
vi.mock('@/lib/services/cogs-ledger-service', () => ({
  recordSettledProviderCost: vi.fn(),
  getOrganizationMonthToDateSpendCents: mocks.getOrganizationMonthToDateSpendCents,
}));
vi.mock('@/lib/services/organization-policy-service', () => ({
  readOrganizationPolicy: mocks.readOrganizationPolicy,
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: mocks.recordAuditEvent,
}));

const { reserveManagedUsageRequest } = await import('../managed-usage-request-service');

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

function dbStub() {
  const query = vi.fn(async (sql: string) => {
    if (String(sql).includes('reserve_managed_usage_request_with_limits')) {
      return [
        {
          reservation_decision: 'acquired',
          request_status: 'reserved',
          lease_token: 'lease-1',
          estimated_cost_cents: 500,
        },
      ];
    }
    return [];
  });
  return { db: { query } as unknown, query };
}

function baseInput(overrides: Record<string, unknown> = {}) {
  const { db } = dbStub();
  return {
    db,
    userId: 'user-1',
    idempotencyKey: 'req-00000001',
    requestHash: 'hash-1',
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    estimatedCostCents: 100,
    planTier: 'pro',
    isFlagship: false,
    ...overrides,
  } as Parameters<typeof reserveManagedUsageRequest>[0];
}

describe('reserveManagedUsageRequest, organization spend cap', () => {
  beforeEach(() => vi.clearAllMocks());

  it('skips the spend cap check entirely for a personal-scope reservation', async () => {
    await reserveManagedUsageRequest(baseInput());

    expect(mocks.readOrganizationPolicy).not.toHaveBeenCalled();
  });

  it('skips the spend lookup when the organization has no cap configured', async () => {
    mocks.readOrganizationPolicy.mockResolvedValue({ monthlySpendCapCents: null });

    await reserveManagedUsageRequest(baseInput({ organizationId: ORGANIZATION_ID }));

    expect(mocks.getOrganizationMonthToDateSpendCents).not.toHaveBeenCalled();
  });

  it('refuses before reserving once month-to-date spend reaches the cap', async () => {
    mocks.readOrganizationPolicy.mockResolvedValue({ monthlySpendCapCents: 10_000 });
    mocks.getOrganizationMonthToDateSpendCents.mockResolvedValue(10_000);
    const { db, query } = dbStub();

    await expect(
      reserveManagedUsageRequest(baseInput({ db, organizationId: ORGANIZATION_ID })),
    ).rejects.toMatchObject({
      code: 'organization_spend_cap_reached',
      status: 402,
    });

    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('reserve_managed_usage_request_with_limits'),
      ),
    ).toBe(false);
  });

  it('records an admin audit event when the cap trips', async () => {
    mocks.readOrganizationPolicy.mockResolvedValue({ monthlySpendCapCents: 10_000 });
    mocks.getOrganizationMonthToDateSpendCents.mockResolvedValue(10_000);

    await reserveManagedUsageRequest(baseInput({ organizationId: ORGANIZATION_ID })).catch(
      () => undefined,
    );

    expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(1);
    const event = mocks.recordAuditEvent.mock.calls[0]![0] as {
      eventType: string;
      organizationId: string;
      outcome: string;
    };
    expect(event.eventType).toBe('spend_cap_exceeded');
    expect(event.organizationId).toBe(ORGANIZATION_ID);
    expect(event.outcome).toBe('denied');
  });

  it('allows the reservation when month-to-date spend is under the cap', async () => {
    mocks.readOrganizationPolicy.mockResolvedValue({ monthlySpendCapCents: 10_000 });
    mocks.getOrganizationMonthToDateSpendCents.mockResolvedValue(9_999);

    const reservation = await reserveManagedUsageRequest(
      baseInput({ organizationId: ORGANIZATION_ID }),
    );

    expect(reservation.leaseToken).toBe('lease-1');
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('fails open and still reserves when the policy read throws', async () => {
    mocks.readOrganizationPolicy.mockRejectedValue(new Error('connection reset'));

    const reservation = await reserveManagedUsageRequest(
      baseInput({ organizationId: ORGANIZATION_ID }),
    );

    expect(reservation.leaseToken).toBe('lease-1');
  });

  it('fails open and still reserves when the spend lookup throws', async () => {
    mocks.readOrganizationPolicy.mockResolvedValue({ monthlySpendCapCents: 10_000 });
    mocks.getOrganizationMonthToDateSpendCents.mockRejectedValue(new Error('connection reset'));

    const reservation = await reserveManagedUsageRequest(
      baseInput({ organizationId: ORGANIZATION_ID }),
    );

    expect(reservation.leaseToken).toBe('lease-1');
  });
});
