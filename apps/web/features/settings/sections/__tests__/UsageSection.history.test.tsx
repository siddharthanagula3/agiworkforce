import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('@agiworkforce/ui', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Progress: ({ value }: { value: number }) =>
    React.createElement('div', { 'data-testid': 'progress', 'data-value': value }),
}));

vi.mock('@shared/stores/web-auth-store', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useBillingStore: (selector: (s: unknown) => unknown) => selector({ subscription: undefined }),
}));

import { __resetManagedUsageSummaryForTest } from '@/lib/hooks/useManagedUsageSummary';
import { UsageSection } from '../UsageSection';
import { SettingsSectionNavigationProvider } from '../../components/SettingsSectionLink';

const originalFetch = global.fetch;

function summary(planTier: string) {
  const soon = new Date(Date.now() + 5 * 24 * 60 * 60_000).toISOString();
  return {
    plan_tier: planTier,
    usage_percentage: 40,
    usage_reset_at: soon,
    has_usage_remaining: true,
    period_start: new Date(Date.now() - 25 * 24 * 60 * 60_000).toISOString(),
    period_end: soon,
    subscription_status: 'active',
    session_usage_percentage: 20,
    session_reset_at: soon,
    weekly_usage_percentage: 30,
    weekly_reset_at: soon,
    flagship_weekly_usage_percentage: 10,
    flagship_weekly_reset_at: soon,
    credit_balance_cents: 0,
    overage_enabled: false,
  };
}

function history(over: Record<string, unknown> = {}) {
  return {
    userId: 'user_2abcDEF',
    from: '2026-07-24T00:00:00.000Z',
    to: '2026-08-23T00:00:00.000Z',
    totals: { requests: 9, inputTokens: 900, outputTokens: 300, costCents: 250 },
    daily: [
      { day: '2026-08-21T00:00:00.000Z', requests: 4, costCents: 100 },
      { day: '2026-08-22T00:00:00.000Z', requests: 5, costCents: 150 },
    ],
    byWorkload: [
      { key: 'work', requests: 6, inputTokens: 600, outputTokens: 200, costCents: 200 },
      { key: 'chat', requests: 3, inputTokens: 300, outputTokens: 100, costCents: 50 },
    ],
    byModel: [{ key: 'gpt-5', requests: 9, inputTokens: 900, outputTokens: 300, costCents: 250 }],
    freshness: { asOf: new Date().toISOString(), latestActivityAt: null, unsettledRequests: 2 },
    ...over,
  };
}

function stubUsageApi(planTier: string, historyResponse: () => { ok: boolean; body: unknown }) {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/api/usage/history')) {
      const response = historyResponse();
      return { ok: response.ok, json: async () => response.body } as Response;
    }
    if (url.startsWith('/api/usage')) {
      return { ok: true, json: async () => summary(planTier) } as Response;
    }
    throw new Error(`UsageSection requested an unexpected url: ${url}`);
  }) as typeof global.fetch;
}

function renderSection() {
  return render(
    <SettingsSectionNavigationProvider onNavigate={vi.fn()} onExit={vi.fn()}>
      <UsageSection />
    </SettingsSectionNavigationProvider>,
  );
}

beforeEach(() => __resetManagedUsageSummaryForTest());

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('Settings > Usage history', () => {
  it('tells a paid account what its usage went on, by product area, model and day', async () => {
    stubUsageApi('pro', () => ({ ok: true, body: history() }));
    renderSection();

    expect(await screen.findByText('Where your usage went')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('By product area')).toBeTruthy());

    expect(screen.getByText('AGI Work')).toBeTruthy();
    expect(screen.getByText('Chat')).toBeTruthy();
    expect(screen.getByText('By model')).toBeTruthy();
    expect(screen.getByText('By day')).toBeTruthy();
    expect(screen.getAllByText(/turns ·/u).length).toBeGreaterThan(0);
  });

  // The labels themselves are rendered in the reader's own time zone, which the
  // host supplies, so the assertion is on the ORDER of the two days rather than
  // on the text a given zone produces for them.
  it('shows the newest day first so the most recent spend is not below the fold', async () => {
    stubUsageApi('pro', () => ({ ok: true, body: history() }));
    const { container } = renderSection();

    await waitFor(() => expect(screen.getByText('By day')).toBeTruthy());
    const rendered = (container.textContent ?? '').split('By day')[1] ?? '';
    const earlier = rendered.indexOf(
      new Date('2026-08-21T00:00:00.000Z').toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      }),
    );
    const later = rendered.indexOf(
      new Date('2026-08-22T00:00:00.000Z').toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      }),
    );
    expect(later).toBeGreaterThanOrEqual(0);
    expect(earlier).toBeGreaterThan(later);
  });

  it('says turns are still settling rather than presenting the total as final', async () => {
    stubUsageApi('pro', () => ({ ok: true, body: history() }));
    renderSection();

    expect(
      await screen.findByText('2 turns are still settling and are not counted above.'),
    ).toBeTruthy();
  });

  it('distinguishes an account with no settled usage from a failed read', async () => {
    stubUsageApi('pro', () => ({
      ok: true,
      body: history({
        totals: { requests: 0, inputTokens: 0, outputTokens: 0, costCents: 0 },
        daily: [],
        byWorkload: [],
        byModel: [],
      }),
    }));
    renderSection();

    expect(await screen.findByText('No settled usage in the last 30 days.')).toBeTruthy();
    expect(screen.queryByText('By product area')).toBeNull();
  });

  it('admits it could not read the history and offers a retry', async () => {
    stubUsageApi('pro', () => ({ ok: false, body: {} }));
    renderSection();

    expect(await screen.findByText('Could not load your usage history.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.queryByText('No settled usage in the last 30 days.')).toBeNull();
  });

  it('refuses a body that is not this account usage history rather than rendering it', async () => {
    stubUsageApi('pro', () => ({ ok: true, body: summary('pro') }));
    renderSection();

    expect(await screen.findByText('Could not load your usage history.')).toBeTruthy();
  });

  it('never states a credit figure for a free account', async () => {
    stubUsageApi('free', () => {
      throw new Error('a free account must not request usage history');
    });
    renderSection();

    await waitFor(() => expect(screen.getByText('Usage')).toBeTruthy());
    expect(screen.queryByText('Where your usage went')).toBeNull();
  });
});
