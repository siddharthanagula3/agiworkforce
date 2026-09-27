import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { managedUsageBucketLabel } from '@agiworkforce/types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('@agiworkforce/ui', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Progress: ({ value }: { value: number }) =>
    React.createElement('div', { 'data-testid': 'progress', 'data-value': value }),
}));

import { __resetManagedUsageSummaryForTest } from '@/lib/hooks/useManagedUsageSummary';
import { UsageSection } from '../UsageSection';
import { SettingsSectionNavigationProvider } from '../../components/SettingsSectionLink';

const originalFetch = global.fetch;
const DAY_MS = 24 * 60 * 60_000;

function inDays(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString();
}

function creditWindow(allowance: number, used: number) {
  return { allowance, used, remaining: Math.max(0, allowance - used), reset_at: null };
}

function freeSummary() {
  return {
    plan_tier: 'free',
    usage_percentage: 50,
    usage_reset_at: inDays(5),
    has_usage_remaining: true,
    period_start: null,
    period_end: null,
    subscription_status: 'none',
    session_usage_percentage: 60,
    session_reset_at: inDays(0.125),
    weekly_usage_percentage: 40,
    weekly_reset_at: inDays(2),
    flagship_weekly_usage_percentage: 0,
    flagship_weekly_reset_at: null,
    credit_balance_cents: 0,
    overage_enabled: false,
    credits: {
      monthly: creditWindow(20, 10),
      weekly: creditWindow(15, 6),
      five_hour: creditWindow(2, 1.2),
      flagship_weekly: null,
      purchased: { remaining: 0, overage_enabled: false },
      bonus: { remaining: 0, next_expiry_at: null },
      purchase_expiry: { expiring_credits: 0, next_expiry_at: null },
    },
  };
}

function proSummary(credits: Record<string, unknown> = {}) {
  return {
    plan_tier: 'pro',
    usage_percentage: 20,
    usage_reset_at: inDays(5),
    has_usage_remaining: true,
    period_start: inDays(-25),
    period_end: inDays(5),
    subscription_status: 'active',
    session_usage_percentage: 60,
    session_reset_at: inDays(0.125),
    weekly_usage_percentage: 40,
    weekly_reset_at: inDays(2),
    flagship_weekly_usage_percentage: 10,
    flagship_weekly_reset_at: inDays(3),
    credit_balance_cents: 0,
    overage_enabled: true,
    usage_allocation: 'provisioned',
    credits: {
      monthly: creditWindow(2_000, 400),
      weekly: creditWindow(500, 200),
      five_hour: creditWindow(50, 30),
      flagship_weekly: creditWindow(150, 15.25),
      purchased: { remaining: 423.7, overage_enabled: true },
      bonus: { remaining: 60, next_expiry_at: '2026-10-15T12:00:00.000Z' },
      purchase_expiry: { expiring_credits: 0, next_expiry_at: null },
      ...credits,
    },
  };
}

function monthlyLimits(over: Record<string, unknown> = {}) {
  return {
    planTier: 'pro',
    periodStart: inDays(-25),
    resetAt: '2026-10-01T00:00:00.000Z',
    units: [
      { unit: 'voice_minutes', consumed: 12, hardLimit: 60, softLimit: null },
      { unit: 'video_seconds', consumed: 0, hardLimit: null, softLimit: null },
      { unit: 'computer_use_requests', consumed: 3, hardLimit: null, softLimit: null },
    ],
    images: { images: 4, requests: 2, credits: 12 },
    responses: { limit: 3, active: 1 },
    ...over,
  };
}

const QUIET_MONTH = {
  units: [{ unit: 'voice_minutes', consumed: 0, hardLimit: null, softLimit: null }],
  images: { images: 0, requests: 0, credits: 0 },
  responses: null,
};

interface Answer {
  ok: boolean;
  body: unknown;
}

function answer(body: unknown): Answer {
  return { ok: true, body };
}

const FAILED: Answer = { ok: false, body: {} };

interface UsageApi {
  summary: () => Answer;
  limits?: () => Answer;
  history?: () => Answer;
}

function stubUsageApi(api: UsageApi): string[] {
  const requested: string[] = [];
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    requested.push(url);
    const path = url.split('?')[0];
    const route =
      path === '/api/usage'
        ? api.summary
        : path === '/api/usage/limits'
          ? api.limits
          : path === '/api/usage/history'
            ? api.history
            : undefined;
    if (!route) throw new Error(`UsageSection requested an unexpected url: ${url}`);
    const { ok, body } = route();
    return { ok, json: async () => body } as Response;
  }) as unknown as typeof fetch;
  return requested;
}

function renderSection(onExit = vi.fn()) {
  return render(
    <SettingsSectionNavigationProvider onNavigate={vi.fn()} onExit={onExit}>
      <UsageSection />
    </SettingsSectionNavigationProvider>,
  );
}

function barFills(): (string | null)[] {
  return screen.getAllByTestId('progress').map((el) => el.getAttribute('data-value'));
}

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

// The usage reading is shared by every component that shows it, so it outlives a
// test unless it is cleared: without this a later case renders the previous
// case's numbers and the failure looks like a bug in the pane.
beforeEach(() => {
  __resetManagedUsageSummaryForTest();
});

describe('UsageSection', () => {
  it('meters a free account in credits like every other plan, beside an upgrade link', async () => {
    stubUsageApi({ summary: () => answer(freeSummary()), limits: () => answer(QUIET_MONTH) });
    renderSection();

    expect(
      await screen.findByText('Free · 20 credits/month · 15 credits/week · 2 credits per 5 hours'),
    ).toBeTruthy();
    expect(screen.getAllByText(/Used 1\.2 of 2 credits · 0\.8 left/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Used 6 of 15 credits · 9 left/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Used 10 of 20 credits · 10 left/).length).toBeGreaterThan(0);
    expect(barFills()).toEqual(['60', '40', '50']);
    expect(screen.queryByText(managedUsageBucketLabel('weeklyFlagship'))).toBeNull();
    expect(screen.getByRole('link', { name: 'Upgrade' })).toHaveAttribute('href', '/pricing');
    expect(screen.queryByText(/free models/i)).toBeNull();
  });

  it('reports a reading that never loaded instead of inventing one', async () => {
    stubUsageApi({ summary: () => FAILED });
    renderSection();

    expect(await screen.findByText(/Last updated: Never/)).toBeTruthy();
    expect(screen.getAllByText('Could not read your usage. Retry to load it.')).toHaveLength(4);
    expect(screen.queryByText(/Not loaded/)).toBeNull();
    expect(screen.queryByText('Credit balances')).toBeNull();
  });

  it('marks the reading stale when a refresh fails rather than blanking it', async () => {
    let summary: Answer = answer(proSummary());
    stubUsageApi({ summary: () => summary, limits: () => answer(monthlyLimits()) });
    renderSection();
    await screen.findByText(/Used 30 of 50 credits · 20 left/);

    summary = FAILED;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh usage data' }));

    expect(await screen.findByText(/\(refresh failed\)/)).toBeTruthy();
    expect(screen.getAllByText(/Used 30 of 50 credits · 20 left/).length).toBeGreaterThan(0);
  });

  it('refreshes this month’s allowances along with the plan windows', async () => {
    const requested = stubUsageApi({
      summary: () => answer(proSummary()),
      limits: () => answer(monthlyLimits()),
      history: () => FAILED,
    });
    renderSection();
    await screen.findByText('1 of 3 at a time');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh usage data' }));

    await waitFor(() => {
      expect(requested.filter((url) => url === '/api/usage')).toHaveLength(2);
      expect(requested.filter((url) => url === '/api/usage/limits')).toHaveLength(2);
    });
  });

  it('never renders dollars, tokens, or internal ledger operands', async () => {
    stubUsageApi({
      summary: () => answer(proSummary()),
      limits: () => answer(monthlyLimits()),
      history: () => FAILED,
    });
    renderSection();
    await screen.findByText('Credit balances');
    expect(screen.queryByText(/monthly credit allowance/i)).toBeNull();
    expect(screen.queryByText(/\$\d/)).toBeNull();
    expect(screen.queryByText(/tokens/i)).toBeNull();
    expect(screen.queryByText(/microusd|cents/i)).toBeNull();
  });

  it('drops the plan chip, already shown on Billing', async () => {
    stubUsageApi({ summary: () => answer(freeSummary()), limits: () => answer(QUIET_MONTH) });
    renderSection();
    await screen.findByText(managedUsageBucketLabel('session'));
    expect(screen.queryByText('Free')).toBeNull();
    expect(screen.queryByText('Pro')).toBeNull();
  });
});

describe('UsageSection stated in credits', () => {
  function stubPro(credits: Record<string, unknown> = {}) {
    return stubUsageApi({
      summary: () => answer(proSummary(credits)),
      limits: () => answer(monthlyLimits()),
      history: () => FAILED,
    });
  }

  it('leads with the plan allowance in credits', async () => {
    stubPro();
    renderSection();
    expect(
      await screen.findByText(
        'Pro · 2,000 credits/month · 500 credits/week · 50 credits per 5 hours',
      ),
    ).toBeTruthy();
  });

  it('labels every bar with the amount used, the allowance, what is left and when it resets', async () => {
    stubPro();
    renderSection();
    await screen.findByText(managedUsageBucketLabel('session'));
    expect(
      screen.getAllByText(/Used 30 of 50 credits · 20 left · Resets in/).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/Used 200 of 500 credits · 300 left/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Used 15\.3 of 150 credits · 134\.8 left/).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText(/Used 400 of 2,000 credits · 1,600 left/).length).toBeGreaterThan(0);
  });

  it('keeps the bar fill on the percentage the server sends', async () => {
    stubPro();
    renderSection();
    await screen.findByText(managedUsageBucketLabel('session'));
    expect(barFills()).toEqual(['60', '40', '10', '20']);
  });

  it('shows bonus and purchased balances in the order they are spent, and no currency anywhere', async () => {
    stubPro();
    renderSection();

    expect(await screen.findByText('Credit balances')).toBeTruthy();
    expect(
      screen.getByText(
        'Once a plan limit is reached, bonus credits are used first, soonest to expire, then purchased credits.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('60 credits')).toBeTruthy();
    expect(screen.getByText(/^Next expiry /)).toBeTruthy();
    expect(screen.getByText('423.7 credits')).toBeTruthy();
    expect(screen.getByText("Purchased credits don't expire.")).toBeTruthy();
    expect(screen.queryByText(/\$\d/)).toBeNull();
  });

  it('says which purchased credits expire where local law requires it', async () => {
    stubPro({
      purchase_expiry: { expiring_credits: 100, next_expiry_at: '2027-03-01T00:00:00.000Z' },
    });
    renderSection();

    expect(
      await screen.findByText(
        /^100 credits expire as local law requires where they were bought, the next on .+\. The rest don't expire\.$/,
      ),
    ).toBeTruthy();
  });

  it('says None for an empty balance', async () => {
    stubPro({
      bonus: { remaining: 0, next_expiry_at: null },
      purchased: { remaining: 0, overage_enabled: false },
    });
    renderSection();

    await screen.findByText('Credit balances');
    expect(screen.getAllByText('None')).toHaveLength(2);
    expect(
      screen.getByText(
        'Credits from referrals and promotions show here with the date they expire.',
      ),
    ).toBeTruthy();
  });

  it('admits a balance it could not read rather than reporting none', async () => {
    stubPro({ bonus: null, purchased: { remaining: null, overage_enabled: true } });
    renderSection();

    expect(
      await screen.findByText('Could not read your bonus credits. Refresh to retry.'),
    ).toBeTruthy();
    expect(
      screen.getByText('Could not read your purchased credits. Refresh to retry.'),
    ).toBeTruthy();
    expect(screen.getAllByText('Unavailable')).toHaveLength(2);
    expect(screen.queryByText('None')).toBeNull();
  });
});

describe('UsageSection this month', () => {
  it('counts this month’s metered units, images and the responses running now', async () => {
    stubUsageApi({
      summary: () => answer(proSummary()),
      limits: () => answer(monthlyLimits()),
      history: () => FAILED,
    });
    renderSection();

    expect(await screen.findByText('12 of 60 minutes used')).toBeTruthy();
    expect(screen.getByText('This month')).toBeTruthy();
    expect(screen.getByText('3 requests, no monthly cap')).toBeTruthy();
    expect(screen.queryByText('Video')).toBeNull();
    expect(screen.getByText('4 images · 12 credits')).toBeTruthy();
    expect(screen.getByText('Responses running now')).toBeTruthy();
    expect(screen.getByText('1 of 3 at a time')).toBeTruthy();
  });

  it('leaves the card out for a month with nothing metered', async () => {
    stubUsageApi({
      summary: () => answer(proSummary()),
      limits: () => answer({ ...monthlyLimits(), ...QUIET_MONTH }),
      history: () => FAILED,
    });
    renderSection();

    await screen.findByText('Credit balances');
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(screen.queryByText('This month')).toBeNull();
    expect(screen.queryByText('Responses running now')).toBeNull();
  });

  it('admits it could not read this month’s usage and loads it on retry', async () => {
    let limits: Answer = FAILED;
    stubUsageApi({
      summary: () => answer(freeSummary()),
      limits: () => limits,
    });
    renderSection();

    expect(await screen.findByText('Could not load this month’s usage.')).toBeTruthy();
    limits = answer(monthlyLimits());
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('12 of 60 minutes used')).toBeTruthy();
    expect(screen.queryByText('Could not load this month’s usage.')).toBeNull();
  });
});

describe('UsageSection contract-priced plans', () => {
  it('directs Enterprise members to workspace usage without inventing a remaining percentage', async () => {
    const requested = stubUsageApi({
      summary: () => answer({ ...proSummary(), plan_tier: 'enterprise', credits: undefined }),
    });
    const onExit = vi.fn();
    renderSection(onExit);
    expect(
      await screen.findByText(
        'Your usage allowances and billing are set by your workspace contract.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View workspace usage' }).getAttribute('href')).toBe(
      '/workspace/usage',
    );
    expect(screen.queryByText('100% left')).toBeNull();
    expect(screen.queryAllByTestId('progress')).toHaveLength(0);
    expect(screen.queryByText('Credit balances')).toBeNull();
    expect(requested).toEqual(['/api/usage']);
    fireEvent.click(screen.getByRole('link', { name: 'View workspace usage' }));
    expect(onExit).toHaveBeenCalledOnce();
  });
});
