import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getJob: vi.fn(),
  reconcileExhausted: vi.fn(),
  reconcileCancelled: vi.fn(),
  runAttempt: vi.fn(),
}));

vi.mock('@/lib/jobs/job-service', () => ({
  PermanentJobError: class PermanentJobError extends Error {},
}));

vi.mock('@/lib/server/claimed-user-scope-db', () => ({
  createClaimedUserScopedDb: (db: unknown) => db,
}));

vi.mock('@/lib/server/image-generation-jobs', () => ({
  getImageGenerationJob: (...args: unknown[]) => mocks.getJob(...args),
}));

vi.mock('../../app/api/media/image/lib/image-job-drive-queue', () => ({
  isImageGenerationJobDrivable: () => true,
}));

vi.mock('../../app/api/media/image/lib/image-job-executor', () => ({
  isImageJobAttemptDue: () => true,
  isImageJobCancellationPending: () => false,
  isImageJobExhaustedAndAbandoned: (
    job: { attempts: number; maxAttempts: number; claimExpiresAt: string | null },
    now: number,
  ) =>
    job.attempts >= job.maxAttempts &&
    (job.claimExpiresAt === null || Date.parse(job.claimExpiresAt) <= now),
  reconcileCancelledImageGenerationJob: (...args: unknown[]) => mocks.reconcileCancelled(...args),
  reconcileExhaustedImageGenerationJob: (...args: unknown[]) => mocks.reconcileExhausted(...args),
  runImageGenerationJobAttempt: (...args: unknown[]) => mocks.runAttempt(...args),
}));

import { driveImageGenerationJob } from '../../app/api/media/image/lib/image-job-drain';

const JOB_ID = '55555555-5555-4555-8555-555555555555';

function exhausted(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: JOB_ID,
    userId: 'user-1',
    status: 'processing',
    attempts: 3,
    maxAttempts: 3,
    terminalAt: null,
    cancelRequestedAt: null,
    claimExpiresAt: new Date(Date.now() - 120_000).toISOString(),
    ...overrides,
  };
}

function context() {
  return {
    job: { userId: 'user-1', organizationId: null, payload: { jobId: JOB_ID } },
    db: {},
    signal: new AbortController().signal,
    isFinalAttempt: false,
  } as never;
}

describe('durable image job drain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('closes a job whose final attempt was abandoned instead of skipping it', async () => {
    const job = exhausted();
    mocks.getJob.mockResolvedValue(job);
    mocks.reconcileExhausted.mockResolvedValue({ ...job, status: 'failed', terminalAt: 'now' });

    const result = await driveImageGenerationJob(context());

    expect(mocks.reconcileExhausted).toHaveBeenCalledOnce();
    expect(result).toEqual({ jobId: JOB_ID, status: 'failed', settled: true });
    expect(mocks.runAttempt).not.toHaveBeenCalled();
  });

  it('retries the drive while the final attempt still holds its claim', async () => {
    mocks.getJob.mockResolvedValue(
      exhausted({ claimExpiresAt: new Date(Date.now() + 120_000).toISOString() }),
    );

    await expect(driveImageGenerationJob(context())).rejects.toThrow(/final attempt/);

    expect(mocks.reconcileExhausted).not.toHaveBeenCalled();
    expect(mocks.runAttempt).not.toHaveBeenCalled();
  });
});
