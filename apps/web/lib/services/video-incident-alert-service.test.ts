import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VideoGenerationJob } from '@/lib/server/video-generation-jobs';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  claim: vi.fn(),
  complete: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  claimSettlementByReservation: vi.fn(),
  claimSettlementById: vi.fn(),
  completeSettlement: vi.fn(),
  getSettlement: vi.fn(),
  listSettlements: vi.fn(),
  countExhaustedJobs: vi.fn(),
  countExhaustedSettlements: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/support/handoff/config', () => ({
  getHandoffConfig: () => ({ fallbackEmail: 'support@example.com' }),
  isValidEmail: vi.fn(),
}));
vi.mock('@/lib/support/handoff/resend-client', () => ({
  sendSupportEmail: (...args: unknown[]) => mocks.send(...args),
}));
vi.mock('@/lib/server/video-generation-jobs', () => ({
  claimVideoIncidentAlert: (...args: unknown[]) => mocks.claim(...args),
  completeVideoIncidentAlert: (...args: unknown[]) => mocks.complete(...args),
  getVideoGenerationJobForSystem: (...args: unknown[]) => mocks.get(...args),
  listPendingVideoIncidentAlertIds: (...args: unknown[]) => mocks.list(...args),
  claimVideoSettlementIncidentByReservation: (...args: unknown[]) =>
    mocks.claimSettlementByReservation(...args),
  claimVideoSettlementIncidentById: (...args: unknown[]) => mocks.claimSettlementById(...args),
  completeVideoSettlementIncident: (...args: unknown[]) => mocks.completeSettlement(...args),
  countExhaustedVideoIncidentAlerts: (...args: unknown[]) => mocks.countExhaustedJobs(...args),
  countExhaustedVideoSettlementIncidentAlerts: (...args: unknown[]) =>
    mocks.countExhaustedSettlements(...args),
  getVideoSettlementIncident: (...args: unknown[]) => mocks.getSettlement(...args),
  listPendingVideoSettlementIncidentIds: (...args: unknown[]) => mocks.listSettlements(...args),
}));

import {
  deliverDueVideoIncidentAlerts,
  deliverPendingVideoIncidentAlert,
  deliverVideoSettlementIncidentByReservation,
} from './video-incident-alert-service';

const job = {
  id: '11111111-1111-4111-8111-111111111111',
  incidentAlertStatus: 'pending',
  terminalAt: '2026-08-09T12:00:00.000Z',
  updatedAt: '2026-08-09T12:00:00.000Z',
} as VideoGenerationJob;

const settlementIncident = {
  id: '22222222-2222-4222-8222-222222222222',
  alertStatus: 'pending',
  alertAttempts: 0,
  alertLastError: null,
  alertClaimToken: 'claim-token',
  alertClaimExpiresAt: '2026-08-09T12:02:00.000Z',
  completedAt: '2026-08-09T12:00:00.000Z',
};

describe('video billing incident alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.claim.mockResolvedValue(job);
    mocks.complete.mockImplementation(async (input: { delivered: boolean }) => ({
      ...job,
      incidentAlertStatus: input.delivered ? 'delivered' : 'pending',
    }));
    mocks.get.mockResolvedValue(job);
    mocks.list.mockResolvedValue([]);
    mocks.claimSettlementByReservation.mockResolvedValue(settlementIncident);
    mocks.claimSettlementById.mockResolvedValue(settlementIncident);
    mocks.completeSettlement.mockImplementation(async (input: { delivered: boolean }) => ({
      ...settlementIncident,
      alertStatus: input.delivered ? 'delivered' : 'pending',
    }));
    mocks.getSettlement.mockResolvedValue(settlementIncident);
    mocks.listSettlements.mockResolvedValue([]);
    mocks.countExhaustedJobs.mockResolvedValue(0);
    mocks.countExhaustedSettlements.mockResolvedValue(0);
  });

  it('claims and records a delivered human alert under one stable provider idempotency key', async () => {
    mocks.send.mockResolvedValue({ delivered: true, providerMessageId: 'message-1' });

    await expect(deliverPendingVideoIncidentAlert({} as never, job)).resolves.toBe(true);
    expect(mocks.claim).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: job.id, claimToken: expect.any(String) }),
    );
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'support@example.com',
        subject: expect.stringContaining('video'),
        idempotencyKey: `video-billing:${job.id}`,
        text: expect.stringContaining(`Recorded at: ${job.terminalAt}`),
      }),
    );
    const jobEmail = mocks.send.mock.calls[0]?.[0] as { text: string };
    expect(jobEmail.text).toContain(`where id = '${job.id}'::uuid`);
    expect(jobEmail.text).not.toContain("where incident_alert_status = 'pending'");
    expect(mocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: job.id,
        claimToken: expect.any(String),
        delivered: true,
      }),
    );
  });

  it('keeps the alert pending when the monitored channel is unavailable', async () => {
    mocks.send.mockResolvedValue({
      delivered: false,
      reason: 'not_configured',
      detail: 'missing Resend configuration',
    });

    await expect(deliverPendingVideoIncidentAlert({} as never, job)).resolves.toBe(false);
    expect(mocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: job.id,
        delivered: false,
        error: expect.stringContaining('not_configured'),
      }),
    );
  });

  it('allows only one sender when two reconcilers race for the same alert', async () => {
    mocks.claim.mockResolvedValueOnce(job).mockResolvedValueOnce(null);
    mocks.get.mockResolvedValue(job);
    mocks.send.mockResolvedValue({ delivered: true, providerMessageId: 'message-1' });

    const results = await Promise.all([
      deliverPendingVideoIncidentAlert({} as never, job),
      deliverPendingVideoIncidentAlert({} as never, job),
    ]);

    expect(results).toEqual([true, false]);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.complete).toHaveBeenCalledTimes(1);
  });

  it('accepts a delivered marker after its commit response was lost', async () => {
    mocks.send.mockResolvedValue({ delivered: true, providerMessageId: 'message-1' });
    mocks.complete.mockRejectedValue(new Error('connection lost after commit'));
    mocks.get.mockResolvedValue({ ...job, incidentAlertStatus: 'delivered' });

    await expect(deliverPendingVideoIncidentAlert({} as never, job)).resolves.toBe(true);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.get).toHaveBeenCalledWith(expect.anything(), job.id);
  });

  it('does not send for succeeded, pending, or already-alerted settlement branches', async () => {
    await expect(
      deliverPendingVideoIncidentAlert(
        {} as never,
        { ...job, incidentAlertStatus: null } as VideoGenerationJob,
      ),
    ).resolves.toBe(true);
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('provides an unattended owner for terminal alerts whose primary workflow never started', async () => {
    mocks.list.mockResolvedValue([job.id]);
    mocks.get.mockResolvedValue(job);
    mocks.send.mockResolvedValue({ delivered: true, providerMessageId: 'message-1' });

    await expect(deliverDueVideoIncidentAlerts({} as never, 20)).resolves.toEqual({
      found: 1,
      delivered: 1,
      pending: 0,
      exhausted: 0,
    });
    expect(mocks.list).toHaveBeenCalledWith(expect.anything(), 1);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it('alerts from the durable settlement row when job persistence failed before a job existed', async () => {
    mocks.send.mockResolvedValue({ delivered: true, providerMessageId: 'message-2' });

    await expect(
      deliverVideoSettlementIncidentByReservation({
        db: {} as never,
        userId: 'user-1',
        idempotencyKey: 'agi.media.web.video.operation-123',
      }),
    ).resolves.toBe(true);

    expect(mocks.claimSettlementByReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        idempotencyKey: 'agi.media.web.video.operation-123',
        claimToken: expect.any(String),
      }),
    );
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: `video-billing-settlement:${settlementIncident.id}`,
      }),
    );
    const settlementEmail = mocks.send.mock.calls[0]?.[0] as { text: string };
    expect(settlementEmail.text).toContain(`where id = '${settlementIncident.id}'::uuid`);
    expect(settlementEmail.text).not.toContain("where video_incident_alert_status = 'pending'");
    expect(mocks.completeSettlement).toHaveBeenCalledWith(
      expect.objectContaining({ incidentId: settlementIncident.id, delivered: true }),
    );
  });

  it('sweeps a pre-job terminal settlement without requiring a primary workflow', async () => {
    mocks.listSettlements.mockResolvedValue([settlementIncident.id]);
    mocks.send.mockResolvedValue({ delivered: true, providerMessageId: 'message-2' });

    await expect(deliverDueVideoIncidentAlerts({} as never, 20)).resolves.toEqual({
      found: 1,
      delivered: 1,
      pending: 0,
      exhausted: 0,
    });
    expect(mocks.claimSettlementById).toHaveBeenCalledWith(
      expect.objectContaining({ incidentId: settlementIncident.id }),
    );
  });

  it('surfaces an exhausted incident without attempting unbounded email retries', async () => {
    mocks.countExhaustedJobs.mockResolvedValue(1);

    await expect(deliverDueVideoIncidentAlerts({} as never, 20)).resolves.toEqual({
      found: 1,
      delivered: 0,
      pending: 0,
      exhausted: 1,
    });
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('bounds one sweep to one provider send and prioritizes the pre-job outbox', async () => {
    mocks.listSettlements.mockResolvedValue([settlementIncident.id]);
    mocks.list.mockResolvedValue([job.id]);
    mocks.send.mockResolvedValue({ delivered: true, providerMessageId: 'message-2' });

    await expect(deliverDueVideoIncidentAlerts({} as never, 20)).resolves.toMatchObject({
      delivered: 1,
      pending: 0,
    });
    expect(mocks.listSettlements).toHaveBeenCalledWith(expect.anything(), 1);
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
});
