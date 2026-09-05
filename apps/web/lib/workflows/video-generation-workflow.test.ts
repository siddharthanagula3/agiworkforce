import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VideoGenerationJob } from '@/lib/server/video-generation-jobs';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  attach: vi.fn(),
  recoverAttachment: vi.fn(),
  reconcileBilling: vi.fn(),
  reconcile: vi.fn(),
  alert: vi.fn(),
  sleep: vi.fn(),
  db: {},
}));
vi.mock('workflow', () => ({
  getWorkflowMetadata: () => ({ workflowRunId: 'wrun-video-1' }),
  sleep: (...args: unknown[]) => mocks.sleep(...args),
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => mocks.db }));
vi.mock('@/lib/server/video-generation-jobs', () => ({
  attachVideoGenerationWorkflow: (...args: unknown[]) => mocks.attach(...args),
  getVideoGenerationJobForSystem: (...args: unknown[]) => mocks.get(...args),
  recoverVideoProviderTaskAttachment: (...args: unknown[]) => mocks.recoverAttachment(...args),
  reconcileVideoGenerationBillingSettlement: (...args: unknown[]) =>
    mocks.reconcileBilling(...args),
  beginVideoProviderCancellationAttempt: vi.fn(),
  claimVideoGenerationJob: vi.fn(),
  claimVideoIncidentAlert: vi.fn(),
  claimVideoSettlementIncidentById: vi.fn(),
  claimVideoSettlementIncidentByReservation: vi.fn(),
  completeVideoIncidentAlert: vi.fn(),
  completeVideoSettlementIncident: vi.fn(),
  countExhaustedVideoIncidentAlerts: vi.fn(),
  countExhaustedVideoSettlementIncidentAlerts: vi.fn(),
  deferVideoGenerationJob: vi.fn(),
  deferVideoGenerationJobFailure: vi.fn(),
  finalizeVideoGenerationJob: vi.fn(),
  getVideoSettlementIncident: vi.fn(),
  listDueVideoGenerationJobIds: vi.fn(),
  listPendingVideoIncidentAlertIds: vi.fn(),
  listPendingVideoSettlementIncidentIds: vi.fn(),
  markVideoGenerationOutcomeUnknown: vi.fn(),
  recordVideoProviderCancellationAttempt: vi.fn(),
}));
vi.mock('@/lib/services/video-job-reconciliation-service', () => ({
  reconcileVideoGenerationJobWithRequiredTranscript: (...args: unknown[]) =>
    mocks.reconcile(...args),
}));
vi.mock('@/lib/services/video-incident-alert-service', () => ({
  deliverPendingVideoIncidentAlert: (...args: unknown[]) => mocks.alert(...args),
}));

import {
  reconcileVideoGenerationWorkflowStep,
  recoverVideoProviderTaskAttachmentWorkflowStep,
  videoProviderTaskAttachmentWorkflow,
} from './video-generation-workflow';

const JOB_ID = '11111111-1111-4111-8111-111111111111';
const WORKFLOW_INPUT = {
  version: 1 as const,
  jobId: JOB_ID,
  startedAtEpochMs: Date.now(),
};

function job(overrides: Partial<VideoGenerationJob> = {}): VideoGenerationJob {
  const now = new Date().toISOString();
  return {
    id: JOB_ID,
    userId: 'user-1',
    organizationId: null,
    idempotencyKey: 'agi.media.web.video.operation-123',
    requestHash: 'a'.repeat(64),
    billingLeaseToken: 'lease',
    provider: 'google',
    model: 'synthetic-google-video-model',
    workflowRunId: 'wrun-video-1',
    providerTaskId: 'operations/task',
    prompt: 'a sunset',
    durationSecs: 4,
    resolution: '720p',
    sourceSurface: 'web',
    estimatedCostCents: 20,
    estimatedDurationSecs: 150,
    status: 'processing',
    providerStartedAt: now,
    cancelRequestedAt: null,
    providerCancelAttemptedAt: null,
    providerCancelAcknowledgedAt: null,
    cancelAttempts: 0,
    cancelLastError: null,
    progress: null,
    assetId: null,
    publicError: null,
    billingOutcome: null,
    reconcileFailures: 0,
    nextAttemptAt: now,
    reconcileClaimToken: null,
    reconcileClaimExpiresAt: null,
    createdAt: now,
    updatedAt: now,
    terminalAt: null,
    ...overrides,
  };
}

describe('durable video generation workflow step', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue(job());
    mocks.attach.mockResolvedValue(job());
    mocks.reconcile.mockImplementation(async (_db, snapshot) => snapshot);
    mocks.recoverAttachment.mockResolvedValue(job({ status: 'queued' }));
    mocks.reconcileBilling.mockResolvedValue(
      job({
        status: 'failed',
        publicError: 'Provider failed.',
        terminalAt: new Date().toISOString(),
        billingSettlementStatus: 'succeeded',
      }),
    );
    mocks.alert.mockResolvedValue(true);
    mocks.sleep.mockResolvedValue(undefined);
  });

  it('reconciles an attached active job without any client request', async () => {
    await expect(
      reconcileVideoGenerationWorkflowStep(WORKFLOW_INPUT, 'wrun-video-1'),
    ).resolves.toMatchObject({ terminal: false, status: 'processing' });
    expect(mocks.reconcile).toHaveBeenCalledOnce();
  });

  it('retries transcript projection from a terminal snapshot without replaying billing', async () => {
    const terminal = job({
      status: 'completed',
      progress: 100,
      assetId: JOB_ID,
      actualCostCents: 20,
      billingOutcome: 'completed',
      billingSettlementStatus: 'succeeded',
      terminalAt: new Date().toISOString(),
    });
    mocks.get.mockResolvedValueOnce(job()).mockResolvedValueOnce(terminal);
    mocks.reconcile
      .mockRejectedValueOnce(new Error('transcript projection unavailable after finalization'))
      .mockResolvedValueOnce(terminal);

    await expect(
      reconcileVideoGenerationWorkflowStep(WORKFLOW_INPUT, 'wrun-video-1'),
    ).resolves.toEqual({ terminal: false, status: 'unavailable', retryAfterSeconds: 60 });
    await expect(
      reconcileVideoGenerationWorkflowStep(WORKFLOW_INPUT, 'wrun-video-1'),
    ).resolves.toEqual({ terminal: true, status: 'completed', retryAfterSeconds: 0 });

    expect(mocks.reconcile).toHaveBeenCalledTimes(2);
    expect(mocks.reconcileBilling).not.toHaveBeenCalled();
    expect(mocks.alert).toHaveBeenCalledTimes(1);
  });

  it('waits through the pre-egress handoff instead of failing a newly attached job', async () => {
    mocks.get.mockResolvedValue(
      job({ status: 'submitting', providerStartedAt: null, providerTaskId: null }),
    );

    await expect(
      reconcileVideoGenerationWorkflowStep(WORKFLOW_INPUT, 'wrun-video-1'),
    ).resolves.toEqual({ terminal: false, status: 'submitting', retryAfterSeconds: 5 });
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it('waits when Workflow executes before its run id is attached, then reconciles after attach', async () => {
    const unattached = job({
      status: 'submitting',
      workflowRunId: null,
      providerTaskId: null,
      providerStartedAt: null,
    });
    const attached = job();
    mocks.attach.mockResolvedValueOnce({
      ...unattached,
      workflowRunId: 'wrun-video-1',
    });
    mocks.get.mockResolvedValueOnce(unattached).mockResolvedValueOnce(attached);

    await expect(
      reconcileVideoGenerationWorkflowStep(WORKFLOW_INPUT, 'wrun-video-1'),
    ).resolves.toEqual({ terminal: false, status: 'submitting', retryAfterSeconds: 5 });
    await expect(
      reconcileVideoGenerationWorkflowStep(WORKFLOW_INPUT, 'wrun-video-1'),
    ).resolves.toMatchObject({ terminal: false, status: 'processing' });
    expect(mocks.reconcile).toHaveBeenCalledOnce();
  });

  it('exits a detached workflow without touching provider or billing state', async () => {
    await expect(
      reconcileVideoGenerationWorkflowStep(WORKFLOW_INPUT, 'wrun-other'),
    ).resolves.toEqual({ terminal: true, status: 'detached', retryAfterSeconds: 0 });
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it('recovers the exact accepted provider id from durable Workflow input', async () => {
    mocks.get.mockResolvedValueOnce(
      job({
        status: 'submitting',
        providerTaskId: null,
        providerStartedAt: new Date().toISOString(),
      }),
    );
    const result = await recoverVideoProviderTaskAttachmentWorkflowStep({
      version: 1,
      jobId: JOB_ID,
      providerTaskId: 'operations/provider-task',
    });

    expect(result).toBe('attached');
    expect(mocks.recoverAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: JOB_ID,
        userId: 'user-1',
        providerTaskId: 'operations/provider-task',
      }),
    );
  });

  it('keeps retrying a safe DB attachment when the provider id is still not persisted', async () => {
    mocks.get.mockRejectedValueOnce(new Error('Neon unavailable'));

    await expect(
      recoverVideoProviderTaskAttachmentWorkflowStep({
        version: 1,
        jobId: JOB_ID,
        providerTaskId: 'operations/provider-task',
      }),
    ).resolves.toBe('retry');
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it('retains the provider id beyond the primary reconciler attachment grace', async () => {
    let reads = 0;
    mocks.get.mockImplementation(async () => {
      reads += 1;
      if (reads <= 120) throw new Error('Neon unavailable');
      return job({
        status: 'submitting',
        providerTaskId: null,
        providerStartedAt: new Date().toISOString(),
      });
    });

    await videoProviderTaskAttachmentWorkflow({
      version: 1,
      jobId: JOB_ID,
      providerTaskId: 'operations/provider-task',
    });

    expect(reads).toBe(121);
    expect(mocks.sleep).toHaveBeenCalledTimes(120);
    expect(mocks.recoverAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ providerTaskId: 'operations/provider-task' }),
    );
  });

  it('keeps a terminal Workflow alive until its owed support alert is delivered', async () => {
    mocks.get.mockResolvedValue(
      job({
        status: 'outcome_unknown',
        publicError: 'Incident recorded.',
        terminalAt: new Date().toISOString(),
        incidentAlertStatus: 'pending',
      }),
    );
    mocks.alert.mockResolvedValue(false);

    await expect(
      reconcileVideoGenerationWorkflowStep(WORKFLOW_INPUT, 'wrun-video-1'),
    ).resolves.toEqual({ terminal: false, status: 'outcome_unknown', retryAfterSeconds: 60 });
  });

  it('drains and mirrors a pending terminal credit settlement without client polling', async () => {
    const pending = job({
      status: 'failed',
      publicError: 'Provider failed.',
      terminalAt: new Date().toISOString(),
      billingSettlementStatus: 'pending',
    });
    mocks.get.mockResolvedValue(pending);
    mocks.reconcileBilling.mockResolvedValue({
      ...pending,
      billingSettlementStatus: 'succeeded',
    });

    await expect(
      reconcileVideoGenerationWorkflowStep(WORKFLOW_INPUT, 'wrun-video-1'),
    ).resolves.toEqual({ terminal: true, status: 'failed', retryAfterSeconds: 0 });
    expect(mocks.reconcileBilling).toHaveBeenCalledWith(mocks.db, JOB_ID);
  });

  it('turns a pending settlement that becomes terminal into a durable alert retry', async () => {
    const pending = job({
      status: 'failed',
      publicError: 'Provider failed.',
      terminalAt: new Date().toISOString(),
      billingSettlementStatus: 'pending',
    });
    mocks.get.mockResolvedValue(pending);
    mocks.reconcileBilling.mockResolvedValue({
      ...pending,
      billingSettlementStatus: 'terminal',
      incidentAlertStatus: 'pending',
    });
    mocks.alert.mockResolvedValue(false);

    await expect(
      reconcileVideoGenerationWorkflowStep(WORKFLOW_INPUT, 'wrun-video-1'),
    ).resolves.toEqual({ terminal: false, status: 'failed', retryAfterSeconds: 60 });
    expect(mocks.alert).toHaveBeenCalled();
  });

  it('delivers a provider-stall escalation while continuing durable polling', async () => {
    mocks.reconcile.mockResolvedValue(job({ status: 'queued', incidentAlertStatus: 'pending' }));

    await expect(
      reconcileVideoGenerationWorkflowStep(WORKFLOW_INPUT, 'wrun-video-1'),
    ).resolves.toMatchObject({ terminal: false, status: 'queued' });
    expect(mocks.alert).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({ status: 'queued' }),
    );
  });

  it('waits for a prestarted owner whose job INSERT is not visible yet', async () => {
    mocks.get.mockResolvedValueOnce(null).mockResolvedValueOnce(job());

    await expect(
      reconcileVideoGenerationWorkflowStep(WORKFLOW_INPUT, 'wrun-video-1'),
    ).resolves.toEqual({ terminal: false, status: 'missing', retryAfterSeconds: 5 });
    await expect(
      reconcileVideoGenerationWorkflowStep(WORKFLOW_INPUT, 'wrun-video-1'),
    ).resolves.toMatchObject({ terminal: false, status: 'processing' });
    expect(mocks.reconcile).toHaveBeenCalledOnce();
  });
});
