import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { managedUsageBucketLabel } from '@agiworkforce/types';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';

vi.mock('@agiworkforce/ui', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Progress: ({ value }: { value: number }) =>
    React.createElement('div', { 'data-testid': 'progress', 'data-value': value }),
}));

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: Record<string, string> = {}) => ({
    ...headers,
    'x-csrf-token': 'csrf-test',
  })),
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

function spendState(over: Record<string, unknown> = {}) {
  return {
    state: {
      configured: false,
      monthlyCapCredits: null,
      spentCredits: 0,
      remainingCredits: null,
      overCap: false,
      resetsAt: '2026-11-01T00:00:00.000Z',
      ...over,
    },
  };
}

function autoReloadSettings(enabled: boolean) {
  return {
    enabled,
    thresholdCredits: 500,
    amountUsd: 50,
    paymentMethod: null,
    lastFailure: null,
    consent: null,
  };
}

interface Write {
  method: string;
  body: unknown;
}

interface UsageApi {
  summary: () => Answer;
  limits?: () => Answer;
  history?: () => Answer;
  spendLimit?: () => Answer;
  spendLimitWrite?: (write: Write) => Answer;
  autoReload?: () => Answer;
}

const writes: Write[] = [];

function stubUsageApi(api: UsageApi): string[] {
  const requested: string[] = [];
  writes.length = 0;
  const spendLimit = api.spendLimit ?? (() => answer(spendState()));
  const autoReload = api.autoReload ?? (() => answer(autoReloadSettings(false)));
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const path = url.split('?')[0];
    if (method !== 'GET') {
      if (path !== '/api/settings/spend-limit' || !api.spendLimitWrite) {
        throw new Error(`UsageSection sent an unexpected ${method} to ${url}`);
      }
      const write = {
        method,
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      };
      writes.push(write);
      const { ok, body } = api.spendLimitWrite(write);
      return { ok, json: async () => body } as Response;
    }
    requested.push(url);
    const route =
      path === '/api/usage'
        ? api.summary
        : path === '/api/usage/limits'
          ? api.limits
          : path === '/api/usage/history'
            ? api.history
            : path === '/api/settings/spend-limit'
              ? spendLimit
              : path === '/api/billing/auto-reload'
                ? autoReload
                : undefined;
    if (!route) throw new Error(`UsageSection requested an unexpected url: ${url}`);
    const { ok, body } = route();
    return { ok, json: async () => body } as Response;
  }) as unknown as typeof fetch;
  return requested;
}

function renderSection(onExit = vi.fn(), onNavigate = vi.fn()) {
  return render(
    <SettingsSectionNavigationProvider onNavigate={onNavigate} onExit={onExit}>
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
  it('shows a free account an upgrade prompt and no usage meters', async () => {
    const requested = stubUsageApi({
      summary: () => answer(freeSummary()),
      limits: () => answer(monthlyLimits({ voiceMinuteCredits: 13.05 })),
    });
    renderSection();

    expect(
      await screen.findByRole('heading', { name: 'Upgrade for higher capacity' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Upgrade' })).toBeTruthy();
    expect(screen.queryAllByTestId('progress')).toHaveLength(0);
    expect(screen.queryByText('Plan usage limits')).toBeNull();
    expect(screen.queryByText(/credits\/month/)).toBeNull();
    expect(screen.queryByText(/Used \d/)).toBeNull();
    expect(screen.queryByText(managedUsageBucketLabel('session'))).toBeNull();
    expect(screen.queryByText(managedUsageBucketLabel('weekly'))).toBeNull();
    expect(screen.queryByText(managedUsageBucketLabel('period'))).toBeNull();
    expect(screen.queryByTestId('usage-voice-estimate')).toBeNull();
    expect(screen.queryByText('Responses running now')).toBeNull();
    expect(screen.queryByText('Credit balances')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Refresh usage data' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Buy credits' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Billing history' })).toBeNull();
    expect(screen.queryByTestId('usage-status')).toBeNull();
    expect(requested).not.toContain('/api/usage/limits');
    expect(screen.queryByText('Monthly spend limit')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Manage' })).toBeNull();
    expect(requested).not.toContain('/api/settings/spend-limit');
    expect(requested).not.toContain('/api/billing/auto-reload');
  });

  it('says the billing period lapsed instead of showing a full allowance it will not honour', async () => {
    stubUsageApi({
      summary: () =>
        answer({
          ...proSummary({ monthly: creditWindow(2_000, 0) }),
          usage_percentage: 0,
          usage_allocation: 'pending',
          has_usage_remaining: false,
          period_end: inDays(-0.1),
          usage_reset_at: inDays(-0.1),
        }),
      limits: () => answer(monthlyLimits()),
    });
    renderSection();

    expect(
      await screen.findByText(
        'Your billing period ended and has not renewed yet, so there are no credits to use. Check Billing.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/2,000 left|0 of 2,000/)).toBeNull();
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
    await screen.findByRole('heading', { name: 'Upgrade for higher capacity' });
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
      summary: () => answer(proSummary()),
      limits: () => limits,
      history: () => FAILED,
    });
    renderSection();

    const failure = await screen.findByText('Could not load this month’s usage.');
    limits = answer(monthlyLimits());
    fireEvent.click(
      within(failure.closest('section') as HTMLElement).getByRole('button', { name: 'Try again' }),
    );

    expect(await screen.findByText('12 of 60 minutes used')).toBeTruthy();
    expect(screen.queryByText('Could not load this month’s usage.')).toBeNull();
  });
});

describe('UsageSection voice estimate', () => {
  it('estimates the voice minutes the tightest window buys at the price the server quotes', async () => {
    stubUsageApi({
      summary: () => answer(proSummary()),
      limits: () => answer(monthlyLimits({ voiceMinuteCredits: 13.05 })),
      history: () => FAILED,
    });
    renderSection();

    const row = await screen.findByTestId('usage-voice-estimate');
    expect(row.textContent).toContain("About 1 minute of voice left at today's price");
  });

  it('says when the shared budget has no voice left, and shows nothing without a price', async () => {
    stubUsageApi({
      summary: () => answer(proSummary({ five_hour: creditWindow(50, 50) })),
      limits: () => answer(monthlyLimits({ voiceMinuteCredits: 13.05 })),
      history: () => FAILED,
    });
    renderSection();

    expect((await screen.findByTestId('usage-voice-estimate')).textContent).toContain(
      'No voice left until a limit above resets',
    );
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

describe('UsageSection status, buy credits and billing links', () => {
  function stubWith(summary: Record<string, unknown>) {
    stubUsageApi({
      summary: () => answer(summary),
      limits: () => answer(monthlyLimits()),
      history: () => FAILED,
    });
  }

  it('says the account is on track while usage is below the warning level', async () => {
    stubWith(proSummary());
    renderSection();
    expect((await screen.findByTestId('usage-status')).textContent).toMatch(/^On track\./);
  });

  it('says there is no usage yet when every limit is untouched', async () => {
    stubWith({
      ...proSummary(),
      usage_percentage: 0,
      session_usage_percentage: 0,
      weekly_usage_percentage: 0,
      flagship_weekly_usage_percentage: 0,
    });
    renderSection();
    expect((await screen.findByTestId('usage-status')).textContent).toMatch(/^No usage yet\./);
  });

  it('warns near a limit and reports a reached one', async () => {
    stubWith({ ...proSummary(), weekly_usage_percentage: 92 });
    const first = renderSection();
    expect((await screen.findByTestId('usage-status')).textContent).toMatch(/^Getting close\./);
    first.unmount();
    __resetManagedUsageSummaryForTest();

    stubWith({ ...proSummary(), session_usage_percentage: 100 });
    renderSection();
    expect((await screen.findByTestId('usage-status')).textContent).toMatch(/^Limit reached\./);
  });

  it('shows a full session as red text with the reset time', async () => {
    stubWith({ ...proSummary(), session_usage_percentage: 100 });
    renderSection();
    const label = (await screen.findAllByText('100% used'))[0]!;
    expect(label.getAttribute('style')).toContain('var(--chat-destructive-text)');
    expect(screen.getAllByText(/^Resets at /).length).toBeGreaterThan(0);
  });

  it('opens Billing from the Buy credits pill and the billing history link', async () => {
    stubWith(proSummary());
    const onNavigate = vi.fn();
    renderSection(vi.fn(), onNavigate);
    fireEvent.click(await screen.findByRole('button', { name: 'Buy credits' }));
    fireEvent.click(screen.getByRole('button', { name: 'Billing history' }));
    expect(onNavigate).toHaveBeenNthCalledWith(1, 'billing');
    expect(onNavigate).toHaveBeenNthCalledWith(2, 'billing');
    expect(screen.getByText('Learn more about usage limits')).toBeTruthy();
  });
});

describe('UsageSection monthly spend limit', () => {
  function stubSpend(api: Partial<UsageApi> = {}) {
    return stubUsageApi({
      summary: () => answer(proSummary()),
      limits: () => answer(monthlyLimits()),
      history: () => FAILED,
      ...api,
    });
  }

  function spendCard(): HTMLElement {
    return screen.getByRole('heading', { name: 'Monthly spend limit' }).closest('section')!;
  }

  it('shows no limit and the auto-reload state as a link to Billing', async () => {
    stubSpend();
    const onNavigate = vi.fn();
    renderSection(vi.fn(), onNavigate);

    const status = await screen.findByTestId('usage-spend-limit-status');
    expect(status.textContent).toBe('No limit set · Auto-reload off');
    expect(within(spendCard()).getByRole('button', { name: 'Manage' })).toBeTruthy();
    fireEvent.click(within(status).getByRole('button', { name: 'Auto-reload off' }));
    expect(onNavigate).toHaveBeenCalledWith('billing');
  });

  it('shows credits used against the limit, in credits only, and a reached limit in red', async () => {
    stubSpend({
      spendLimit: () =>
        answer(
          spendState({
            configured: true,
            monthlyCapCredits: 2_000,
            spentCredits: 2_000,
            remainingCredits: 0,
            overCap: true,
          }),
        ),
      autoReload: () => answer(autoReloadSettings(true)),
    });
    renderSection();

    const status = await screen.findByTestId('usage-spend-limit-status');
    expect(status.textContent).toMatch(/^2,000 credits of 2,000 credits used this month · /);
    expect(status.textContent).toContain('Auto-reload on');
    const reached = within(spendCard()).getByText(/^Limit reached\./);
    expect(reached.getAttribute('style')).toContain('var(--chat-destructive-text)');
    expect(spendCard().textContent).not.toMatch(/\$|USD|dollar/i);
  });

  it('saves a new limit through Manage and shows what the server saved', async () => {
    let current = spendState();
    stubSpend({
      spendLimit: () => answer(current),
      spendLimitWrite: (write) => {
        current = spendState({
          configured: true,
          monthlyCapCredits: (write.body as { monthlyCapCredits: number }).monthlyCapCredits,
          spentCredits: 120,
          remainingCredits: 1_380,
        });
        return answer(current);
      },
    });
    renderSection();

    fireEvent.click(await within(await waitForCard()).findByRole('button', { name: 'Manage' }));
    fireEvent.change(screen.getByLabelText('Monthly limit in credits'), {
      target: { value: '1500' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save limit' }));

    await waitFor(() =>
      expect(screen.getByTestId('usage-spend-limit-status').textContent).toMatch(
        /^120 credits of 1,500 credits used this month/,
      ),
    );
    expect(writes).toEqual([{ method: 'PUT', body: { monthlyCapCredits: 1500 } }]);
  });

  it('refuses a limit that is not a whole number of credits without sending it', async () => {
    stubSpend({ spendLimitWrite: () => answer(spendState()) });
    renderSection();

    fireEvent.click(await within(await waitForCard()).findByRole('button', { name: 'Manage' }));
    fireEvent.change(screen.getByLabelText('Monthly limit in credits'), {
      target: { value: '12.5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save limit' }));

    expect(await screen.findByText('Enter a whole number of credits, 1 or more.')).toBeTruthy();
    expect(writes).toEqual([]);
  });

  it('keeps the editor open and says why when the server refuses the limit', async () => {
    stubSpend({
      spendLimitWrite: () => ({
        ok: false,
        body: { error: { message: 'Enter a whole number of credits up to 1,000,000.' } },
      }),
    });
    renderSection();

    fireEvent.click(await within(await waitForCard()).findByRole('button', { name: 'Manage' }));
    fireEvent.change(screen.getByLabelText('Monthly limit in credits'), {
      target: { value: '5000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save limit' }));

    expect(
      await screen.findByText('Enter a whole number of credits up to 1,000,000.'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Monthly limit in credits')).toBeTruthy();
  });

  it('removes a saved limit', async () => {
    let current = spendState({ configured: true, monthlyCapCredits: 800, remainingCredits: 800 });
    stubSpend({
      spendLimit: () => answer(current),
      spendLimitWrite: () => {
        current = spendState();
        return answer(current);
      },
    });
    renderSection();

    fireEvent.click(await within(await waitForCard()).findByRole('button', { name: 'Manage' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove limit' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/no longer stop at 800 credits a month/)).toBeTruthy();
    expect(writes).toEqual([]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove limit' }));

    await waitFor(() =>
      expect(screen.getByTestId('usage-spend-limit-status').textContent).toMatch(/^No limit set/),
    );
    expect(writes).toEqual([{ method: 'DELETE', body: undefined }]);
  });

  it('keeps a saved limit when the removal is declined', async () => {
    stubSpend({
      spendLimit: () =>
        answer(spendState({ configured: true, monthlyCapCredits: 800, remainingCredits: 800 })),
      spendLimitWrite: () => answer(spendState()),
    });
    renderSection();

    fireEvent.click(await within(await waitForCard()).findByRole('button', { name: 'Manage' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove limit' }));
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }),
    );

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(writes).toEqual([]);
    expect(screen.getByRole('button', { name: 'Remove limit' })).toBeTruthy();
  });

  it('admits it could not read the limit and offers a retry instead of showing none', async () => {
    let spend: Answer = FAILED;
    stubSpend({ spendLimit: () => spend });
    renderSection();

    const failure = await screen.findByText('Could not load your monthly spend limit.');
    expect(screen.queryByText(/No limit set/)).toBeNull();
    spend = answer(spendState());
    fireEvent.click(
      within(failure.closest('section') as HTMLElement).getByRole('button', { name: 'Try again' }),
    );
    expect((await screen.findByTestId('usage-spend-limit-status')).textContent).toMatch(
      /^No limit set/,
    );
  });

  async function waitForCard(): Promise<HTMLElement> {
    await screen.findByTestId('usage-spend-limit-status');
    return spendCard();
  }
});
