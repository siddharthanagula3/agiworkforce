import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VideoGenerationJob } from '@/lib/server/video-generation-jobs';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  defer: vi.fn(),
  deferFailure: vi.fn(),
  finalize: vi.fn(),
  getSystem: vi.fn(),
  listDue: vi.fn(),
  poll: vi.fn(),
  download: vi.fn(),
  storageConfigured: vi.fn(),
  storeFile: vi.fn(),
  deleteStored: vi.fn(),
  deleteAsset: vi.fn(),
  upsertAsset: vi.fn(),
  markUnknown: vi.fn(),
  cancelProvider: vi.fn(),
  beginCancellation: vi.fn(),
  recordCancellation: vi.fn(),
  transcriptSync: vi.fn(),
  cleanup: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/compliance/ai-act', () => ({
  buildAiGeneratedProvenance: () => ({ generated: true }),
}));
vi.mock('@/lib/server/video-generation-jobs', () => ({
  beginVideoProviderCancellationAttempt: (...args: unknown[]) => mocks.beginCancellation(...args),
  claimVideoGenerationJob: (...args: unknown[]) => mocks.claim(...args),
  deferVideoGenerationJob: (...args: unknown[]) => mocks.defer(...args),
  deferVideoGenerationJobFailure: (...args: unknown[]) => mocks.deferFailure(...args),
  finalizeVideoGenerationJob: (...args: unknown[]) => mocks.finalize(...args),
  getVideoGenerationJobForSystem: (...args: unknown[]) => mocks.getSystem(...args),
  listDueVideoGenerationJobIds: (...args: unknown[]) => mocks.listDue(...args),
  markVideoGenerationOutcomeUnknown: (...args: unknown[]) => mocks.markUnknown(...args),
  recordVideoProviderCancellationAttempt: (...args: unknown[]) => mocks.recordCancellation(...args),
}));
vi.mock('@/lib/services/video-provider-output-service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/services/video-provider-output-service')>();
  return {
    ...actual,
    pollVideoProvider: (...args: unknown[]) => mocks.poll(...args),
    requestRunwayVideoCancellation: (...args: unknown[]) => mocks.cancelProvider(...args),
    downloadVideoProviderOutput: (...args: unknown[]) => mocks.download(...args),
  };
});
vi.mock('@/lib/server/media-storage', () => ({
  authenticatedMediaUrl: (id: string) => `/api/files/${id}`,
  isVideoStorageConfigured: () => mocks.storageConfigured(),
  videoStoragePathname: ({ storageId }: { storageId: string }) =>
    `private-media/video/owner/${storageId}.mp4`,
  storeMediaFile: (...args: unknown[]) => mocks.storeFile(...args),
  deleteStoredMedia: (...args: unknown[]) => mocks.deleteStored(...args),
}));
vi.mock('@/lib/server/media-assets', () => ({
  deleteVideoMediaAsset: (...args: unknown[]) => mocks.deleteAsset(...args),
  upsertVideoMediaAsset: (...args: unknown[]) => mocks.upsertAsset(...args),
}));
vi.mock('@/lib/server/video-generation-transcript', () => ({
  syncVideoGenerationTranscript: (...args: unknown[]) => mocks.transcriptSync(...args),
}));

import {
  publicVideoJobStatus,
  reconcileDueVideoGenerationJobs,
  reconcileVideoGenerationJob,
  reconcileVideoGenerationJobWithRequiredTranscript,
} from './video-job-reconciliation-service';
import { VideoProviderOutputError } from './video-provider-output-service';

const db = {} as never;
const JOB_ID = '11111111-1111-4111-8111-111111111111';

function job(overrides: Partial<VideoGenerationJob> = {}): VideoGenerationJob {
  const now = new Date().toISOString();
  return {
    id: JOB_ID,
    userId: 'user-1',
    organizationId: null,
    idempotencyKey: 'agi.media.web.video.operation-123',
    requestHash: 'a'.repeat(64),
    billingLeaseToken: 'lease-video',
    provider: 'google',
    model: 'synthetic-google-video-model',
    workflowRunId: 'wrun-video-1',
    providerTaskId: 'operations/provider-task',
    prompt: 'a sunset',
    durationSecs: 6,
    resolution: '720p',
    sourceSurface: 'web',
    estimatedCostCents: 240,
    estimatedDurationSecs: 180,
    status: 'processing',
    providerStartedAt: now,
    cancelRequestedAt: null,
    providerCancelAttemptedAt: null,
    providerCancelAcknowledgedAt: null,
    cancelAttempts: 0,
    cancelLastError: null,
    progress: 50,
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

describe('video job reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const active = job();
    mocks.claim.mockResolvedValue(active);
    mocks.getSystem.mockResolvedValue(active);
    mocks.storageConfigured.mockReturnValue(true);
    mocks.download.mockResolvedValue({
      filePath: '/tmp/provider-video',
      byteSize: 16,
      contentType: 'video/mp4',
      cleanup: mocks.cleanup,
    });
    mocks.storeFile.mockResolvedValue({
      url: 'https://r2.example/internal-object',
      pathname: `media/video/user-1/${JOB_ID}.mp4`,
      byteSize: 16,
      contentType: 'video/mp4',
    });
    mocks.upsertAsset.mockResolvedValue(JOB_ID);
    mocks.deleteAsset.mockResolvedValue(true);
    mocks.deleteStored.mockResolvedValue(undefined);
    mocks.markUnknown.mockImplementation(async (input) =>
      job({
        status: 'outcome_unknown',
        providerTaskId: input.providerTaskId ?? null,
        publicError: input.publicError,
        billingOutcome: 'outcome_unknown',
        incidentAlertStatus: 'pending',
        terminalAt: new Date().toISOString(),
      }),
    );
    mocks.cancelProvider.mockResolvedValue(undefined);
    mocks.beginCancellation.mockImplementation(async () =>
      job({
        provider: 'runway',
        providerTaskId: 'runway-task',
        cancelRequestedAt: new Date().toISOString(),
        providerCancelAttemptedAt: new Date().toISOString(),
        cancelAttempts: 1,
      }),
    );
    mocks.recordCancellation.mockImplementation(async (input) =>
      job({
        cancelRequestedAt: new Date().toISOString(),
        providerCancelAttemptedAt: new Date().toISOString(),
        providerCancelAcknowledgedAt: input.acknowledged ? new Date().toISOString() : null,
        cancelAttempts: input.exhausted ? 5 : 1,
        cancelLastError: input.publicError ?? null,
      }),
    );
    mocks.finalize.mockImplementation(async (input) =>
      input.outcome === 'completed'
        ? job({
            status: 'completed',
            progress: 100,
            assetId: JOB_ID,
            billingOutcome: 'completed',
            terminalAt: new Date().toISOString(),
          })
        : job({
            status: 'failed',
            publicError: input.publicError,
            billingOutcome: 'released',
            terminalAt: new Date().toISOString(),
          }),
    );
    mocks.defer.mockImplementation(async (input) =>
      job({
        status: input.status,
        progress: input.progress ?? null,
        incidentAlertStatus: input.raiseIncident ? 'pending' : null,
      }),
    );
    mocks.deferFailure.mockResolvedValue(job({ reconcileFailures: 1 }));
    mocks.cleanup.mockResolvedValue(undefined);
    mocks.transcriptSync.mockResolvedValue('updated');
  });

  it('rehosts a completed provider output under the stable job/asset identity before billing', async () => {
    mocks.poll.mockResolvedValue({
      status: 'completed',
      output: { url: 'https://generativelanguage.googleapis.com/video' },
    });

    const result = await reconcileVideoGenerationJob(db, job());

    expect(result.status).toBe('completed');
    expect(mocks.storeFile).toHaveBeenCalledWith(
      expect.objectContaining({ storageId: JOB_ID, filePath: '/tmp/provider-video' }),
    );
    expect(mocks.upsertAsset).toHaveBeenCalledWith(
      expect.objectContaining({ id: JOB_ID }),
      expect.anything(),
    );
    expect(mocks.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'completed', assetId: JOB_ID }),
    );
    expect(mocks.upsertAsset.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.finalize.mock.invocationCallOrder[0]!,
    );
    expect(mocks.cleanup).toHaveBeenCalledTimes(1);
    expect(publicVideoJobStatus(result).video_url).toBe(`/api/files/${JOB_ID}`);
    expect(mocks.transcriptSync).toHaveBeenCalledWith(db, result);
  });

  it('retries a failed terminal transcript projection without replaying provider or billing work', async () => {
    mocks.poll.mockResolvedValue({
      status: 'completed',
      output: { url: 'https://generativelanguage.googleapis.com/video' },
    });
    mocks.transcriptSync
      .mockRejectedValueOnce(new Error('transcript database temporarily unavailable'))
      .mockResolvedValueOnce('updated');

    await expect(reconcileVideoGenerationJobWithRequiredTranscript(db, job())).rejects.toThrow(
      /temporarily unavailable/i,
    );
    const terminal = job({
      status: 'completed',
      progress: 100,
      assetId: JOB_ID,
      actualCostCents: 240,
      billingOutcome: 'completed',
      terminalAt: new Date().toISOString(),
    });
    await expect(reconcileVideoGenerationJobWithRequiredTranscript(db, terminal)).resolves.toBe(
      terminal,
    );

    expect(mocks.poll).toHaveBeenCalledTimes(1);
    expect(mocks.finalize).toHaveBeenCalledTimes(1);
    expect(mocks.transcriptSync).toHaveBeenCalledTimes(2);
    expect(mocks.transcriptSync).toHaveBeenLastCalledWith(db, terminal);
  });

  it('settles OpenRouter with provider usage even when it exceeds the reservation', async () => {
    const openRouter = job({
      provider: 'openrouter',
      model: 'catalog-video-model',
      providerTaskId: 'synthetic-provider-task',
      estimatedCostCents: 240,
    });
    mocks.claim.mockResolvedValue(openRouter);
    mocks.getSystem.mockResolvedValue(openRouter);
    mocks.poll.mockResolvedValue({
      status: 'completed',
      output: { openRouterContentIndex: 0 },
      actualCostCents: 301,
    });

    await reconcileVideoGenerationJob(db, openRouter);

    expect(mocks.download).toHaveBeenCalledWith(openRouter, { openRouterContentIndex: 0 });
    expect(mocks.finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'completed',
        assetId: JOB_ID,
        actualCostCents: 301,
      }),
    );
  });

  it('does not download or settle OpenRouter completion without provider usage', async () => {
    const openRouter = job({
      provider: 'openrouter',
      model: 'catalog-video-model',
      providerTaskId: 'synthetic-provider-task',
    });
    mocks.claim.mockResolvedValue(openRouter);
    mocks.getSystem.mockResolvedValue(openRouter);
    mocks.poll.mockResolvedValue({
      status: 'completed',
      output: { openRouterContentIndex: 0 },
    });

    const result = await reconcileVideoGenerationJob(db, openRouter);

    expect(result.status).toBe('processing');
    expect(mocks.deferFailure).toHaveBeenCalledWith(expect.objectContaining({ jobId: JOB_ID }));
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it('settles provider failure as failed exactly once with no asset', async () => {
    mocks.poll.mockResolvedValue({ status: 'failed', error: 'Provider cancelled the task.' });

    const result = await reconcileVideoGenerationJob(db, job());

    expect(result.status).toBe('failed');
    expect(mocks.finalize).toHaveBeenCalledTimes(1);
    expect(mocks.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failed', publicError: 'Provider cancelled the task.' }),
    );
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.upsertAsset).not.toHaveBeenCalled();
  });

  it('records an attached-task 404 as outcome_unknown instead of a proven provider failure', async () => {
    mocks.poll.mockRejectedValue(
      new VideoProviderOutputError('Google Veo no longer has this video task.', false),
    );

    const result = await reconcileVideoGenerationJob(db, job());

    expect(result.status).toBe('outcome_unknown');
    expect(result.incidentAlertStatus).toBe('pending');
    expect(mocks.markUnknown).toHaveBeenCalledWith(
      expect.objectContaining({
        providerTaskId: 'operations/provider-task',
        publicError: expect.stringContaining('safely'),
      }),
    );
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it.each([
    'The video provider returned an untrusted host.',
    'The provider result is not a supported video.',
    'The provider result did not match its declared video format.',
    'The provider video exceeds the storage limit.',
  ])('records a completed but unsafe output as a cost incident: %s', async (diagnostic) => {
    mocks.poll.mockResolvedValue({
      status: 'completed',
      output: { url: 'https://generativelanguage.googleapis.com/video' },
    });
    mocks.download.mockRejectedValue(new VideoProviderOutputError(diagnostic, false));

    const result = await reconcileVideoGenerationJob(db, job());

    expect(result.status).toBe('outcome_unknown');
    expect(result.incidentAlertStatus).toBe('pending');
    expect(mocks.markUnknown).toHaveBeenCalledWith(
      expect.objectContaining({
        providerTaskId: 'operations/provider-task',
        publicError: expect.not.stringContaining(diagnostic),
      }),
    );
    expect(mocks.finalize).not.toHaveBeenCalled();
    expect(JSON.stringify(publicVideoJobStatus(result))).not.toContain(diagnostic);
  });

  it('records a charged Runway moderation failure as outcome_unknown for operator review', async () => {
    const runway = job({
      provider: 'runway',
      providerTaskId: 'runway-task',
      model: 'synthetic-runway-video-model',
    });
    mocks.claim.mockResolvedValue(runway);
    mocks.poll.mockResolvedValue({
      status: 'failed',
      error: 'Runway safety checks could not deliver this video.',
      providerFailureCode: 'SAFETY.INPUT.TEXT',
      moderated: true,
    });

    const result = await reconcileVideoGenerationJob(db, runway);

    expect(result.status).toBe('outcome_unknown');
    expect(mocks.markUnknown).toHaveBeenCalledWith(
      expect.objectContaining({
        providerTaskId: 'runway-task',
        providerFailureCode: 'SAFETY.INPUT.TEXT',
      }),
    );
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it('refunds and records a cost incident when a completed result cannot be stored', async () => {
    mocks.storageConfigured.mockReturnValue(false);
    mocks.poll.mockResolvedValue({
      status: 'completed',
      output: { url: 'https://generativelanguage.googleapis.com/video' },
    });

    const result = await reconcileVideoGenerationJob(db, job());

    expect(result.status).toBe('outcome_unknown');
    expect(result.incidentAlertStatus).toBe('pending');
    expect(mocks.markUnknown).toHaveBeenCalledWith(
      expect.objectContaining({ publicError: expect.stringContaining('safely') }),
    );
    expect(mocks.finalize).not.toHaveBeenCalled();
    expect(mocks.storeFile).not.toHaveBeenCalled();
  });

  it('removes staged bytes and records a cost incident when the catalog cannot commit', async () => {
    const failing = job({ reconcileFailures: 4 });
    mocks.claim.mockResolvedValue(failing);
    mocks.getSystem.mockResolvedValue(failing);
    mocks.poll.mockResolvedValue({
      status: 'completed',
      output: { url: 'https://generativelanguage.googleapis.com/video' },
    });
    mocks.upsertAsset.mockRejectedValue(new Error('media catalog unavailable'));

    const result = await reconcileVideoGenerationJob(db, failing);

    expect(result.status).toBe('outcome_unknown');
    expect(result.incidentAlertStatus).toBe('pending');
    expect(mocks.deleteStored).toHaveBeenCalledWith(`media/video/user-1/${JOB_ID}.mp4`);
    expect(mocks.deleteAsset).toHaveBeenCalledWith(JOB_ID, 'user-1', expect.anything());
    expect(mocks.markUnknown).toHaveBeenCalledOnce();
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it('removes the deterministic object when upload commits but its response is lost', async () => {
    const failing = job({ reconcileFailures: 4 });
    mocks.claim.mockResolvedValue(failing);
    mocks.getSystem.mockResolvedValue(failing);
    mocks.poll.mockResolvedValue({
      status: 'completed',
      output: { url: 'https://generativelanguage.googleapis.com/video' },
    });
    mocks.storeFile.mockRejectedValue(new Error('connection lost after PutObject commit'));

    const result = await reconcileVideoGenerationJob(db, failing);

    expect(mocks.deleteStored).toHaveBeenCalledWith(`private-media/video/owner/${JOB_ID}.mp4`);
    expect(mocks.deleteAsset).toHaveBeenCalledWith(JOB_ID, 'user-1', expect.anything());
    expect(result.status).toBe('outcome_unknown');
    expect(result.incidentAlertStatus).toBe('pending');
    expect(mocks.markUnknown).toHaveBeenCalledOnce();
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it('keeps settlement active when an ambiguous upload cannot be compensated', async () => {
    const failing = job({
      reconcileFailures: 4,
      createdAt: new Date(Date.now() - 2 * 60 * 60_000 - 1_000).toISOString(),
    });
    mocks.claim.mockResolvedValue(failing);
    mocks.getSystem.mockResolvedValue(failing);
    mocks.poll.mockResolvedValue({
      status: 'completed',
      output: { url: 'https://generativelanguage.googleapis.com/video' },
    });
    mocks.storeFile.mockRejectedValue(new Error('connection lost after PutObject commit'));
    mocks.deleteStored.mockRejectedValue(new Error('R2 delete unavailable'));

    const result = await reconcileVideoGenerationJob(db, failing);

    expect(result.status).toBe('processing');
    expect(mocks.defer).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: JOB_ID, retryAfterSeconds: 60, raiseIncident: true }),
    );
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it('marks a post-egress job with no provider identity outcome_unknown without replaying it', async () => {
    const providerStartedAt = new Date(Date.now() - 13 * 60_000).toISOString();
    const ambiguous = job({
      status: 'submitting',
      providerTaskId: null,
      providerStartedAt,
      createdAt: providerStartedAt,
    });
    mocks.claim.mockResolvedValue(ambiguous);

    const result = await reconcileVideoGenerationJob(db, ambiguous);

    expect(result.status).toBe('outcome_unknown');
    expect(mocks.markUnknown).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: JOB_ID, publicError: expect.stringContaining('may have') }),
    );
    expect(mocks.poll).not.toHaveBeenCalled();
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it('defers a fresh pre-egress row so status polling cannot steal the request handoff', async () => {
    const fresh = job({
      status: 'submitting',
      providerTaskId: null,
      providerStartedAt: null,
      createdAt: new Date().toISOString(),
    });
    mocks.claim.mockResolvedValue(fresh);

    const result = await reconcileVideoGenerationJob(db, fresh);

    expect(result.status).toBe('submitting');
    expect(mocks.defer).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'submitting', retryAfterSeconds: expect.any(Number) }),
    );
    expect(mocks.finalize).not.toHaveBeenCalled();
    expect(mocks.poll).not.toHaveBeenCalled();
  });

  it('keeps attachment recovery open after a three-minute database outage', async () => {
    const providerStartedAt = new Date(Date.now() - 3 * 60_000).toISOString();
    const recovering = job({
      status: 'submitting',
      providerTaskId: null,
      providerStartedAt,
      createdAt: new Date(Date.now() - 4 * 60_000).toISOString(),
    });
    mocks.claim.mockResolvedValue(recovering);

    const result = await reconcileVideoGenerationJob(db, recovering);

    expect(result.status).toBe('submitting');
    expect(mocks.defer).toHaveBeenCalledWith(expect.objectContaining({ status: 'submitting' }));
    expect(mocks.markUnknown).not.toHaveBeenCalled();
  });

  it('settles cancellation before provider start without any provider egress', async () => {
    const cancelling = job({
      status: 'submitting',
      providerTaskId: null,
      providerStartedAt: null,
      cancelRequestedAt: new Date().toISOString(),
    });
    mocks.claim.mockResolvedValue(cancelling);

    const result = await reconcileVideoGenerationJob(db, cancelling);

    expect(result.status).toBe('failed');
    expect(mocks.finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'failed',
        publicError: expect.stringContaining('cancelled'),
      }),
    );
    expect(mocks.poll).not.toHaveBeenCalled();
  });

  it('deletes both the durable row and object before recording a finalization cost incident', async () => {
    const failing = job({ reconcileFailures: 4 });
    mocks.claim.mockResolvedValue(failing);
    mocks.getSystem.mockResolvedValue(failing);
    mocks.poll.mockResolvedValue({
      status: 'completed',
      output: { url: 'https://generativelanguage.googleapis.com/video' },
    });
    mocks.finalize.mockRejectedValueOnce(new Error('settlement unavailable'));

    const result = await reconcileVideoGenerationJob(db, failing);

    expect(result.status).toBe('outcome_unknown');
    expect(result.incidentAlertStatus).toBe('pending');
    expect(mocks.deleteStored).toHaveBeenCalledWith(`media/video/user-1/${JOB_ID}.mp4`);
    expect(mocks.deleteAsset).toHaveBeenCalledWith(JOB_ID, 'user-1', expect.anything());
    expect(mocks.deleteStored.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.markUnknown.mock.invocationCallOrder[0]!,
    );
  });

  it('keeps settlement active when persisted output compensation is incomplete', async () => {
    const active = job({
      reconcileFailures: 4,
      createdAt: new Date(Date.now() - 2 * 60 * 60_000 - 1_000).toISOString(),
    });
    mocks.claim.mockResolvedValue(active);
    mocks.getSystem.mockResolvedValue(active);
    mocks.poll.mockResolvedValue({
      status: 'completed',
      output: { url: 'https://generativelanguage.googleapis.com/video' },
    });
    mocks.finalize.mockRejectedValueOnce(new Error('settlement unavailable'));
    mocks.deleteStored.mockRejectedValueOnce(new Error('R2 unavailable'));

    const result = await reconcileVideoGenerationJob(db, active);

    expect(result.status).toBe('processing');
    expect(mocks.defer).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: JOB_ID, retryAfterSeconds: 60, raiseIncident: true }),
    );
    expect(mocks.finalize).toHaveBeenCalledTimes(1);
  });

  it('bounds transient retries and terminally records an unverifiable fifth outcome', async () => {
    const failing = job({ reconcileFailures: 4 });
    mocks.claim.mockResolvedValue(failing);
    mocks.getSystem.mockResolvedValue(failing);
    mocks.poll.mockRejectedValue(new VideoProviderOutputError('Provider unavailable.', true));

    const result = await reconcileVideoGenerationJob(db, failing);

    expect(result.status).toBe('outcome_unknown');
    expect(mocks.markUnknown).toHaveBeenCalledWith(
      expect.objectContaining({
        publicError: expect.stringContaining('bounded retries'),
        providerTaskId: 'operations/provider-task',
      }),
    );
    expect(mocks.finalize).not.toHaveBeenCalled();
    expect(mocks.deferFailure).not.toHaveBeenCalled();
  });

  it('allows only one concurrent poll to own provider work', async () => {
    const active = job();
    mocks.claim.mockResolvedValueOnce(active).mockResolvedValueOnce(null);
    mocks.getSystem.mockResolvedValue(active);
    mocks.poll.mockResolvedValue({ status: 'processing', progress: 60 });

    await Promise.all([
      reconcileVideoGenerationJob(db, active),
      reconcileVideoGenerationJob(db, active),
    ]);

    expect(mocks.poll).toHaveBeenCalledTimes(1);
    expect(mocks.defer).toHaveBeenCalledTimes(1);
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it('honors provider Retry-After with bounded per-job jitter', async () => {
    const active = job();
    mocks.claim.mockResolvedValue(active);
    mocks.poll.mockResolvedValue({
      status: 'processing',
      progress: 60,
      retryAfterSeconds: 90,
    });

    await reconcileVideoGenerationJob(db, active);

    const retryAfterSeconds = mocks.defer.mock.calls[0]?.[0]?.retryAfterSeconds as number;
    expect(retryAfterSeconds).toBeGreaterThanOrEqual(90);
    expect(retryAfterSeconds).toBeLessThanOrEqual(108);
  });

  it('keeps polling a provider-owned queued task beyond the old 45-minute cutoff', async () => {
    const old = job({
      createdAt: new Date(Date.now() - 46 * 60_000).toISOString(),
    });
    mocks.claim.mockResolvedValue(old);
    mocks.poll.mockResolvedValue({ status: 'queued', retryAfterSeconds: 90 });

    const result = await reconcileVideoGenerationJob(db, old);

    expect(result.status).toBe('queued');
    expect(mocks.poll).toHaveBeenCalledTimes(1);
    expect(mocks.defer).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'queued', retryAfterSeconds: expect.any(Number) }),
    );
    expect(mocks.markUnknown).not.toHaveBeenCalled();
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it('escalates a forever-queued provider task without refunding or abandoning it', async () => {
    const stalled = job({
      createdAt: new Date(Date.now() - 2 * 60 * 60_000 - 1_000).toISOString(),
    });
    mocks.claim.mockResolvedValue(stalled);
    mocks.poll.mockResolvedValue({ status: 'queued', retryAfterSeconds: 90 });

    const result = await reconcileVideoGenerationJob(db, stalled);

    expect(result.status).toBe('queued');
    expect(result.incidentAlertStatus).toBe('pending');
    expect(mocks.defer).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'queued', raiseIncident: true }),
    );
    expect(mocks.finalize).not.toHaveBeenCalled();
    expect(mocks.markUnknown).not.toHaveBeenCalled();
  });

  it('asks Runway to cancel under the reconciliation claim without refunding early', async () => {
    const cancelling = job({
      provider: 'runway',
      model: 'synthetic-runway-video-model',
      providerTaskId: 'runway-task',
      cancelRequestedAt: new Date().toISOString(),
    });
    mocks.claim.mockResolvedValue(cancelling);

    const result = await reconcileVideoGenerationJob(db, cancelling);

    expect(result.providerCancelAcknowledgedAt).not.toBeNull();
    expect(mocks.beginCancellation).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: JOB_ID }),
    );
    expect(mocks.cancelProvider).toHaveBeenCalledWith(
      expect.objectContaining({ providerCancelAttemptedAt: expect.any(String) }),
    );
    expect(mocks.recordCancellation).toHaveBeenCalledWith(
      expect.objectContaining({ acknowledged: true, retryAfterSeconds: 5 }),
    );
    expect(mocks.poll).not.toHaveBeenCalled();
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it('retries a definite pre-DELETE cancellation boundary failure without exhausting cancel', async () => {
    const cancelling = job({
      provider: 'runway',
      model: 'synthetic-runway-video-model',
      providerTaskId: 'runway-task',
      cancelRequestedAt: new Date().toISOString(),
    });
    mocks.claim.mockResolvedValue(cancelling);
    mocks.beginCancellation.mockRejectedValueOnce(new Error('Neon unavailable'));

    const result = await reconcileVideoGenerationJob(db, cancelling);

    expect(result.status).toBe('processing');
    expect(mocks.defer).toHaveBeenCalledWith(expect.objectContaining({ status: 'processing' }));
    expect(mocks.cancelProvider).not.toHaveBeenCalled();
    expect(mocks.recordCancellation).not.toHaveBeenCalled();
  });

  it('does not invent Google cancellation and continues honest provider reconciliation', async () => {
    const cancelling = job({ cancelRequestedAt: new Date().toISOString() });
    mocks.claim.mockResolvedValue(cancelling);
    mocks.poll.mockResolvedValue({ status: 'processing', progress: 70 });

    const result = await reconcileVideoGenerationJob(db, cancelling);

    expect(result.status).toBe('processing');
    expect(mocks.cancelProvider).not.toHaveBeenCalled();
    expect(mocks.poll).toHaveBeenCalledTimes(1);
    expect(mocks.finalize).not.toHaveBeenCalled();
    expect(publicVideoJobStatus(cancelling)).toMatchObject({
      cancel_requested: true,
      cancellation_state: 'unsupported',
    });
  });

  it('polls an acknowledged Runway cancellation and releases only after provider cancellation', async () => {
    const acknowledged = job({
      provider: 'runway',
      model: 'synthetic-runway-video-model',
      providerTaskId: 'runway-task',
      cancelRequestedAt: new Date().toISOString(),
      providerCancelAcknowledgedAt: new Date().toISOString(),
      cancelAttempts: 1,
    });
    mocks.claim.mockResolvedValue(acknowledged);
    mocks.poll.mockResolvedValue({ status: 'failed', error: 'Runway cancelled the task.' });

    const result = await reconcileVideoGenerationJob(db, acknowledged);

    expect(result.status).toBe('failed');
    expect(mocks.cancelProvider).not.toHaveBeenCalled();
    expect(mocks.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failed', publicError: 'Runway cancelled the task.' }),
    );
  });

  it('does not deliver or bill a Runway result completed after cancellation was requested', async () => {
    const cancelling = job({
      provider: 'runway',
      model: 'synthetic-runway-video-model',
      providerTaskId: 'runway-task',
      cancelRequestedAt: new Date().toISOString(),
      providerCancelAttemptedAt: new Date().toISOString(),
      cancelAttempts: 1,
    });
    mocks.claim.mockResolvedValue(cancelling);
    mocks.poll.mockResolvedValue({
      status: 'completed',
      output: { url: 'https://dnznrvs05pmza.cloudfront.net/result.mp4' },
    });

    const result = await reconcileVideoGenerationJob(db, cancelling);

    expect(result.status).toBe('failed');
    expect(mocks.finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'failed',
        publicError: expect.stringContaining('did not deliver'),
      }),
    );
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('compensates a late cancellation that wins the SQL finalization race', async () => {
    const active = job({
      provider: 'runway',
      model: 'synthetic-runway-video-model',
      providerTaskId: 'runway-task',
    });
    const cancelled = job({ ...active, cancelRequestedAt: new Date().toISOString() });
    mocks.claim.mockResolvedValue(active);
    mocks.poll.mockResolvedValue({
      status: 'completed',
      output: { url: 'https://dnznrvs05pmza.cloudfront.net/result.mp4' },
    });
    mocks.getSystem.mockResolvedValueOnce(active).mockResolvedValueOnce(cancelled);
    mocks.finalize.mockRejectedValueOnce(new Error('video cancellation won finalization race'));
    mocks.deferFailure.mockResolvedValue(cancelled);

    const result = await reconcileVideoGenerationJob(db, active);

    expect(result.cancelRequestedAt).not.toBeNull();
    expect(mocks.deleteStored).toHaveBeenCalledTimes(1);
    expect(mocks.deleteAsset).toHaveBeenCalledTimes(1);
    expect(mocks.deferFailure).toHaveBeenCalledOnce();
  });

  it('never replays an ambiguous Runway DELETE cancellation boundary', async () => {
    const ambiguous = job({
      provider: 'runway',
      model: 'synthetic-runway-video-model',
      providerTaskId: 'runway-task',
      cancelRequestedAt: new Date().toISOString(),
      providerCancelAttemptedAt: new Date().toISOString(),
      cancelAttempts: 1,
    });
    mocks.claim.mockResolvedValue(ambiguous);
    mocks.poll.mockResolvedValue({ status: 'processing', progress: 70 });

    const result = await reconcileVideoGenerationJob(db, ambiguous);

    expect(result.status).toBe('processing');
    expect(mocks.beginCancellation).not.toHaveBeenCalled();
    expect(mocks.cancelProvider).not.toHaveBeenCalled();
    expect(mocks.poll).toHaveBeenCalledTimes(1);
    expect(publicVideoJobStatus(ambiguous)).toMatchObject({
      cancel_requested: true,
      cancellation_state: 'unconfirmed',
    });
  });

  it('reconciles due jobs without any client through the shared batch entry point', async () => {
    const active = job();
    mocks.listDue.mockResolvedValue([JOB_ID]);
    mocks.getSystem.mockResolvedValue(active);
    mocks.claim.mockResolvedValue(active);
    mocks.poll.mockResolvedValue({ status: 'processing', progress: 25 });

    await expect(reconcileDueVideoGenerationJobs(db, 6)).resolves.toEqual({
      considered: 1,
      completed: 0,
      failed: 0,
      active: 1,
      errors: 0,
    });
  });
});
