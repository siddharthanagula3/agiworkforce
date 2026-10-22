import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodeUsageDashboard } from './CodeUsageDashboard';

const DAY_MS = 24 * 60 * 60 * 1000;

function history(over: { requests?: number; byModel?: Array<Record<string, unknown>> } = {}) {
  const requests = over.requests ?? 12;
  return {
    userId: 'user-1',
    from: '2026-09-22T00:00:00.000Z',
    to: '2026-10-22T00:00:00.000Z',
    granularity: 'day',
    totals: { requests, inputTokens: 1_000_000, outputTokens: 200_000, credits: 34.5 },
    periods: [],
    byWorkload: [
      { key: 'code', label: 'Code', requests, inputTokens: 1, outputTokens: 1, credits: 34.5 },
    ],
    byModel: over.byModel ?? [
      {
        key: 'model-a',
        label: 'Model A',
        requests: 9,
        inputTokens: 1,
        outputTokens: 1,
        credits: 30,
      },
      {
        key: 'model-b',
        label: 'Model B',
        requests: 3,
        inputTokens: 1,
        outputTokens: 1,
        credits: 4.5,
      },
    ],
    byProject: [],
    freshness: { asOf: '2026-10-22T00:00:00.000Z', latestActivityAt: null, unsettledRequests: 0 },
  };
}

const fetchMock = vi.fn();

function respond(body: unknown, ok = true) {
  fetchMock.mockResolvedValueOnce({ ok, json: async () => body } as Response);
}

function requested(call: number): URLSearchParams {
  return new URL(String(fetchMock.mock.calls[call]?.[0]), 'http://localhost').searchParams;
}

function requestedFrom(call: number): number {
  return new Date(requested(call).get('from') ?? '').getTime();
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

  it('asks the server for Code usage only and shows its totals for the last 30 days', async () => {
    respond(history());
    render(<CodeUsageDashboard planTier="pro" />);

    const card = screen.getByTestId('code-usage-dashboard');
    expect(await within(card).findByText('12')).toBeInTheDocument();
    expect(within(card).getByText('1.2M')).toBeInTheDocument();
    expect(within(card).getByText('34.5 credits')).toBeInTheDocument();
    expect(within(card).getByText('Model A')).toBeInTheDocument();
    expect(card).not.toHaveTextContent('$');
    expect(requested(0).get('workload')).toBe('code');
    expect(screen.getByRole('button', { name: '30d' })).toHaveAttribute('aria-pressed', 'true');
    expect(Date.now() - requestedFrom(0)).toBeGreaterThanOrEqual(30 * DAY_MS - 1000);
    expect(Date.now() - requestedFrom(0)).toBeLessThan(31 * DAY_MS);
  });

  it('lists Code usage per model on the Models tab', async () => {
    const user = userEvent.setup();
    respond(history());
    render(<CodeUsageDashboard planTier="pro" />);
    await screen.findByText('12');

    await user.click(screen.getByRole('tab', { name: 'Models' }));

    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      'Model A930 credits',
      'Model B34.5 credits',
    ]);
  });

  it('refetches for the chosen range', async () => {
    const user = userEvent.setup();
    respond(history());
    respond(history({ requests: 3 }));
    render(<CodeUsageDashboard planTier="pro" />);
    await screen.findByText('12');

    await user.click(screen.getByRole('button', { name: '7d' }));

    await screen.findByText('3');
    expect(screen.getByRole('button', { name: '7d' })).toHaveAttribute('aria-pressed', 'true');
    expect(requested(1).get('workload')).toBe('code');
    expect(Date.now() - requestedFrom(1)).toBeLessThan(8 * DAY_MS);
  });

  it('says there is no Code usage instead of showing zeros', async () => {
    respond(history({ requests: 0, byModel: [] }));
    render(<CodeUsageDashboard planTier="pro" />);

    expect(await screen.findByText('No Code usage in this period.')).toBeInTheDocument();
    expect(screen.queryByText('Requests')).toBeNull();
  });

  it('offers a retry when the aggregate fails', async () => {
    const user = userEvent.setup();
    respond({}, false);
    respond(history());
    render(<CodeUsageDashboard planTier="pro" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Usage could not load.');
    await user.click(screen.getByRole('button', { name: 'Retry loading usage' }));
    expect(await screen.findByText('12')).toBeInTheDocument();
  });
});
