import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ManagedUsageSummaryResponse } from '@agiworkforce/types';

const authMocks = vi.hoisted(() => ({ token: vi.fn(async () => 'jwt-token') }));

vi.mock('@shared/lib/get-auth-token', () => ({ getAuthToken: () => authMocks.token() }));
vi.mock('@shared/stores/authentication-store', () => ({
  useAuthStore: () => ({ user: { id: 'user-1' } }),
}));
vi.mock('@shared/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { buildBillingInfoFromUsage, useBillingData } from './use-billing-queries';

const usage: ManagedUsageSummaryResponse = {
  plan_tier: 'pro',
  usage_percentage: 42,
  usage_reset_at: '2026-08-18T00:00:00.000Z',
  has_usage_remaining: true,
  period_start: '2026-07-18T00:00:00.000Z',
  period_end: '2026-08-18T00:00:00.000Z',
  subscription_status: 'past_due',
  session_usage_percentage: 20,
  session_reset_at: null,
  weekly_usage_percentage: 30,
  weekly_reset_at: null,
  flagship_weekly_usage_percentage: 10,
  flagship_weekly_reset_at: null,
};

describe('buildBillingInfoFromUsage', () => {
  it('preserves actual subscription status and periods without inventing a USD price', () => {
    const billing = buildBillingInfoFromUsage(usage);

    expect(billing.status).toBe('past_due');
    expect(billing.current_period_start).toBe('2026-07-18T00:00:00.000Z');
    expect(billing.current_period_end).toBe('2026-08-18T00:00:00.000Z');
    expect(billing.price).toBeNull();
    expect(billing.currency).toBeNull();
    expect(billing.usage).toEqual({ usedPercent: 42 });
  });

  it('keeps unknown periods and subscription state honest', () => {
    const billing = buildBillingInfoFromUsage({
      ...usage,
      period_start: null,
      period_end: null,
      subscription_status: 'none',
    });

    expect(billing.status).toBe('none');
    expect(billing.current_period_start).toBeNull();
    expect(billing.current_period_end).toBeNull();
  });

  it('derives public plan features from the shared limit and capability catalog', () => {
    const free = buildBillingInfoFromUsage({ ...usage, plan_tier: 'free' });
    const max15x = buildBillingInfoFromUsage({ ...usage, plan_tier: 'max_15x' });

    expect(free.features).toContain('1 project');
    expect(free.features).toContain('1 custom MCP server');
    expect(max15x.features).toContain('Unlimited projects');
    expect(max15x.features).toContain('Unlimited custom MCP servers');
    expect(max15x.features).toContain('Video generation');
  });
});

describe('useBillingData freshness', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    authMocks.token.mockResolvedValue('jwt-token');
  });

  function wrapper(client: QueryClient) {
    return ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
  }

  it('re-reads the plan when the tab regains focus after an upgrade elsewhere', async () => {
    // 3DS authentication, the Stripe portal and Checkout all leave the app and
    // come back within seconds. A stale window would suppress this refetch and
    // render the plan the user just paid to leave.
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(JSON.stringify({ ...usage, plan_tier: 'max' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useBillingData(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.data?.plan).toBe('max'));
    const readsBeforeReturn = fetchMock.mock.calls.length;

    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ ...usage, plan_tier: 'max_15x' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    window.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));

    await waitFor(() => expect(result.current.data?.plan).toBe('max_15x'));
    expect(fetchMock.mock.calls.length).toBeGreaterThan(readsBeforeReturn);
  });

  it('asks the server rather than accepting a cached upgrade-window response', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(usage), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useBillingData(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.data).not.toBeNull());

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/usage',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });
});
