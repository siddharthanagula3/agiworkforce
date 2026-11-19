import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@/lib/server/payments/stripe-provider');

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/services/credit-service', () => ({
  MICROUSD_PER_LEDGER_CENT: 10_000,
  microusdFromLedgerCents: (cents: number) => Math.round(cents) * 10_000,
  ledgerCentsFromMicrousd: (microusd: number) => Math.floor((microusd + 5_000) / 10_000),

  CreditService: {
    processPendingSettlements: vi.fn(),
  },
}));
interface CoverageRow {
  covered_until: string;
  lease_token: string | null;
  lease_expires_at: string | null;
  last_error: string | null;
  last_success_at: string | null;
}

const coverage = vi.hoisted(() => ({ row: null as CoverageRow | null }));

const coverageDb = vi.hoisted(() => ({
  execute: async (sql: string, params: unknown[] = []): Promise<number> => {
    const row = coverage.row;
    if (sql.includes('insert into public.stripe_cogs_import_coverage')) {
      if (row) return 0;
      coverage.row = {
        covered_until: params[1] as string,
        lease_token: null,
        lease_expires_at: null,
        last_error: null,
        last_success_at: null,
      };
      return 1;
    }
    if (!row || row.lease_token !== params[1]) return 0;
    if (sql.includes('set covered_until')) {
      row.covered_until = params[2] as string;
      row.last_success_at = params[3] as string;
      row.last_error = null;
    } else if (sql.includes('set last_error')) {
      row.last_error = (params[2] as string | null) ?? row.last_error;
    } else {
      return 0;
    }
    row.lease_token = null;
    row.lease_expires_at = null;
    return 1;
  },
  query: async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const row = coverage.row;
    if (!row || !sql.includes('set lease_token')) return [];
    const free =
      row.lease_expires_at === null ||
      Date.parse(row.lease_expires_at) <= Date.parse(params[3] as string);
    if (!free) return [];
    row.lease_token = params[1] as string;
    row.lease_expires_at = params[2] as string;
    return [{ covered_until: new Date(row.covered_until) }];
  },
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => coverageDb),
}));
vi.mock('@/lib/services/video-incident-alert-service', () => ({
  deliverDueVideoIncidentAlerts: vi.fn(),
}));
vi.mock('@/lib/support/handoff/config', () => ({
  getHandoffConfig: vi.fn(() => ({ fallbackEmail: 'ops@agiworkforce.com' })),
  isValidEmail: vi.fn(() => true),
}));
vi.mock('@/lib/support/handoff/resend-client', () => ({
  sendSupportEmail: vi.fn(),
}));
vi.mock('@/lib/services/stripe-settlement-reconciliation-service', () => ({
  reconcileStripeSettlement: vi.fn(),
  STRIPE_RECONCILIATION_ALERT_RATIO: 0.05,
  STRIPE_RECONCILIATION_MIN_SAMPLE: 20,
}));
vi.mock('@/lib/services/cogs-ledger-service', () => ({
  importStripeCogsAdjustments: vi.fn(),
}));
vi.mock('@/lib/server/payments/stripe-provider', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  readStripeCostActivity: vi.fn(),
}));

import { CreditService } from '@/lib/services/credit-service';
import { deliverDueVideoIncidentAlerts } from '@/lib/services/video-incident-alert-service';
import { reconcileStripeSettlement } from '@/lib/services/stripe-settlement-reconciliation-service';
import { importStripeCogsAdjustments } from '@/lib/services/cogs-ledger-service';
import { readStripeCostActivity } from '@/lib/server/payments/stripe-provider';
import { sendSupportEmail } from '@/lib/support/handoff/resend-client';
import { GET } from './route';

const reconcileStripe = vi.mocked(reconcileStripeSettlement);
const importCogs = vi.mocked(importStripeCogsAdjustments);
const readCostActivity = vi.mocked(readStripeCostActivity);
const COST_ACTIVITY = { balanceEntries: [], invoiceDiscounts: [] };

const processPending = vi.mocked(CreditService.processPendingSettlements);
const sendEmail = vi.mocked(sendSupportEmail);
const deliverVideoAlerts = vi.mocked(deliverDueVideoIncidentAlerts);

function cronRequest(secret?: string): Request {
  return new Request('https://agiworkforce.com/api/cron/reconcile-credits', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

beforeEach(() => {
  coverage.row = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/cron/reconcile-credits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    processPending.mockResolvedValue({
      processed: 4,
      succeeded: 3,
      pending: 1,
      terminal: 0,
    });
    sendEmail.mockResolvedValue({ delivered: true, providerMessageId: 'msg_1' });
    deliverVideoAlerts.mockResolvedValue({ found: 0, delivered: 0, pending: 0, exhausted: 0 });
    importCogs.mockResolvedValue({
      examined: 0,
      feesRecorded: 0,
      feesAttributed: 0,
      adjustmentsRecorded: 0,
      discountsRecorded: 0,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects unauthorized callers without touching billing state', async () => {
    const response = await GET(cronRequest() as never);
    expect(response.status).toBe(401);
    expect(processPending).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('processes a bounded durable settlement batch for an authorized cron', async () => {
    const response = await GET(cronRequest('cron-secret') as never);
    expect(response.status).toBe(200);
    // 500 is the ceiling `process_credit_settlement_queue` clamps to. This
    // drain is the only caller of `recover_stale_managed_usage_requests`, so
    // the batch size is the platform's whole refund rate for reservations a
    // killed turn leaked; at 100 the backlog grows and never comes back down.
    expect(processPending).toHaveBeenCalledWith(500, expect.anything());
    await expect(response.json()).resolves.toEqual({
      processed: 4,
      succeeded: 3,
      pending: 1,
      terminal: 0,
      alerted: false,
      delivery: 'not_needed',
    });
  });

  it('does not alert when nothing settled terminally', async () => {
    await GET(cronRequest('cron-secret') as never);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('alerts a human when a settlement dies permanently', async () => {
    processPending.mockResolvedValue({
      processed: 4,
      succeeded: 2,
      pending: 1,
      terminal: 1,
    });

    const response = await GET(cronRequest('cron-secret') as never);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = sendEmail.mock.calls[0]?.[0];
    expect(mail?.to).toBe('ops@agiworkforce.com');
    expect(mail?.subject).toContain('credit settlement drift');
    expect(mail?.text).toContain('Terminal settlements this run: 1');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      terminal: 1,
      alerted: true,
      delivery: 'delivered',
    });
  });

  it('fails the run when the drift alert could not be delivered', async () => {
    processPending.mockResolvedValue({
      processed: 1,
      succeeded: 0,
      pending: 0,
      terminal: 1,
    });
    sendEmail.mockResolvedValue({
      delivered: false,
      reason: 'not_configured',
      detail: 'RESEND_API_KEY is required',
    });

    const response = await GET(cronRequest('cron-secret') as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      alerted: true,
      delivery: 'undeliverable',
      reason: 'credit_settlement_drift_undeliverable',
      deliveryError: 'not_configured',
    });
  });

  it('returns 500 so the scheduler can observe and retry infrastructure failure', async () => {
    processPending.mockRejectedValueOnce(new Error('database unavailable'));
    const response = await GET(cronRequest('cron-secret') as never);
    expect(response.status).toBe(500);
    expect(deliverVideoAlerts).toHaveBeenCalledWith(expect.anything());
  });

  it('still drains video incident alerts when the generic credit queue is unhealthy', async () => {
    processPending.mockRejectedValueOnce(new Error('credit queue unavailable'));
    deliverVideoAlerts.mockResolvedValueOnce({
      found: 1,
      delivered: 1,
      pending: 0,
      exhausted: 0,
    });

    const response = await GET(cronRequest('cron-secret') as never);

    expect(response.status).toBe(500);
    expect(deliverVideoAlerts).toHaveBeenCalledOnce();
  });

  it('retries video incident alerts even when no credit settlement changed this run', async () => {
    deliverVideoAlerts.mockResolvedValue({ found: 1, delivered: 1, pending: 0, exhausted: 0 });

    const response = await GET(cronRequest('cron-secret') as never);

    expect(response.status).toBe(200);
    expect(deliverVideoAlerts).toHaveBeenCalledWith(expect.anything());
  });

  it('fails observably while a video incident alert remains undelivered', async () => {
    deliverVideoAlerts.mockResolvedValue({ found: 1, delivered: 0, pending: 1, exhausted: 0 });

    const response = await GET(cronRequest('cron-secret') as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      reason: 'video_incident_alert_pending',
    });
  });

  it('fails observably without retrying an exhausted video incident alert forever', async () => {
    deliverVideoAlerts.mockResolvedValue({ found: 1, delivered: 0, pending: 0, exhausted: 1 });

    const response = await GET(cronRequest('cron-secret') as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      reason: 'video_incident_alert_exhausted',
    });
  });
});

describe('GET /api/cron/reconcile-credits · Stripe settlement reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_reconcile');
    processPending.mockResolvedValue({ processed: 0, succeeded: 0, pending: 0, terminal: 0 });
    sendEmail.mockResolvedValue({ delivered: true, providerMessageId: 'msg_1' });
    deliverVideoAlerts.mockResolvedValue({ found: 0, delivered: 0, pending: 0, exhausted: 0 });
    reconcileStripe.mockResolvedValue({
      examined: 40,
      diverged: 1,
      repaired: 1,
      unrepaired: 0,
      missingInStripe: 0,
      divergenceRatio: 0.025,
      alert: false,
      drifts: [],
    });
    importCogs.mockResolvedValue({
      examined: 12,
      feesRecorded: 9,
      feesAttributed: 9,
      adjustmentsRecorded: 3,
      discountsRecorded: 0,
    });
    readCostActivity.mockResolvedValue(COST_ACTIVITY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('compares stored subscription state against Stripe on every scheduled run', async () => {
    const response = await GET(cronRequest('cron-secret') as never);

    expect(reconcileStripe).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      stripe: { examined: 40, diverged: 1, repaired: 1, unrepaired: 0, alert: false },
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('skips the comparison instead of throwing when Stripe is not configured', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '');

    const response = await GET(cronRequest('cron-secret') as never);

    expect(reconcileStripe).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.not.toHaveProperty('stripe');
  });

  it('alerts a human when divergence passes the threshold', async () => {
    reconcileStripe.mockResolvedValue({
      examined: 40,
      diverged: 9,
      repaired: 7,
      unrepaired: 2,
      missingInStripe: 1,
      divergenceRatio: 0.225,
      alert: true,
      drifts: [
        {
          userId: 'user-9',
          stripeSubscriptionId: 'sub_9',
          fields: ['status'],
          repaired: false,
          repairError: 'unregistered price',
        },
      ],
    });

    const response = await GET(cronRequest('cron-secret') as never);

    expect(sendEmail).toHaveBeenCalledOnce();
    const mail = sendEmail.mock.calls[0]?.[0];
    expect(mail?.subject).toContain('Stripe subscription divergence');
    expect(mail?.text).toContain('sub_9');
    expect(mail?.text).toContain('unregistered price');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ stripe: { alert: true } });
  });

  it('fails the run when the divergence alert could not be delivered', async () => {
    reconcileStripe.mockResolvedValue({
      examined: 40,
      diverged: 9,
      repaired: 9,
      unrepaired: 0,
      missingInStripe: 0,
      divergenceRatio: 0.225,
      alert: true,
      drifts: [],
    });
    sendEmail.mockResolvedValue({
      delivered: false,
      reason: 'not_configured',
      detail: 'RESEND_API_KEY is required',
    });

    const response = await GET(cronRequest('cron-secret') as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      reason: 'stripe_divergence_undeliverable',
    });
  });

  it('reports a reconciliation failure instead of returning a clean run', async () => {
    reconcileStripe.mockRejectedValue(new Error('stripe unreachable'));

    const response = await GET(cronRequest('cron-secret') as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      reason: 'stripe_reconciliation_failed',
    });
  });
});

describe('GET /api/cron/reconcile-credits · COGS ledger import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_cogs');
    processPending.mockResolvedValue({ processed: 0, succeeded: 0, pending: 0, terminal: 0 });
    sendEmail.mockResolvedValue({ delivered: true, providerMessageId: 'msg_1' });
    deliverVideoAlerts.mockResolvedValue({ found: 0, delivered: 0, pending: 0, exhausted: 0 });
    reconcileStripe.mockResolvedValue({
      examined: 0,
      diverged: 0,
      repaired: 0,
      unrepaired: 0,
      missingInStripe: 0,
      divergenceRatio: 0,
      alert: false,
      drifts: [],
    });
    importCogs.mockResolvedValue({
      examined: 12,
      feesRecorded: 9,
      feesAttributed: 9,
      adjustmentsRecorded: 3,
      discountsRecorded: 0,
    });
    readCostActivity.mockResolvedValue(COST_ACTIVITY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const DAY_MS = 24 * 60 * 60 * 1000;
  const T0 = Date.parse('2026-11-01T00:07:00.000Z');

  function at(ms: number) {
    vi.useFakeTimers({ now: ms, toFake: ['Date'] });
  }

  function windowOf(call: number) {
    const window = readCostActivity.mock.calls[call]![0];
    return { since: window.since.getTime(), until: window.until.getTime() };
  }

  it('imports Stripe fees, refunds and chargebacks over a window that tolerates late settlement', async () => {
    at(T0);
    const response = await GET(cronRequest('cron-secret') as never);

    expect(readCostActivity).toHaveBeenCalledOnce();
    expect(windowOf(0)).toEqual({ since: T0 - 3 * DAY_MS, until: T0 });
    expect(importCogs).toHaveBeenCalledOnce();
    expect(importCogs.mock.calls[0]![0]).toMatchObject({ activity: COST_ACTIVITY });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      cogs: {
        examined: 12,
        feesRecorded: 9,
        adjustmentsRecorded: 3,
        discountsRecorded: 0,
        coveredUntil: new Date(T0).toISOString(),
        behind: false,
      },
    });
    expect(coverage.row).toMatchObject({
      covered_until: new Date(T0).toISOString(),
      lease_token: null,
      last_error: null,
    });
  });

  it('keeps the three-day overlap on consecutive healthy runs', async () => {
    at(T0);
    await GET(cronRequest('cron-secret') as never);
    at(T0 + DAY_MS);
    const response = await GET(cronRequest('cron-secret') as never);

    expect(windowOf(1)).toEqual({ since: T0 + DAY_MS - 3 * DAY_MS, until: T0 + DAY_MS });
    expect(response.status).toBe(200);
  });

  it('retries the unimported range after an interruption longer than the overlap', async () => {
    at(T0);
    await GET(cronRequest('cron-secret') as never);

    readCostActivity.mockRejectedValue(new Error('stripe unreachable'));
    for (const day of [1, 2, 3]) {
      at(T0 + day * DAY_MS);
      const failed = await GET(cronRequest('cron-secret') as never);
      expect(failed.status).toBe(500);
      await expect(failed.json()).resolves.toMatchObject({ reason: 'cogs_import_failed' });
    }
    expect(coverage.row).toMatchObject({
      covered_until: new Date(T0).toISOString(),
      last_error: 'stripe unreachable',
      lease_token: null,
    });

    readCostActivity.mockResolvedValue(COST_ACTIVITY);
    at(T0 + 4 * DAY_MS);
    const healthy = await GET(cronRequest('cron-secret') as never);

    expect(windowOf(4)).toEqual({ since: T0, until: T0 + 4 * DAY_MS });
    expect(healthy.status).toBe(200);
    expect(coverage.row).toMatchObject({
      covered_until: new Date(T0 + 4 * DAY_MS).toISOString(),
      last_error: null,
    });
  });

  it('keeps coverage when a ledger write fails after earlier adjustments were recorded', async () => {
    at(T0);
    await GET(cronRequest('cron-secret') as never);

    importCogs.mockRejectedValueOnce(new Error('insert into cogs_adjustments failed'));
    at(T0 + 5 * DAY_MS);
    const failed = await GET(cronRequest('cron-secret') as never);
    expect(failed.status).toBe(500);
    expect(coverage.row?.covered_until).toBe(new Date(T0).toISOString());

    at(T0 + 6 * DAY_MS);
    const retried = await GET(cronRequest('cron-secret') as never);
    expect(windowOf(1).since).toBe(T0);
    expect(windowOf(2)).toEqual({ since: T0, until: T0 + 6 * DAY_MS });
    expect(retried.status).toBe(200);
  });

  it('bounds a long catch-up, reports the gap, and resumes at the exact boundary it reached', async () => {
    at(T0);
    await GET(cronRequest('cron-secret') as never);

    at(T0 + 20 * DAY_MS);
    const first = await GET(cronRequest('cron-secret') as never);
    expect(windowOf(1)).toEqual({ since: T0, until: T0 + 7 * DAY_MS });
    expect(first.status).toBe(500);
    await expect(first.json()).resolves.toMatchObject({
      reason: 'cogs_import_coverage_behind',
      cogs: { coveredUntil: new Date(T0 + 7 * DAY_MS).toISOString(), behind: true },
    });

    at(T0 + 21 * DAY_MS);
    await GET(cronRequest('cron-secret') as never);
    expect(windowOf(2)).toEqual({ since: T0 + 7 * DAY_MS, until: T0 + 14 * DAY_MS });

    at(T0 + 22 * DAY_MS);
    const caughtUp = await GET(cronRequest('cron-secret') as never);
    expect(windowOf(3)).toEqual({ since: T0 + 14 * DAY_MS, until: T0 + 21 * DAY_MS });
    expect(caughtUp.status).toBe(500);

    at(T0 + 23 * DAY_MS);
    const current = await GET(cronRequest('cron-secret') as never);
    expect(windowOf(4)).toEqual({ since: T0 + 20 * DAY_MS, until: T0 + 23 * DAY_MS });
    expect(current.status).toBe(200);
  });

  it('lets only one of two concurrent runs import', async () => {
    at(T0);
    let release: (value: typeof COST_ACTIVITY) => void = () => undefined;
    readCostActivity.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );

    const first = GET(cronRequest('cron-secret') as never);
    const second = await GET(cronRequest('cron-secret') as never);
    release(COST_ACTIVITY);
    const firstResponse = await first;

    expect(readCostActivity).toHaveBeenCalledOnce();
    expect(importCogs).toHaveBeenCalledOnce();
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.not.toHaveProperty('cogs');
    expect(firstResponse.status).toBe(200);
    expect(coverage.row).toMatchObject({ covered_until: new Date(T0).toISOString() });
  });

  it('takes over a lease its holder never released once it has expired', async () => {
    at(T0);
    coverage.row = {
      covered_until: new Date(T0 - 3 * DAY_MS).toISOString(),
      lease_token: '00000000-0000-4000-8000-000000000000',
      lease_expires_at: new Date(T0 - 1).toISOString(),
      last_error: null,
      last_success_at: null,
    };

    const response = await GET(cronRequest('cron-secret') as never);

    expect(readCostActivity).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(coverage.row).toMatchObject({ covered_until: new Date(T0).toISOString() });
  });

  it('touches neither Stripe nor coverage when the payment provider is not configured', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '');

    const response = await GET(cronRequest('cron-secret') as never);

    expect(readCostActivity).not.toHaveBeenCalled();
    expect(importCogs).not.toHaveBeenCalled();
    expect(coverage.row).toBeNull();
    expect(response.status).toBe(200);
  });

  it('skips the ledger import and keeps coverage when the activity reader has no provider', async () => {
    at(T0);
    readCostActivity.mockResolvedValue(null);

    const response = await GET(cronRequest('cron-secret') as never);

    expect(importCogs).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(coverage.row).toMatchObject({
      covered_until: new Date(T0 - 3 * DAY_MS).toISOString(),
      lease_token: null,
    });
  });

  it('fails the run when the ledger import could not complete', async () => {
    importCogs.mockRejectedValue(new Error('stripe unreachable'));

    const response = await GET(cronRequest('cron-secret') as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ reason: 'cogs_import_failed' });
  });

  it('fails the run without writing the ledger when the Stripe activity cannot be read', async () => {
    readCostActivity.mockRejectedValue(new Error('stripe unreachable'));

    const response = await GET(cronRequest('cron-secret') as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ reason: 'cogs_import_failed' });
    expect(importCogs).not.toHaveBeenCalled();
  });
});
