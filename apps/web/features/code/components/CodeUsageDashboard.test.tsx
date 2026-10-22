import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodeUsageDashboard } from './CodeUsageDashboard';

const DAY_MS = 24 * 60 * 60 * 1000;

function history(byWorkload: Array<Record<string, unknown>>) {
  return {
    userId: 'user-1',
    from: '2026-09-22T00:00:00.000Z',
    to: '2026-10-22T00:00:00.000Z',
    granularity: 'day',
    totals: { requests: 50, inputTokens: 900_000, outputTokens: 100_000, credits: 400 },
    periods: [],
    byWorkload,
    byModel: [
      { key: 'other', label: null, requests: 50, inputTokens: 1, outputTokens: 1, credits: 1 },
    ],
    byProject: [],
    freshness: { asOf: '2026-10-22T00:00:00.000Z', latestActivityAt: null, unsettledRequests: 0 },
  };
}

const CODE_ROW = {
  key: 'code',
  label: 'Code',
  requests: 12,
  inputTokens: 1_000_000,
  outputTokens: 200_000,
  credits: 34.5,
};
const CHAT_ROW = {
  key: 'chat',
  label: 'Chat',
  requests: 38,
  inputTokens: 5,
  outputTokens: 5,
  credits: 365.5,
};

const fetchMock = vi.fn();

function respond(body: unknown, ok = true) {
  fetchMock.mockResolvedValueOnce({ ok, json: async () => body } as Response);
}

function requestedFrom(call: number): number {
  const url = new URL(String(fetchMock.mock.calls[call]?.[0]), 'http://localhost');
  return new Date(url.searchParams.get('from') ?? '').getTime();
}

describe('CodeUsageDashboard', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([['free'], [null]])('renders nothing and fetches nothing for plan %s', (planTier) => {
    const { container } = render(<CodeUsageDashboard planTier={planTier} />);
    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows only the Code workload totals for the last 30 days', async () => {
    respond(history([CHAT_ROW, CODE_ROW]));
    render(<CodeUsageDashboard planTier="pro" />);

    const card = await screen.findByTestId('code-usage-dashboard');
    await waitFor(() => expect(within(card).getByText('12')).toBeInTheDocument());
    expect(within(card).getByText('1.2M')).toBeInTheDocument();
    expect(within(card).getByText('34.5 credits')).toBeInTheDocument();
    expect(card).not.toHaveTextContent('38');
    expect(card).not.toHaveTextContent('$');
    expect(screen.getByRole('button', { name: '30d' })).toHaveAttribute('aria-pressed', 'true');
    expect(Date.now() - requestedFrom(0)).toBeGreaterThanOrEqual(30 * DAY_MS - 1000);
    expect(Date.now() - requestedFrom(0)).toBeLessThan(31 * DAY_MS);
  });

  it('refetches for the chosen range', async () => {
    const user = userEvent.setup();
    respond(history([CODE_ROW]));
    respond(history([{ ...CODE_ROW, requests: 3 }]));
    render(<CodeUsageDashboard planTier="pro" />);
    await screen.findByText('12');

    await user.click(screen.getByRole('button', { name: '7d' }));

    await screen.findByText('3');
    expect(screen.getByRole('button', { name: '7d' })).toHaveAttribute('aria-pressed', 'true');
    expect(Date.now() - requestedFrom(1)).toBeLessThan(8 * DAY_MS);
  });

  it('says there is no Code usage instead of showing zeros', async () => {
    respond(history([CHAT_ROW]));
    render(<CodeUsageDashboard planTier="pro" />);

    expect(await screen.findByText('No Code usage in this period.')).toBeInTheDocument();
    expect(screen.queryByText('Requests')).toBeNull();
  });

  it('offers a retry when the aggregate fails', async () => {
    const user = userEvent.setup();
    respond({}, false);
    respond(history([CODE_ROW]));
    render(<CodeUsageDashboard planTier="pro" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Usage could not load.');
    await user.click(screen.getByRole('button', { name: 'Retry loading usage' }));
    expect(await screen.findByText('12')).toBeInTheDocument();
  });
});
