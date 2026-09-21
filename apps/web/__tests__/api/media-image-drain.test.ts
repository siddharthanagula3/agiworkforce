import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  getJob: vi.fn(),
  runAttempt: vi.fn(),
  isDue: vi.fn(),
  reconcile: vi.fn(),
  scopedDb: { query: vi.fn(), execute: vi.fn(), transaction: vi.fn() },
}));

vi.mock('@/lib/jobs/job-service', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/jobs/job-service')>('@/lib/jobs/job-service');
  return { PermanentJobError: actual.PermanentJobError, enqueueJob: mocks.enqueue };
});

vi.mock('@/lib/server/claimed-user-scope-db', () => ({
  createClaimedUserScopedDb: () => mocks.scopedDb,
}));

vi.mock('@/lib/server/image-generation-jobs', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/image-generation-jobs')>(
    '@/lib/server/image-generation-jobs',
  );
  return { ...actual, getImageGenerationJob: (...args: unknown[]) => mocks.getJob(...args) };
});

vi.mock('../../app/api/media/image/lib/image-job-executor', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    isImageJobAttemptDue: (...args: unknown[]) => mocks.isDue(...args),
    runImageGenerationJobAttempt: (...args: unknown[]) => mocks.runAttempt(...args),
    reconcileCancelledImageGenerationJob: (...args: unknown[]) => mocks.reconcile(...args),
  };
});

import { driveImageGenerationJob } from '../../app/api/media/image/lib/image-job-drain';
import {
  isImageGenerationJobDrivable,
  scheduleImageGenerationJobDrive,
} from '../../app/api/media/image/lib/image-job-drive-queue';
import type { JobHandlerContext } from '@/lib/jobs/job-drain';
import type { BackgroundJob } from '@/lib/jobs/job-service';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { ImageGenerationJob } from '@/lib/server/image-generation-jobs';

const JOB_ID = '55555555-5555-4555-8555-555555555555';

function imageJob(overrides: Partial<ImageGenerationJob> = {}): ImageGenerationJob {
  return {
    id: JOB_ID,
    userId: 'user-1',
    organizationId: null,
    conversationId: null,
    idempotencyKey: 'agi.media.web.image.generate-1',
    requestHash: 'b'.repeat(64),
    billingLeaseToken: 'lease-image',
    provider: 'openai',
    model: 'catalog-image-model',
    operation: 'generate',
    prompt: 'a lighthouse',
    plan: {
      aspectRatio: '1:1',
      quality: 'standard',
      legacySize: '1024x1024',
      transparentBackground: false,
    },
    sourceImageSha256: null,
    maskImageSha256: null,
    imageCount: 1,
    sourceSurface: 'web',
    estimatedCostMicrousd: 4_000,
    actualCostMicrousd: null,
    status: 'failed',
    attempts: 1,
    maxAttempts: 3,
    attemptStartedAt: new Date().toISOString(),
    retryable: true,
    publicError: 'The provider was busy',
    cancelRequestedAt: null,
    billingOutcome: null,
    billingSettlementStatus: null,
    nextAttemptAt: new Date(Date.now() - 1_000).toISOString(),
    claimToken: null,
    claimExpiresAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    terminalAt: null,
    ...overrides,
  };
}

function handlerContext(payload: Record<string, unknown> = { jobId: JOB_ID }): JobHandlerContext {
  return {
    job: {
      id: 'bg-1',
      queue: 'media-generation',
      kind: 'media-generation.image-attempt',
      userId: 'user-1',
      organizationId: null,
      payload,
    } as unknown as BackgroundJob,
    db: {} as DatabaseAdapter,
    signal: new AbortController().signal,
    isFinalAttempt: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isDue.mockReturnValue(true);
  mocks.enqueue.mockResolvedValue({ id: 'bg-2', status: 'queued', created: true });
});

describe('scheduleImageGenerationJobDrive', () => {
  it('queues one drive per attempt, delayed until the job is due', async () => {
    const job = imageJob({ attempts: 2 });
    const queued = await scheduleImageGenerationJobDrive({
      db: {} as DatabaseAdapter,
      job,
      delaySeconds: 30,
      now: () => 1_000_000,
    });

    expect(queued).toBe(true);
    const [, input] = mocks.enqueue.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(input['kind']).toBe('media-generation.image-attempt');
    expect(input['idempotencyKey']).toBe(`image-job:${JOB_ID}:2`);
    expect(input['payload']).toEqual({ jobId: JOB_ID });
    expect((input['runAfter'] as Date).toISOString()).toBe(new Date(1_030_000).toISOString());
  });

  it('does not queue an edit whose source image was never stored', async () => {
    const job = imageJob({ operation: 'edit' });
    expect(isImageGenerationJobDrivable(job)).toBe(false);

    await expect(
      scheduleImageGenerationJobDrive({ db: {} as DatabaseAdapter, job, delaySeconds: 5 }),
    ).resolves.toBe(false);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it('queues an edit that the library can replay', async () => {
    const job = imageJob({
      operation: 'edit',
      plan: { ...imageJob().plan, sourceAssetId: 'asset-1' },
    });
    expect(isImageGenerationJobDrivable(job)).toBe(true);

    await expect(
      scheduleImageGenerationJobDrive({ db: {} as DatabaseAdapter, job, delaySeconds: 5 }),
    ).resolves.toBe(true);
  });

  it('never queues a settled, cancelled or exhausted job', async () => {
    for (const job of [
      imageJob({ terminalAt: new Date().toISOString() }),
      imageJob({ cancelRequestedAt: new Date().toISOString() }),
      imageJob({ attempts: 3, maxAttempts: 3 }),
    ]) {
      await expect(
        scheduleImageGenerationJobDrive({ db: {} as DatabaseAdapter, job, delaySeconds: 5 }),
      ).resolves.toBe(false);
    }
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it('keeps the running attempt alive when the queue refuses the handoff', async () => {
    mocks.enqueue.mockRejectedValue(new Error('queue unavailable'));

    await expect(
      scheduleImageGenerationJobDrive({
        db: {} as DatabaseAdapter,
        job: imageJob(),
        delaySeconds: 5,
      }),
    ).resolves.toBe(false);
  });
});

describe('driveImageGenerationJob', () => {
  it('runs the due attempt under the account scope', async () => {
    const job = imageJob();
    mocks.getJob.mockResolvedValue(job);
    mocks.runAttempt.mockResolvedValue({
      job: { ...job, status: 'completed', attempts: 2, terminalAt: new Date().toISOString() },
      images: [],
      providerModel: 'catalog-image-model',
      provenance: [],
    });

    const result = await driveImageGenerationJob(handlerContext());

    expect(mocks.getJob).toHaveBeenCalledWith(mocks.scopedDb, JOB_ID, 'user-1');
    expect(mocks.runAttempt).toHaveBeenCalledWith({ db: mocks.scopedDb, job });
    expect(result).toEqual({ jobId: JOB_ID, status: 'completed', attempts: 2, settled: true });
  });

  it('reports a job that settled before the drive reached it', async () => {
    mocks.getJob.mockResolvedValue(
      imageJob({ status: 'completed', terminalAt: new Date().toISOString() }),
    );

    await expect(driveImageGenerationJob(handlerContext())).resolves.toEqual({
      jobId: JOB_ID,
      status: 'completed',
      settled: true,
    });
    expect(mocks.runAttempt).not.toHaveBeenCalled();
  });

  it('finishes a cancellation the attempt that held the claim never came back for', async () => {
    const job = imageJob({
      status: 'processing',
      cancelRequestedAt: new Date(Date.now() - 60_000).toISOString(),
      claimExpiresAt: new Date(Date.now() - 1_000).toISOString(),
    });
    mocks.getJob.mockResolvedValue(job);
    mocks.reconcile.mockResolvedValue({
      ...job,
      status: 'canceled',
      terminalAt: new Date().toISOString(),
    });

    await expect(driveImageGenerationJob(handlerContext())).resolves.toEqual({
      jobId: JOB_ID,
      status: 'canceled',
      settled: true,
    });
    expect(mocks.reconcile).toHaveBeenCalledWith({ db: mocks.scopedDb, job });
    expect(mocks.runAttempt).not.toHaveBeenCalled();
  });

  it('comes back for a cancellation whose attempt is still inside its provider call', async () => {
    mocks.getJob.mockResolvedValue(
      imageJob({
        status: 'processing',
        cancelRequestedAt: new Date().toISOString(),
        claimExpiresAt: new Date(Date.now() + 120_000).toISOString(),
      }),
    );

    await expect(driveImageGenerationJob(handlerContext())).rejects.toThrow(
      /cancelling inside a live attempt/,
    );
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it('leaves an exhausted job alone', async () => {
    mocks.getJob.mockResolvedValue(imageJob({ attempts: 3, maxAttempts: 3 }));
    await expect(driveImageGenerationJob(handlerContext())).resolves.toMatchObject({
      skipped: 'attempts_exhausted',
    });
    expect(mocks.runAttempt).not.toHaveBeenCalled();
  });

  it('does not burn the attempt of an edit whose source only the sender holds', async () => {
    mocks.getJob.mockResolvedValue(imageJob({ operation: 'edit' }));

    await expect(driveImageGenerationJob(handlerContext())).resolves.toMatchObject({
      skipped: 'source_image_not_stored',
    });
    expect(mocks.runAttempt).not.toHaveBeenCalled();
  });

  it('comes back later when another attempt still holds the claim', async () => {
    mocks.getJob.mockResolvedValue(imageJob({ status: 'processing' }));
    mocks.isDue.mockReturnValue(false);

    await expect(driveImageGenerationJob(handlerContext())).rejects.toThrow(
      /claimed or not yet due/,
    );
    expect(mocks.runAttempt).not.toHaveBeenCalled();
  });

  it('refuses a payload with no job and a job that no longer exists', async () => {
    await expect(driveImageGenerationJob(handlerContext({}))).rejects.toThrow(
      /payload is missing jobId/,
    );

    mocks.getJob.mockResolvedValue(null);
    await expect(driveImageGenerationJob(handlerContext())).rejects.toThrow(/no longer exists/);
  });
});
