import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
type ScanModule0 = typeof import('@/lib/client/csrf');

vi.mock('@agiworkforce/ui', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Progress: ({ value }: { value: number }) =>
    React.createElement('div', { 'data-testid': 'progress', 'data-value': value }),
}));

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  addCsrfHeaders: vi.fn(async (headers: Record<string, string>) => ({
    ...headers,
    'x-csrf-token': 'csrf-token',
  })),
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

function row(key: string, requests: number, credits: number, label: string | null = null) {
  return {
    key,
    label,
    requests,
    inputTokens: requests * 100,
    outputTokens: requests * 30,
    credits,
  };
}

function history(over: Record<string, unknown> = {}) {
  return {
    userId: 'user_2abcDEF',
    from: '2026-07-24T00:00:00.000Z',
    to: '2026-08-23T00:00:00.000Z',
    granularity: 'day',
    totals: { requests: 9, inputTokens: 900, outputTokens: 270, credits: 12.5 },
    periods: [
      { start: '2026-08-21T00:00:00.000Z', requests: 4, credits: 5 },
      { start: '2026-08-22T00:00:00.000Z', requests: 5, credits: 7.5 },
    ],
    byWorkload: [row('work', 6, 10), row('chat', 3, 2.5)],
    byModel: [row('fixture-model', 7, 10.5), row('second-fixture-model', 2, 2)],
    byProject: [row('project-1', 4, 6, 'Launch plan'), row('project-2', 1, 0.5)],
    freshness: { asOf: new Date().toISOString(), latestActivityAt: null, unsettledRequests: 2 },
    ...over,
  };
}

interface Answer {
  ok: boolean;
  body: unknown;
}

function stubUsageApi(
  planTier: string,
  historyResponse: (url: string) => Answer,
  report?: (init: RequestInit) => Answer,
) {
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const path = url.split('?')[0];
    let response: Answer;
    if (path === '/api/usage/history') response = historyResponse(url);
    else if (path === '/api/usage/limits') response = { ok: false, body: {} };
    else if (path === '/api/usage') response = { ok: true, body: summary(planTier) };
    else if (path === '/api/usage/discrepancy' && report && init) response = report(init);
    else throw new Error(`UsageSection requested an unexpected url: ${url}`);
    return { ok: response.ok, json: async () => response.body } as Response;
  }) as typeof global.fetch;
}

function renderSection() {
  return render(
    <SettingsSectionNavigationProvider onNavigate={vi.fn()} onExit={vi.fn()}>
      <UsageSection />
    </SettingsSectionNavigationProvider>,
  );
}

function historyCard(): HTMLElement {
  const heading = screen.getByRole('heading', { name: 'Where your usage went' });
  return heading.closest('section') as HTMLElement;
}

beforeEach(() => __resetManagedUsageSummaryForTest());

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('Settings > Usage history', () => {
  it('tells a paid account what its usage went on, by day, product area, model and project', async () => {
    stubUsageApi('pro', () => ({ ok: true, body: history() }));
    renderSection();

    expect(await screen.findByText('Where your usage went')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('By product area')).toBeTruthy());

    expect(screen.getByText('9 requests · 12.5 credits')).toBeTruthy();
    expect(screen.getByText('By day')).toBeTruthy();
    expect(screen.getByText('AGI Work')).toBeTruthy();
    expect(screen.getByText('Chat')).toBeTruthy();
    expect(screen.getByText('6 requests · 10 credits')).toBeTruthy();
    expect(screen.getByText('By model')).toBeTruthy();
    expect(screen.getByText('fixture-model')).toBeTruthy();
    expect(screen.getByText('7 requests · 10.5 credits')).toBeTruthy();
    expect(screen.getByText('By project')).toBeTruthy();
    expect(screen.getByText('Launch plan')).toBeTruthy();
    expect(screen.getByText('Project not in this workspace')).toBeTruthy();
    expect(screen.getByText('1 request · 0.5 credits')).toBeTruthy();
    expect(historyCard().textContent).not.toMatch(/\$|tokens/iu);
  });

  it('shows the newest day first so the most recent spend is not below the fold', async () => {
    stubUsageApi('pro', () => ({ ok: true, body: history() }));
    renderSection();

    await waitFor(() => expect(screen.getByText('By day')).toBeTruthy());
    const rendered = (historyCard().textContent ?? '').split('By day')[1] ?? '';
    const label = (iso: string) =>
      new Date(iso).toLocaleDateString(undefined, {
        timeZone: 'UTC',
        month: 'short',
        day: 'numeric',
      });
    const earlier = rendered.indexOf(label('2026-08-21T00:00:00.000Z'));
    const later = rendered.indexOf(label('2026-08-22T00:00:00.000Z'));
    expect(later).toBeGreaterThanOrEqual(0);
    expect(earlier).toBeGreaterThan(later);
  });

  it('regroups the history by week when asked, and exports the same grouping', async () => {
    const requested: string[] = [];
    stubUsageApi('pro', (url) => {
      requested.push(url);
      return url.endsWith('granularity=week')
        ? {
            ok: true,
            body: history({
              granularity: 'week',
              periods: [{ start: '2026-08-17T00:00:00.000Z', requests: 9, credits: 12.5 }],
            }),
          }
        : { ok: true, body: history() };
    });
    renderSection();
    await screen.findByText('By day');

    fireEvent.click(screen.getByRole('button', { name: 'Weeks' }));

    expect(await screen.findByText('By week')).toBeTruthy();
    expect(screen.getByText(/^Week of /)).toBeTruthy();
    expect(requested).toEqual([
      '/api/usage/history?granularity=day',
      '/api/usage/history?granularity=week',
    ]);
    expect(screen.getByRole('link', { name: 'Download CSV' })).toHaveAttribute(
      'href',
      '/api/usage/export?granularity=week',
    );
  });

  it('says requests are still settling rather than presenting the total as final', async () => {
    stubUsageApi('pro', () => ({ ok: true, body: history() }));
    renderSection();

    expect(
      await screen.findByText('2 requests are still settling and not counted above.'),
    ).toBeTruthy();
  });

  it('distinguishes an account with no settled usage from a failed read', async () => {
    stubUsageApi('pro', () => ({
      ok: true,
      body: history({
        totals: { requests: 0, inputTokens: 0, outputTokens: 0, credits: 0 },
        periods: [],
        byWorkload: [],
        byModel: [],
        byProject: [],
      }),
    }));
    renderSection();

    expect(await screen.findByText('No settled usage in this period.')).toBeTruthy();
    expect(screen.queryByText('By product area')).toBeNull();
    expect(screen.queryByText('Could not load your usage history.')).toBeNull();
  });

  it('admits it could not read the history and offers a retry', async () => {
    let failing = true;
    stubUsageApi('pro', () => (failing ? { ok: false, body: {} } : { ok: true, body: history() }));
    renderSection();

    expect(await screen.findByText('Could not load your usage history.')).toBeTruthy();
    expect(screen.queryByText('No settled usage in this period.')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Download CSV' })).toBeNull();

    failing = false;
    const retry = historyCard().querySelector('button:not([aria-pressed])') as HTMLButtonElement;
    expect(retry.textContent).toBe('Try again');
    fireEvent.click(retry);

    expect(await screen.findByText('9 requests · 12.5 credits')).toBeTruthy();
  });

  it('refuses a body that is not this account usage history rather than rendering it', async () => {
    stubUsageApi('pro', () => ({ ok: true, body: summary('pro') }));
    renderSection();

    expect(await screen.findByText('Could not load your usage history.')).toBeTruthy();
  });

  it('files a billing report for the window shown, with the invoice it names', async () => {
    const report = vi.fn((_init: RequestInit) => ({
      ok: true,
      body: { ticket: { subject: 'Billing report: Jul 24 to Aug 23' }, staffNotified: true },
    }));
    stubUsageApi('pro', () => ({ ok: true, body: history() }), report);
    renderSection();
    await screen.findByText('By day');

    fireEvent.click(screen.getByRole('button', { name: 'Report a billing problem' }));
    fireEvent.change(screen.getByLabelText('Invoice or charge reference (optional)'), {
      target: { value: 'INV-2044' },
    });
    fireEvent.change(screen.getByLabelText('What looks wrong'), {
      target: { value: '  Charged twice for one turn  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'File report' }));

    expect(
      await screen.findByText(
        'Report filed as “Billing report: Jul 24 to Aug 23”, with the usage record for that period attached.',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText('Support has been notified. Replies and status updates appear under Help.'),
    ).toBeTruthy();
    const [init] = report.mock.calls[0] as [RequestInit];
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      from: '2026-07-24T00:00:00.000Z',
      to: '2026-08-23T00:00:00.000Z',
      message: 'Charged twice for one turn',
      reference: 'INV-2044',
    });
  });

  it('files nothing until the report says what looks wrong', async () => {
    const report = vi.fn();
    stubUsageApi('pro', () => ({ ok: true, body: history() }), report);
    renderSection();
    await screen.findByText('By day');

    fireEvent.click(screen.getByRole('button', { name: 'Report a billing problem' }));
    fireEvent.click(screen.getByRole('button', { name: 'File report' }));

    expect(
      await screen.findByText('Describe what looks wrong so support knows what to check.'),
    ).toBeTruthy();
    expect(report).not.toHaveBeenCalled();
  });

  it('shows the reason a report was refused', async () => {
    stubUsageApi(
      'pro',
      () => ({ ok: true, body: history() }),
      () => ({ ok: false, body: { error: { message: 'That period is outside your history.' } } }),
    );
    renderSection();
    await screen.findByText('By day');

    fireEvent.click(screen.getByRole('button', { name: 'Report a billing problem' }));
    fireEvent.change(screen.getByLabelText('What looks wrong'), {
      target: { value: 'Missing refund' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'File report' }));

    expect(await screen.findByText('That period is outside your history.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'File report' })).toBeTruthy();
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
