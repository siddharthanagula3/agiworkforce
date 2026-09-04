import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  getClerkAuthUser: vi.fn(),
  getSubscription: vi.fn(),
  resolveActiveOrganizationId: vi.fn(),
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
  getNeonDb: vi.fn(() => ({})),
}));

vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: mocks.resolveActiveOrganizationId,
}));

vi.mock('@/lib/services/enterprise-collection-state', () => ({
  readOrganizationCollectionState: mocks.readOrganizationCollectionState,
}));

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

describe('runAuthGate enterprise collection grace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getClerkAuthUser.mockResolvedValue({ userId: 'user-123' });
    mocks.resolveActiveOrganizationId.mockResolvedValue('org-123');
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
    if (!result.ok) expect(result.response.status).toBe(403);
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
});
