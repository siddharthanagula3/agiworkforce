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
}));
vi.mock('@/lib/support/handoff/resend-client', () => ({
  sendSupportEmail: vi.fn(),
}));

import { CreditService } from '@/lib/services/credit-service';
import { deliverDueVideoIncidentAlerts } from '@/lib/services/video-incident-alert-service';
import { sendSupportEmail } from '@/lib/support/handoff/resend-client';
import { GET } from './route';

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
    processPending.mockResolvedValue({
      processed: 4,
      succeeded: 3,
      pending: 1,
      terminal: 0,
    });
    sendEmail.mockResolvedValue({ delivered: true, providerMessageId: 'msg_1' });
    deliverVideoAlerts.mockResolvedValue({ found: 0, delivered: 0, pending: 0, exhausted: 0 });
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
    expect(processPending).toHaveBeenCalledWith(100);
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
