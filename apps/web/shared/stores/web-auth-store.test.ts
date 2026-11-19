import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestMe = vi.hoisted(() => vi.fn());

vi.mock('@shared/services/me-request', () => ({ requestMe }));
vi.mock('@/lib/clerk-session', () => ({
  hasClerkSessionCookie: () => false,
  hasUsableClerkSessionToken: () => false,
  subscribeToClerkSessionChange: () => () => undefined,
}));

import { useBillingStore } from './web-auth-store';

function meBody(plan: Record<string, unknown>) {
  return {
    id: 'user_1',
    email: 'user@example.com',
    name: 'User',
    avatar_url: null,
    created_at: null,
    updated_at: 0,
    plan: {
      display_name: 'Pro',
      status: 'past_due',
      current_period_end: null,
      ...plan,
    },
    feature_flags: { advanced_model_access: false },
    routing_preferences: {},
  };
}

async function refreshWith(plan: Record<string, unknown>) {
  requestMe.mockResolvedValue({ ok: true, status: 200, json: async () => meBody(plan) });
  await useBillingStore.getState().refreshUser();
  return useBillingStore.getState().subscription;
}

beforeEach(() => {
  requestMe.mockReset();
  useBillingStore.getState()._reset();
});

describe('the plan the web client gates on', () => {
  it('is the effective tier when a lapsed paid subscription is effectively Free', async () => {
    const subscription = await refreshWith({ tier: 'pro', effective_tier: 'free' });

    expect(subscription?.tier).toBe('free');
    expect(subscription?.billing_tier).toBe('pro');
    expect(subscription?.status).toBe('past_due');
  });

  it('is the effective tier when it exceeds the billed plan', async () => {
    const subscription = await refreshWith({
      tier: 'free',
      effective_tier: 'team',
      status: 'none',
    });

    expect(subscription?.tier).toBe('team');
    expect(subscription?.billing_tier).toBe('free');
  });

  it('falls back to the billed tier when the server sent no effective tier', async () => {
    const subscription = await refreshWith({ tier: 'pro', status: 'active' });

    expect(subscription?.tier).toBe('pro');
    expect(subscription?.billing_tier).toBe('pro');
  });
});
