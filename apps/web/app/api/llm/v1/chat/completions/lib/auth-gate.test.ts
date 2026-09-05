import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  getClerkAuthUser: vi.fn(),
  getSubscription: vi.fn(),
  dbQuery: vi.fn(),
  readOrganizationCollectionState: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: mocks.withRateLimit,
}));

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: mocks.getClerkAuthUser,
}));

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    getSubscription: mocks.getSubscription,
  },
}));

vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn(() => null),
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn(() => null),
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({ query: mocks.dbQuery })),
}));

vi.mock('@/lib/services/enterprise-collection-state', () => ({
  readOrganizationCollectionState: mocks.readOrganizationCollectionState,
}));

import { requireCsrfToken } from '@/lib/csrf';
import { runAuthGate } from './auth-gate';

function makeRequest() {
  return new NextRequest('http://localhost/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: 'Bearer verified-token',
      'x-agi-surface': 'web',
      'x-real-ip': '203.0.113.10',
    },
  });
}

describe('runAuthGate rate limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getClerkAuthUser.mockResolvedValue({ userId: 'user-123' });
    mocks.getSubscription.mockResolvedValue({
      id: 'subscription-123',
      status: 'active',
      plan_tier: 'basic',
    });
  });

  it('uses a broad IP abuse bucket and a separate verified-user chat bucket', async () => {
    const request = makeRequest();

    const result = await runAuthGate(request);

    expect(result.ok).toBe(true);
    expect(mocks.withRateLimit).toHaveBeenNthCalledWith(1, request, 'llm-completion-ip');
    expect(mocks.withRateLimit).toHaveBeenNthCalledWith(
      2,
      request,
      'llm-completion',
      'user:user-123',
    );
  });
});

function makeRequestWithPersonalHeader() {
  return new NextRequest('http://localhost/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: 'Bearer verified-token',
      'x-agi-surface': 'web',
      'x-real-ip': '203.0.113.10',
      'x-agi-organization-id': 'personal',
    },
  });
}

describe('runAuthGate enterprise collection grace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getClerkAuthUser.mockResolvedValue({ userId: 'user-123' });
    mocks.dbQuery.mockResolvedValue([{ organization_id: 'org-123' }]);
  });

  it('keeps an enterprise account entitled while past_due and not read-only', async () => {
    mocks.getSubscription.mockResolvedValue({
      id: 'subscription-123',
      status: 'past_due',
      plan_tier: 'enterprise',
    });
    mocks.readOrganizationCollectionState.mockResolvedValue({ readOnly: false });

    const result = await runAuthGate(makeRequest());

    expect(result.ok).toBe(true);
    expect(mocks.readOrganizationCollectionState).toHaveBeenCalledWith(
      expect.anything(),
      'org-123',
    );
  });

  it('keeps an enterprise account entitled while unpaid and not read-only', async () => {
    mocks.getSubscription.mockResolvedValue({
      id: 'subscription-123',
      status: 'unpaid',
      plan_tier: 'enterprise',
    });
    mocks.readOrganizationCollectionState.mockResolvedValue({ readOnly: false });

    const result = await runAuthGate(makeRequest());

    expect(result.ok).toBe(true);
  });

  it('blocks an enterprise account once the collection stage reaches read_only', async () => {
    mocks.getSubscription.mockResolvedValue({
      id: 'subscription-123',
      status: 'past_due',
      plan_tier: 'enterprise',
    });
    mocks.readOrganizationCollectionState.mockResolvedValue({ readOnly: true });

    const result = await runAuthGate(makeRequest());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      const body = await (result.response as Response).clone().json();
      expect(body.error.code).toBe('billing_read_only');
    }
  });

  it('blocks a read_only enterprise account with Stripe status still active, the send_invoice case', async () => {
    mocks.getSubscription.mockResolvedValue({
      id: 'subscription-123',
      status: 'active',
      plan_tier: 'enterprise',
    });
    mocks.readOrganizationCollectionState.mockResolvedValue({ readOnly: true });

    const result = await runAuthGate(makeRequest());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const body = await (result.response as Response).clone().json();
      expect(body.error.code).toBe('billing_read_only');
    }
  });

  it('blocks a read_only enterprise owner even when the request carries the personal workspace header', async () => {
    mocks.getSubscription.mockResolvedValue({
      id: 'subscription-123',
      status: 'active',
      plan_tier: 'enterprise',
    });
    mocks.readOrganizationCollectionState.mockResolvedValue({ readOnly: true });

    const result = await runAuthGate(makeRequestWithPersonalHeader());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const body = await (result.response as Response).clone().json();
      expect(body.error.code).toBe('billing_read_only');
    }
    expect(String(mocks.dbQuery.mock.calls[0]?.[0])).toContain('owner_user_id');
  });

  it('blocks a read_only enterprise seat member even when the request carries the personal workspace header', async () => {
    mocks.getSubscription.mockResolvedValue({
      id: 'subscription-123',
      status: 'active',
      plan_tier: 'enterprise',
    });
    // No organization the caller owns; resolved instead through their seat membership.
    mocks.dbQuery.mockResolvedValue([{ organization_id: 'org-member-456' }]);
    mocks.readOrganizationCollectionState.mockResolvedValue({ readOnly: true });

    const result = await runAuthGate(makeRequestWithPersonalHeader());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const body = await (result.response as Response).clone().json();
      expect(body.error.code).toBe('billing_read_only');
    }
    expect(mocks.readOrganizationCollectionState).toHaveBeenCalledWith(
      expect.anything(),
      'org-member-456',
    );
  });

  it('does not read collection state for a non-enterprise plan tier', async () => {
    mocks.getSubscription.mockResolvedValue({
      id: 'subscription-123',
      status: 'active',
      plan_tier: 'basic',
    });

    const result = await runAuthGate(makeRequest());

    expect(result.ok).toBe(true);
    expect(mocks.readOrganizationCollectionState).not.toHaveBeenCalled();
    expect(mocks.dbQuery).not.toHaveBeenCalled();
  });

  it('fails open to entitled when the collection state read errors', async () => {
    mocks.getSubscription.mockResolvedValue({
      id: 'subscription-123',
      status: 'past_due',
      plan_tier: 'enterprise',
    });
    mocks.readOrganizationCollectionState.mockRejectedValue(new Error('db unavailable'));

    const result = await runAuthGate(makeRequest());

    expect(result.ok).toBe(true);
  });

  it('fails open to entitled when the funding organization lookup itself errors', async () => {
    mocks.getSubscription.mockResolvedValue({
      id: 'subscription-123',
      status: 'past_due',
      plan_tier: 'enterprise',
    });
    mocks.dbQuery.mockRejectedValue(new Error('db unavailable'));

    const result = await runAuthGate(makeRequest());

    expect(result.ok).toBe(true);
  });
});

const NO_DELAY_MS = 0;

function flushPendingWork(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, NO_DELAY_MS);
  });
}

describe('runAuthGate first-token cost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getClerkAuthUser.mockResolvedValue({ userId: 'user-123' });
    mocks.getSubscription.mockResolvedValue({
      id: 'subscription-123',
      status: 'active',
      plan_tier: 'basic',
    });
  });

  it('reads the subscription alongside the csrf and rate-limit gates', async () => {
    let releaseCsrf: (() => void) | undefined;
    vi.mocked(requireCsrfToken).mockReturnValue(
      new Promise<null>((resolve) => {
        releaseCsrf = () => resolve(null);
      }) as unknown as ReturnType<typeof requireCsrfToken>,
    );

    const pending = runAuthGate(makeRequest());
    await flushPendingWork();

    expect(mocks.getSubscription).toHaveBeenCalledTimes(1);

    releaseCsrf?.();
    await expect(pending).resolves.toMatchObject({ ok: true });
  });

  it('rejects an invalid csrf token even though the subscription read already started', async () => {
    vi.mocked(requireCsrfToken).mockResolvedValue(
      NextResponse.json({ error: 'csrf' }, { status: 403 }),
    );

    const result = await runAuthGate(makeRequest());

    expect(result.ok).toBe(false);
    expect(mocks.withRateLimit).toHaveBeenCalledTimes(1);
  });
});
