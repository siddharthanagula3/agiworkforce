import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import EconomicsSummaryPanel from './EconomicsSummaryPanel';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

function group(legacyRows: number) {
  return {
    key: 'total',
    events: 1,
    legacyRows,
    canonicalValueMicrousd: 0,
    canonicalValueCredits: 0,
    cogs: {
      totalMicrousd: 0,
      byClassMicrousd: {
        model: 0,
        search: 0,
        sandbox: 0,
        voice: 0,
        media: 0,
        infrastructure: 0,
      },
    },
    paymentFeesMicrousd: 0,
    storeCommission: { totalMicrousd: 0 },
    revenue: null,
    contributionMicrousd: null,
    contributionMargin: null,
    canonicalValueToCogsRatio: null,
  };
}

function summary(from: string, to: string, legacyRows: number, groupBy = 'total') {
  return {
    from: `${from}T00:00:00.000Z`,
    to: `${to}T00:00:00.000Z`,
    groupBy,
    subscriptionRevenueBasis: 'cash',
    groups: [],
    totals: group(legacyRows),
    reconciliation: { available: true, gaps: [] },
  };
}

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as unknown as Response;
}

function deferredSummaries() {
  const pending = new Map<string, (response: Response) => void>();
  mocks.fetch.mockImplementation(
    (url: string) =>
      new Promise<Response>((resolve) => {
        const params = new URL(url, 'https://operator.test').searchParams;
        pending.set(`${params.get('from')}|${params.get('group_by')}`, resolve);
      }),
  );
  return pending;
}

describe('EconomicsSummaryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mocks.fetch);
  });

  it('keeps the selected period’s totals when an older period’s read finishes last', async () => {
    const pending = deferredSummaries();
    const { container } = render(<EconomicsSummaryPanel />);
    await waitFor(() => expect(pending.size).toBe(1));
    const [firstKey] = [...pending.keys()];
    const firstFrom = firstKey!.split('|')[0]!;
    const to = (container.querySelectorAll('input[type="date"]')[1] as HTMLInputElement).value;

    fireEvent.change(container.querySelector('input[type="date"]')!, {
      target: { value: '2026-01-01' },
    });
    await waitFor(() => expect(pending.size).toBe(2));

    pending.get('2026-01-01|total')!(jsonResponse(summary('2026-01-01', to, 7)));
    expect(await screen.findByText(/without a customer figure: 7\./)).toBeInTheDocument();

    pending.get(`${firstFrom}|total`)!(jsonResponse(summary(firstFrom, to, 3)));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByText(/without a customer figure: 7\./)).toBeInTheDocument();
    expect(screen.queryByText(/without a customer figure: 3\./)).toBeNull();
    expect(screen.queryByText('Reading the economics summary…')).toBeNull();
  });

  it('does not let an older failed read replace the selected period’s totals', async () => {
    const pending = deferredSummaries();
    const { container } = render(<EconomicsSummaryPanel />);
    await waitFor(() => expect(pending.size).toBe(1));
    const [firstKey] = [...pending.keys()];
    const firstFrom = firstKey!.split('|')[0]!;
    const to = (container.querySelectorAll('input[type="date"]')[1] as HTMLInputElement).value;

    fireEvent.change(container.querySelector('input[type="date"]')!, {
      target: { value: '2026-01-01' },
    });
    await waitFor(() => expect(pending.size).toBe(2));

    pending.get('2026-01-01|total')!(jsonResponse(summary('2026-01-01', to, 7)));
    expect(await screen.findByText(/without a customer figure: 7\./)).toBeInTheDocument();

    pending.get(`${firstFrom}|total`)!(jsonResponse({ error: { message: 'Busy.' } }, 503));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText(/without a customer figure: 7\./)).toBeInTheDocument();
  });

  it('refuses a summary whose period does not match the selected one', async () => {
    const pending = deferredSummaries();
    const { container } = render(<EconomicsSummaryPanel />);
    await waitFor(() => expect(pending.size).toBe(1));
    const [firstKey] = [...pending.keys()];
    const to = (container.querySelectorAll('input[type="date"]')[1] as HTMLInputElement).value;

    pending.get(firstKey!)!(jsonResponse(summary('2025-01-01', to, 3)));

    expect(await screen.findByRole('alert')).toHaveTextContent('different period');
    expect(screen.queryByText(/without a customer figure: 3\./)).toBeNull();
  });
});
