import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  getJob: vi.fn(),
  generate: vi.fn(),
  fail: vi.fn(),
}));

type ImageGenerationJobsModule = typeof import('@/lib/server/image-generation-jobs');
type ImageGenerationProviderModule = typeof import('./image-generation-provider');

vi.mock('@/lib/server/image-generation-jobs', async (importOriginal) => ({
  ...(await importOriginal<ImageGenerationJobsModule>()),
  claimImageGenerationJobAttempt: (...args: unknown[]) => mocks.claim(...args),
  getImageGenerationJob: (...args: unknown[]) => mocks.getJob(...args),
  failImageGenerationJob: (...args: unknown[]) => mocks.fail(...args),
}));

vi.mock('./image-generation-provider', async (importOriginal) => ({
  ...(await importOriginal<ImageGenerationProviderModule>()),
  generateImages: (...args: unknown[]) => mocks.generate(...args),
}));

import { isImageJobAttemptDue, runImageGenerationJobAttempt } from './image-job-executor';
import type { ImageGenerationJob } from '@/lib/server/image-generation-jobs';

const POLLS_PER_MINUTE = 120;

function dueJob(overrides: Partial<ImageGenerationJob> = {}): ImageGenerationJob {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    userId: 'user-1',
    status: 'queued',
    attempts: 1,
    maxAttempts: 3,
    nextAttemptAt: new Date(Date.now() - 1000).toISOString(),
    claimToken: null,
    claimExpiresAt: null,
    terminalAt: null,
    cancelRequestedAt: null,
    ...overrides,
  } as ImageGenerationJob;
}

describe('image job attempts are gated by due time and claim, not request rate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts no provider call when every poll loses the claim', async () => {
    const job = dueJob();
    mocks.claim.mockResolvedValue(null);
    mocks.getJob.mockResolvedValue(job);

    for (let poll = 0; poll < POLLS_PER_MINUTE; poll++) {
      const outcome = await runImageGenerationJobAttempt({ db: {} as never, job });
      expect(outcome.images).toEqual([]);
    }

    expect(mocks.claim).toHaveBeenCalledTimes(POLLS_PER_MINUTE);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('lets exactly one of many concurrent polls past the claim', async () => {
    const job = dueJob();
    let held = false;
    mocks.claim.mockImplementation(async () => {
      if (held) return null;
      held = true;
      return { ...job, status: 'processing', model: 'not-an-image-model' };
    });
    mocks.getJob.mockResolvedValue(job);
    mocks.fail.mockResolvedValue(job);

    await Promise.all(
      Array.from({ length: POLLS_PER_MINUTE }, () =>
        runImageGenerationJobAttempt({ db: {} as never, job }),
      ),
    );

    expect(mocks.fail.mock.calls.length + mocks.generate.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('owes no attempt while a claim is live, the backoff runs or the job is closed', () => {
    const now = Date.now();
    const future = new Date(now + 60_000).toISOString();
    expect(isImageJobAttemptDue(dueJob({ claimExpiresAt: future }), now)).toBe(false);
    expect(isImageJobAttemptDue(dueJob({ nextAttemptAt: future }), now)).toBe(false);
    expect(isImageJobAttemptDue(dueJob({ attempts: 3 }), now)).toBe(false);
    expect(isImageJobAttemptDue(dueJob({ cancelRequestedAt: future }), now)).toBe(false);
    expect(isImageJobAttemptDue(dueJob({ terminalAt: future }), now)).toBe(false);
    expect(isImageJobAttemptDue(dueJob(), now)).toBe(true);
  });
});
