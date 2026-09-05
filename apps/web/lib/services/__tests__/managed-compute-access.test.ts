import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readOrganizationCollectionState: vi.fn(),
  evaluateActiveWorkspacePolicy: vi.fn(),
  evaluateSpendLimit: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: mocks.loggerError, debug: vi.fn() },
}));

vi.mock('@/lib/services/enterprise-collection-state', () => ({
  readOrganizationCollectionState: mocks.readOrganizationCollectionState,
  CURRENT_COLLECTION_STATE: {
    stage: 'current',
    daysPastDue: 0,
    oldestOpenInvoiceDueAt: null,
    seatExpansionBlocked: false,
    newPaidUsageBlocked: false,
    readOnly: false,
  },
}));

vi.mock('@/lib/services/organization-policy-gate', () => ({
  evaluateActiveWorkspacePolicy: mocks.evaluateActiveWorkspacePolicy,
}));

vi.mock('@/lib/services/spend-limit-service', () => ({
  evaluateSpendLimit: mocks.evaluateSpendLimit,
}));

import {
  buildManagedComputeAccessGateResponse,
  evaluateManagedComputeAccess,
  evaluateManagedComputeSubscriptionAccess,
  evaluateManagedComputeWorkspaceAccess,
} from '../managed-compute-access';
import type { SubscriptionInfo } from '../subscription-service';

function subscription(overrides: Partial<SubscriptionInfo>): SubscriptionInfo {
  return {
    id: 'sub-1',
    user_id: 'user-1',
    plan_tier: 'enterprise',
    status: 'active',
    current_period_start: new Date('2026-01-01T00:00:00Z'),
    current_period_end: new Date('2026-02-01T00:00:00Z'),
    stripe_subscription_id: 'sub_1',
    stripe_price_id: 'price_1',
    ...overrides,
  };
}

const dbQuery = vi.fn();
const db = { query: dbQuery } as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('evaluateManagedComputeSubscriptionAccess', () => {
  it('allows a caller with no platform subscription, the BYOK/local shape', async () => {
    const decision = await evaluateManagedComputeSubscriptionAccess(db, 'user-1', null);
    expect(decision.allowed).toBe(true);
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it('allows a free plan tier regardless of status', async () => {
    const decision = await evaluateManagedComputeSubscriptionAccess(
      db,
      'user-1',
      subscription({ plan_tier: 'free', status: 'canceled' }),
    );
    expect(decision.allowed).toBe(true);
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it('keeps an enterprise account entitled while past_due and not read-only, the grace window', async () => {
    dbQuery.mockResolvedValue([{ organization_id: 'org-123' }]);
    mocks.readOrganizationCollectionState.mockResolvedValue({ readOnly: false });

    const decision = await evaluateManagedComputeSubscriptionAccess(
      db,
      'user-1',
      subscription({ plan_tier: 'enterprise', status: 'past_due' }),
    );

    expect(decision.allowed).toBe(true);
  });

  it('refuses an enterprise account once the collection stage reaches read_only', async () => {
    dbQuery.mockResolvedValue([{ organization_id: 'org-123' }]);
    mocks.readOrganizationCollectionState.mockResolvedValue({ readOnly: true });

    const decision = await evaluateManagedComputeSubscriptionAccess(
      db,
      'user-1',
      subscription({ plan_tier: 'enterprise', status: 'active' }),
    );

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('billing_read_only');
  });

  it('refuses a read_only enterprise account resolved through org ownership', async () => {
    dbQuery.mockResolvedValue([{ organization_id: 'org-owner' }]);
    mocks.readOrganizationCollectionState.mockResolvedValue({ readOnly: true });

    const decision = await evaluateManagedComputeSubscriptionAccess(
      db,
      'user-1',
      subscription({ plan_tier: 'enterprise', status: 'active' }),
    );

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('billing_read_only');
    expect(String(dbQuery.mock.calls[0]?.[0])).toContain('owner_user_id');
  });

  it('refuses a read_only enterprise account resolved through a seat membership', async () => {
    dbQuery.mockResolvedValue([{ organization_id: 'org-member-456' }]);
    mocks.readOrganizationCollectionState.mockResolvedValue({ readOnly: true });

    const decision = await evaluateManagedComputeSubscriptionAccess(
      db,
      'user-1',
      subscription({ plan_tier: 'enterprise', status: 'active' }),
    );

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('billing_read_only');
    expect(mocks.readOrganizationCollectionState).toHaveBeenCalledWith(db, 'org-member-456');
  });

  it('refuses a lapsed non-enterprise subscription as subscription_inactive', async () => {
    const decision = await evaluateManagedComputeSubscriptionAccess(
      db,
      'user-1',
      subscription({ plan_tier: 'pro', status: 'canceled' }),
    );

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('subscription_inactive');
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it('fails open to entitled, with a log, when the collection state read errors', async () => {
    dbQuery.mockResolvedValue([{ organization_id: 'org-123' }]);
    mocks.readOrganizationCollectionState.mockRejectedValue(new Error('db unavailable'));

    const decision = await evaluateManagedComputeSubscriptionAccess(
      db,
      'user-1',
      subscription({ plan_tier: 'enterprise', status: 'past_due' }),
    );

    expect(decision.allowed).toBe(true);
    expect(mocks.loggerError).toHaveBeenCalled();
  });
});

describe('evaluateManagedComputeWorkspaceAccess', () => {
  it('passes an allowed policy decision through when spend is within limit', async () => {
    mocks.evaluateActiveWorkspacePolicy.mockResolvedValue({
      allowed: true,
      code: 'allowed',
      reason: 'ok',
      obligations: [],
      organizationId: 'org-1',
    });
    mocks.evaluateSpendLimit.mockResolvedValue({ allowed: true, code: 'allowed', reason: 'ok' });

    const decision = await evaluateManagedComputeWorkspaceAccess(db, 'user-1', 'web', {
      organizationId: 'org-1',
    });

    expect(decision.allowed).toBe(true);
    expect(mocks.evaluateSpendLimit).toHaveBeenCalledWith(db, 'org-1');
  });

  it('refuses when the workspace policy denies, without consulting spend', async () => {
    mocks.evaluateActiveWorkspacePolicy.mockResolvedValue({
      allowed: false,
      code: 'billing_read_only',
      reason: 'read only',
      obligations: [],
      organizationId: 'org-1',
    });

    const decision = await evaluateManagedComputeWorkspaceAccess(db, 'user-1', 'web', {
      organizationId: 'org-1',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('billing_read_only');
    expect(mocks.evaluateSpendLimit).not.toHaveBeenCalled();
  });

  it('refuses when the workspace policy allows but the spend cap is exceeded', async () => {
    mocks.evaluateActiveWorkspacePolicy.mockResolvedValue({
      allowed: true,
      code: 'allowed',
      reason: 'ok',
      obligations: [],
      organizationId: 'org-1',
    });
    mocks.evaluateSpendLimit.mockResolvedValue({
      allowed: false,
      code: 'over_cap',
      reason: 'over the monthly cap',
    });

    const decision = await evaluateManagedComputeWorkspaceAccess(db, 'user-1', 'web', {
      organizationId: 'org-1',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('over_cap');
  });

  it('builds a personal-workspace header when given an organization scope of null', async () => {
    mocks.evaluateActiveWorkspacePolicy.mockResolvedValue({
      allowed: true,
      code: 'unscoped',
      reason: 'ok',
      obligations: [],
      organizationId: null,
    });
    mocks.evaluateSpendLimit.mockResolvedValue({ allowed: true, code: 'ungoverned', reason: 'ok' });

    await evaluateManagedComputeWorkspaceAccess(db, 'user-1', 'api', { organizationId: null });

    const request = mocks.evaluateActiveWorkspacePolicy.mock.calls[0]?.[3] as {
      headers: { get(name: string): string | null };
    };
    expect(request.headers.get('x-agi-organization-id')).toBe('personal');
  });

  it('threads a request scope straight through to the workspace policy evaluator', async () => {
    mocks.evaluateActiveWorkspacePolicy.mockResolvedValue({
      allowed: true,
      code: 'unscoped',
      reason: 'ok',
      obligations: [],
      organizationId: null,
    });
    mocks.evaluateSpendLimit.mockResolvedValue({ allowed: true, code: 'ungoverned', reason: 'ok' });

    const fakeRequest = { headers: { get: () => null } };
    await evaluateManagedComputeWorkspaceAccess(db, 'user-1', 'cli', { request: fakeRequest });

    expect(mocks.evaluateActiveWorkspacePolicy).toHaveBeenCalledWith(
      db,
      'user-1',
      { resource: 'managed_compute', surface: 'cli' },
      fakeRequest,
    );
  });
});

describe('evaluateManagedComputeAccess', () => {
  it('short-circuits on a subscription refusal without evaluating workspace policy', async () => {
    const decision = await evaluateManagedComputeAccess(
      db,
      'user-1',
      subscription({ plan_tier: 'pro', status: 'canceled' }),
      'web',
      { organizationId: null },
    );

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('subscription_inactive');
    expect(mocks.evaluateActiveWorkspacePolicy).not.toHaveBeenCalled();
  });

  it('falls through to the workspace decision once the subscription is entitled', async () => {
    mocks.evaluateActiveWorkspacePolicy.mockResolvedValue({
      allowed: false,
      code: 'managed_compute_disabled',
      reason: 'turned off',
      obligations: [],
      organizationId: 'org-1',
    });

    const decision = await evaluateManagedComputeAccess(
      db,
      'user-1',
      subscription({ plan_tier: 'free', status: 'active' }),
      'web',
      { organizationId: 'org-1' },
    );

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('managed_compute_disabled');
  });
});

describe('buildManagedComputeAccessGateResponse', () => {
  it('returns null for an allowed decision', () => {
    expect(
      buildManagedComputeAccessGateResponse({
        allowed: true,
        code: 'allowed',
        reason: 'ok',
        organizationId: null,
      }),
    ).toBeNull();
  });

  it('shapes a 403 response carrying the decision code for a refusal', async () => {
    const response = buildManagedComputeAccessGateResponse({
      allowed: false,
      code: 'billing_read_only',
      reason: 'Ask your billing owner.',
      organizationId: 'org-1',
    });

    expect(response).not.toBeNull();
    expect(response?.status).toBe(403);
    const body = (await response?.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('billing_read_only');
    expect(body.error.message).toBe('Ask your billing owner.');
  });
});
