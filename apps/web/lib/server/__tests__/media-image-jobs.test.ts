import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  claimImageGenerationJobAttempt,
  completeImageGenerationJob,
  createImageGenerationJob,
  deferImageGenerationJobFailure,
  failImageGenerationJob,
  getImageGenerationJob,
  isImageGenerationJobRetryable,
  isImageJobStoreReady,
  listImageGenerationJobAssetIds,
  requeueImageGenerationJob,
  type ImageGenerationJob,
} from '../image-generation-jobs';

const JOB_ID = '11111111-1111-4111-8111-111111111111';
const ASSET_ID = '22222222-2222-4222-8222-222222222222';

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: JOB_ID,
    user_id: 'user-1',
    organization_id: null,
    conversation_id: null,
    idempotency_key: 'agi.media.web.image.operation-123',
    request_hash: 'a'.repeat(64),
    billing_lease_token: 'lease-image',
    provider: 'openai',
    model: 'catalog-image-model',
    operation: 'generate',
    prompt: 'a sunset',
    plan: { aspectRatio: '1:1', quality: 'standard', legacySize: '1024x1024' },
    source_image_sha256: null,
    mask_image_sha256: null,
    image_count: 2,
    source_surface: 'web',
    estimated_cost_microusd: 8000,
    actual_cost_microusd: null,
    status: 'queued',
    attempts: 0,
    max_attempts: 3,
    attempt_started_at: null,
    retryable: false,
    public_error: null,
    cancel_requested_at: null,
    billing_outcome: null,
    billing_settlement_status: null,
    next_attempt_at: '2026-09-17T00:00:00.000Z',
    claim_token: null,
    claim_expires_at: null,
    created_at: '2026-09-17T00:00:00.000Z',
    updated_at: '2026-09-17T00:00:00.000Z',
    terminal_at: null,
    ...overrides,
  };
}

function jobOf(overrides: Partial<ImageGenerationJob> = {}): ImageGenerationJob {
  return {
    id: JOB_ID,
    userId: 'user-1',
    organizationId: null,
    conversationId: null,
    idempotencyKey: 'agi.media.web.image.operation-123',
    requestHash: 'a'.repeat(64),
    billingLeaseToken: 'lease-image',
    provider: 'openai',
    model: 'catalog-image-model',
    operation: 'generate',
    prompt: 'a sunset',
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
    estimatedCostMicrousd: 8000,
    actualCostMicrousd: null,
    status: 'failed',
    attempts: 1,
    maxAttempts: 3,
    attemptStartedAt: null,
    retryable: true,
    publicError: 'provider was busy',
    cancelRequestedAt: null,
    billingOutcome: null,
    billingSettlementStatus: null,
    nextAttemptAt: '2026-09-17T00:00:00.000Z',
    claimToken: null,
    claimExpiresAt: null,
    createdAt: '2026-09-17T00:00:00.000Z',
    updatedAt: '2026-09-17T00:00:00.000Z',
    terminalAt: null,
    ...overrides,
  };
}

describe('durable image job persistence boundary', () => {
  it('writes one durable job row for the submitted request', async () => {
    const query = vi.fn().mockResolvedValue([row()]);
    const db = { query } as never;

    const job = await createImageGenerationJob({
      db,
      id: JOB_ID,
      userId: 'user-1',
      organizationId: null,
      idempotencyKey: 'agi.media.web.image.operation-123',
      requestHash: 'a'.repeat(64),
      billingLeaseToken: 'lease-image',
      provider: 'openai',
      model: 'catalog-image-model',
      operation: 'generate',
      prompt: 'a sunset',
      plan: {
        aspectRatio: '1:1',
        quality: 'standard',
        legacySize: '1024x1024',
        transparentBackground: false,
      },
      imageCount: 2,
      sourceSurface: 'web',
      estimatedCostMicrousd: 8000,
    });

    expect(job.id).toBe(JOB_ID);
    expect(job.status).toBe('queued');
    expect(job.attempts).toBe(0);
    expect(job.imageCount).toBe(2);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/insert into public\.image_generation_jobs/i);
    expect(params).toContain('agi.media.web.image.operation-123');
  });

  it('counts each attempt and only claims a job nothing else holds', async () => {
    const query = vi.fn().mockResolvedValue([row({ status: 'processing', attempts: 1 })]);
    const db = { query } as never;

    const claimed = await claimImageGenerationJobAttempt({
      db,
      jobId: JOB_ID,
      userId: 'user-1',
      claimToken: 'claim-token-1234',
    });

    expect(claimed?.attempts).toBe(1);
    const [sql] = query.mock.calls[0] as [string];
    expect(sql).toMatch(/attempts = attempts \+ 1/);
    expect(sql).toMatch(/attempts < max_attempts/);
    expect(sql).toMatch(/claim_expires_at is null or claim_expires_at <= now\(\)/);
    expect(sql).toMatch(/cancel_requested_at is null/);
  });

  it('parks a retryable failure without making it terminal, so the reservation survives', async () => {
    const query = vi
      .fn()
      .mockResolvedValue([
        row({ status: 'failed', attempts: 1, retryable: true, public_error: 'provider was busy' }),
      ]);
    const db = { query } as never;

    const deferred = await deferImageGenerationJobFailure({
      db,
      jobId: JOB_ID,
      claimToken: 'claim-token-1234',
      publicError: 'provider was busy',
      retryAfterSeconds: 5,
    });

    expect(deferred.terminalAt).toBeNull();
    expect(isImageGenerationJobRetryable(deferred)).toBe(true);
    const [sql] = query.mock.calls[0] as [string];
    expect(sql).not.toMatch(/terminal_at = now\(\)/);
    expect(sql).toMatch(/retryable = true/);
  });

  it('refuses to retry a job that has used every attempt', () => {
    expect(isImageGenerationJobRetryable(jobOf({ attempts: 3, maxAttempts: 3 }))).toBe(false);
    expect(isImageGenerationJobRetryable(jobOf({ terminalAt: '2026-09-17T00:01:00.000Z' }))).toBe(
      false,
    );
    expect(isImageGenerationJobRetryable(jobOf())).toBe(true);
  });

  it('re-queues a retryable job on the reservation it already holds', async () => {
    const query = vi.fn().mockResolvedValue([row({ status: 'queued', attempts: 1 })]);
    const db = { query } as never;

    const requeued = await requeueImageGenerationJob({ db, jobId: JOB_ID, userId: 'user-1' });

    expect(requeued?.status).toBe('queued');
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/status = 'failed'/);
    expect(sql).toMatch(/and retryable/);
    expect(sql).toMatch(/attempts < max_attempts/);
    // No new reservation is taken here: the statement touches the job row only.
    expect(sql).not.toMatch(/managed_usage_requests/);
    expect(params).toEqual([JOB_ID, 'user-1']);
  });

  it('marks a terminal failure and records how the reservation was settled', async () => {
    const query = vi.fn().mockResolvedValue([
      row({
        status: 'failed',
        attempts: 3,
        retryable: false,
        public_error: 'prompt was refused',
        billing_outcome: 'released',
        terminal_at: '2026-09-17T00:02:00.000Z',
      }),
    ]);
    const db = { query } as never;

    const failed = await failImageGenerationJob({
      db,
      jobId: JOB_ID,
      claimToken: 'claim-token-1234',
      publicError: 'prompt was refused',
      billingOutcome: 'released',
      billingSettlementStatus: 'succeeded',
    });

    expect(failed.terminalAt).not.toBeNull();
    expect(isImageGenerationJobRetryable(failed)).toBe(false);
  });

  it('binds delivered candidates and closes the job in one transaction', async () => {
    const query = vi.fn().mockResolvedValue([
      row({
        status: 'completed',
        attempts: 1,
        actual_cost_microusd: 8000,
        terminal_at: '2026-09-17T00:03:00.000Z',
      }),
    ]);
    const execute = vi.fn().mockResolvedValue(undefined);
    const db = {
      transaction: (fn: (tx: unknown) => unknown) => fn({ query, execute }),
    } as never;

    const completed = await completeImageGenerationJob({
      db,
      jobId: JOB_ID,
      claimToken: 'claim-token-1234',
      assetIds: [ASSET_ID],
      actualCostMicrousd: 8000,
      billingSettlementStatus: 'succeeded',
    });

    expect(completed.status).toBe('completed');
    expect(execute).toHaveBeenCalledTimes(1);
    const [assetSql, assetParams] = execute.mock.calls[0] as [string, unknown[]];
    expect(assetSql).toMatch(/insert into public\.image_generation_job_assets/i);
    expect(assetParams).toEqual([JOB_ID, 0, ASSET_ID, 'user-1', null]);
  });

  it('will not complete a job that delivered nothing', async () => {
    const db = { transaction: vi.fn() } as never;
    await expect(
      completeImageGenerationJob({
        db,
        jobId: JOB_ID,
        claimToken: 'claim-token-1234',
        assetIds: [],
        actualCostMicrousd: 0,
        billingSettlementStatus: null,
      }),
    ).rejects.toThrow('at least one delivered asset');
  });

  it('reads a job and its candidates back for the owner only', async () => {
    const query = vi.fn().mockResolvedValue([row()]);
    const db = { query } as never;
    await getImageGenerationJob(db, JOB_ID, 'user-1');
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/where id = \$1 and user_id = \$2/);
    expect(params).toEqual([JOB_ID, 'user-1']);

    const assetQuery = vi.fn().mockResolvedValue([{ asset_id: ASSET_ID }]);
    const assetDb = { query: assetQuery } as never;
    await expect(listImageGenerationJobAssetIds(assetDb, JOB_ID)).resolves.toEqual([ASSET_ID]);
    expect((assetQuery.mock.calls[0] as [string])[0]).toMatch(/order by candidate_index/);
  });

  it('reports the store as unready until both tables exist', async () => {
    const readyDb = { query: vi.fn().mockResolvedValue([{ provisioned: true }]) } as never;
    const unreadyDb = { query: vi.fn().mockResolvedValue([{ provisioned: false }]) } as never;
    await expect(isImageJobStoreReady(readyDb)).resolves.toBe(true);
    await expect(isImageJobStoreReady(unreadyDb)).resolves.toBe(false);
  });
});
