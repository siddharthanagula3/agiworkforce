import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import OperatorCostsPanel from './OperatorCostsPanel';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

const COGS = {
  providerCostCents: 12_500,
  billedCents: 40_000,
  stripeFeeCents: 1_200,
  refundCents: 0,
  chargebackCents: 0,
  chargebackReserveCents: 0,
  discountCents: 0,
  supportAdjustmentCents: 0,
  taxCents: 0,
  grossMarginCents: 26_300,
  cacheReadUnits: 900_000,
  cacheWriteUnits: 120_000,
  compactionSavedUnits: 0,
  cacheSavingsCents: 3_400,
  cacheWritePremiumCents: 600,
};

const EMPTY_COGS = {
  ...COGS,
  providerCostCents: 0,
  billedCents: 0,
  grossMarginCents: 0,
  cacheSavingsCents: 0,
  cacheWritePremiumCents: 0,
  cacheReadUnits: 0,
  cacheWriteUnits: 0,
  stripeFeeCents: 0,
};

const TASKS = {
  deliveredTasks: 250,
  deliveredTaskCostCents: 10_000,
  costPerDeliveredTaskCents: 40,
  repeatedTasks: 12,
  repeatCostCents: 800,
  undeliveredEvents: 3,
  undeliveredCostCents: 150,
  unattributedCostCents: 90,
};

const EMPTY_TASKS = {
  deliveredTasks: 0,
  deliveredTaskCostCents: 0,
  costPerDeliveredTaskCents: null,
  repeatedTasks: 0,
  repeatCostCents: 0,
  undeliveredEvents: 0,
  undeliveredCostCents: 0,
  unattributedCostCents: 0,
};

function costWindow(days: number, populated: boolean) {
  return {
    days,
    from: '2026-08-29T00:00:00.000Z',
    to: '2026-09-05T00:00:00.000Z',
    cogs: populated ? COGS : EMPTY_COGS,
    tasks: populated ? TASKS : EMPTY_TASKS,
    activeAccounts: populated ? 50 : 0,
    costPerActiveAccountCents: populated ? 250 : null,
    costWithNoAccountCents: populated ? 400 : 0,
  };
}

const BREAKDOWN_ROW = {
  key: 'provider-one/route-one',
  requests: 120,
  cacheReadTokens: 400_000,
  cacheWriteTokens: 50_000,
  inputTokens: 900_000,
  cacheHitRate: 0.42,
  actualCostCents: 5_400,
  retailCostCents: 16_200,
  retailCoverage: 1,
  valueMultiplier: 3,
  fallbackCount: 2,
  latencyP50Ms: 820,
  latencyP95Ms: 2_100,
};

const EXPLAIN = {
  userId: 'user_operator_target',
  idempotencyKey: 'key-1',
  requestedProvider: 'provider-one',
  requestedModel: 'route-one',
  deliveredProvider: 'provider-one',
  deliveredModel: 'route-one',
  routeId: 'provider-one/route-one',
  fallbackOccurred: true,
  fallbackReason: 'primary route breaker was open',
  fallbackSequence: [],
  cacheReadTokens: 4_000,
  cacheWriteTokens: 500,
  inputTokens: 9_000,
  actualCostCents: 41,
  retailCostCents: 123,
  valueMultiplier: 3,
  latencyMs: 940,
  status: 'succeeded',
  createdAt: '2026-09-05T09:00:00.000Z',
};

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as unknown as Response;
}

function respondWith(options: { populated: boolean; rows: unknown[] }) {
  return async (url: string) => {
    if (url.startsWith('/api/operator')) {
      return jsonResponse({
        costs: { windows: [costWindow(7, options.populated), costWindow(30, options.populated)] },
      });
    }
    if (url.startsWith('/api/admin/observability/explain')) {
      return jsonResponse({ explain: EXPLAIN });
    }
    return jsonResponse({ dimension: 'route', rows: options.rows });
  };
}

describe('OperatorCostsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mocks.fetch);
  });

  it('says it is reading the ledger before either request settles', () => {
    mocks.fetch.mockImplementation(() => new Promise(() => {}));
    render(<OperatorCostsPanel />);

    expect(screen.getByText('Reading the cost ledger…')).toBeInTheDocument();
    expect(screen.getByText('Reading the breakdown…')).toBeInTheDocument();
  });

  it('renders inference cost, cost per active account and the breakdown row', async () => {
    mocks.fetch.mockImplementation(respondWith({ populated: true, rows: [BREAKDOWN_ROW] }));
    render(<OperatorCostsPanel />);

    expect(await screen.findByText('Last 7 days')).toBeInTheDocument();
    expect(screen.getByText('Last 30 days')).toBeInTheDocument();
    expect(screen.getAllByText('$125.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$263.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$2.50').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        '50 account(s) with recorded cost; $4.00 carried no account and is outside this figure',
      ).length,
    ).toBeGreaterThan(0);
    expect(await screen.findByText(BREAKDOWN_ROW.key)).toBeInTheDocument();
    expect(screen.getByText('42.0%')).toBeInTheDocument();
    expect(screen.getByText('3.00x')).toBeInTheDocument();
  });

  it('names what would populate an empty window and an empty breakdown', async () => {
    mocks.fetch.mockImplementation(respondWith({ populated: false, rows: [] }));
    render(<OperatorCostsPanel />);

    expect(
      (await screen.findAllByText(/recorded no provider spend in this window/)).length,
    ).toBeGreaterThan(0);
    expect(await screen.findByText(/nothing to break down by route/)).toBeInTheDocument();
  });

  it('surfaces a failed ledger read as an alert instead of an empty page', async () => {
    mocks.fetch.mockImplementation(async () =>
      jsonResponse({ error: { message: 'Database temporarily unavailable' } }, 503),
    );
    render(<OperatorCostsPanel />);

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((node) => node.textContent?.includes('Database temporarily unavailable')));
    expect(alerts.length).toBeGreaterThan(0);
  });

  it('explains one request when an account and an idempotency key are given', async () => {
    mocks.fetch.mockImplementation(respondWith({ populated: true, rows: [BREAKDOWN_ROW] }));
    render(<OperatorCostsPanel />);

    await screen.findByText('Last 7 days');
    fireEvent.change(screen.getByLabelText('Account id'), {
      target: { value: EXPLAIN.userId },
    });
    fireEvent.change(screen.getByLabelText('Idempotency key'), {
      target: { value: EXPLAIN.idempotencyKey },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Explain' }));

    expect(await screen.findByText(EXPLAIN.fallbackReason)).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/observability/explain?userId='),
        expect.anything(),
      ),
    );
  });

  it('requires both identifiers before it will call the explain route', async () => {
    mocks.fetch.mockImplementation(respondWith({ populated: true, rows: [BREAKDOWN_ROW] }));
    render(<OperatorCostsPanel />);

    await screen.findByText('Last 7 days');
    fireEvent.click(screen.getByRole('button', { name: 'Explain' }));

    expect(
      await screen.findByText('A user id and an idempotency key identify one request.'),
    ).toBeInTheDocument();
    expect(
      mocks.fetch.mock.calls.some((call: unknown[]) =>
        String(call[0]).includes('/observability/explain'),
      ),
    ).toBe(false);
  });
});
