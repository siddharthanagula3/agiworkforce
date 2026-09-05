import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    processPendingSettlements: vi.fn(),
  },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({ query: vi.fn() })),
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

import { CreditService } from '@/lib/services/credit-service';
import { deliverDueVideoIncidentAlerts } from '@/lib/services/video-incident-alert-service';
import { reconcileStripeSettlement } from '@/lib/services/stripe-settlement-reconciliation-service';
import { importStripeCogsAdjustments } from '@/lib/services/cogs-ledger-service';
import { sendSupportEmail } from '@/lib/support/handoff/resend-client';
import { GET } from './route';

const reconcileStripe = vi.mocked(reconcileStripeSettlement);
const importCogs = vi.mocked(importStripeCogsAdjustments);

const processPending = vi.mocked(CreditService.processPendingSettlements);
const sendEmail = vi.mocked(sendSupportEmail);
const deliverVideoAlerts = vi.mocked(deliverDueVideoIncidentAlerts);

function cronRequest(secret?: string): Request {
  return new Request('https://agiworkforce.com/api/cron/reconcile-credits', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

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
      reason: 'not_configured',
    });
  });

  it('returns 500 so the scheduler can observe and retry infrastructure failure', async () => {
    processPending.mockRejectedValueOnce(new Error('database unavailable'));
    const response = await GET(cronRequest('cron-secret') as never);
    expect(response.status).toBe(500);
    expect(deliverVideoAlerts).toHaveBeenCalledWith(expect.anything(), 20);
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
    expect(deliverVideoAlerts).toHaveBeenCalledWith(expect.anything(), 20);
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
      adjustmentsRecorded: 3,
      discountsRecorded: 0,
    });
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
      adjustmentsRecorded: 3,
      discountsRecorded: 0,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('imports Stripe fees, refunds and chargebacks over a window that tolerates late settlement', async () => {
    const response = await GET(cronRequest('cron-secret') as never);

    expect(importCogs).toHaveBeenCalledOnce();
    const call = importCogs.mock.calls[0]![0];
    expect(call.until.getTime() - call.since.getTime()).toBe(3 * 24 * 60 * 60 * 1000);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      cogs: { examined: 12, feesRecorded: 9, adjustmentsRecorded: 3, discountsRecorded: 0 },
    });
  });

  it('fails the run when the ledger import could not complete', async () => {
    importCogs.mockRejectedValue(new Error('stripe unreachable'));

    const response = await GET(cronRequest('cron-secret') as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ reason: 'cogs_import_failed' });
  });
});
