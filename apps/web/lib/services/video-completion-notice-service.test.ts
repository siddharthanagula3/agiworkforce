import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VideoGenerationJob } from '@/lib/server/video-generation-jobs';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  push: vi.fn(),
  record: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/video-generation-jobs', () => ({
  claimVideoCompletionNotice: (...args: unknown[]) => mocks.claim(...args),
}));
vi.mock('./notification-service', () => ({
  recordNotification: (...args: unknown[]) => mocks.record(...args),
}));
vi.mock('./push-notification-service', () => ({
  sendPushToUser: (...args: unknown[]) => mocks.push(...args),
}));

import { deliverVideoCompletionNotice } from './video-completion-notice-service';

const db = {} as never;
const JOB_ID = '11111111-1111-4111-8111-111111111111';
const CONVERSATION_ID = '22222222-2222-4222-8222-222222222222';
const MESSAGE_ID = '33333333-3333-4333-8333-333333333333';

function job(overrides: Partial<VideoGenerationJob> = {}): VideoGenerationJob {
  const now = new Date().toISOString();
  return {
    id: JOB_ID,
    userId: 'user-1',
    organizationId: null,
    conversationId: CONVERSATION_ID,
    assistantMessageId: MESSAGE_ID,
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
    status: 'completed',
    providerStartedAt: now,
    cancelRequestedAt: null,
    providerCancelAttemptedAt: null,
    providerCancelAcknowledgedAt: null,
    cancelAttempts: 0,
    cancelLastError: null,
    progress: 100,
    assetId: JOB_ID,
    publicError: null,
    billingOutcome: 'completed',
    reconcileFailures: 0,
    nextAttemptAt: now,
    reconcileClaimToken: null,
    reconcileClaimExpiresAt: null,
    createdAt: now,
    updatedAt: now,
    terminalAt: now,
    ...overrides,
  };
}

describe('video completion notice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.push.mockResolvedValue({ sent: 1, invalidated: 0 });
    mocks.record.mockResolvedValue({ recorded: true });
  });

  it('writes one in-app feed row that opens the conversation holding the video', async () => {
    mocks.claim.mockResolvedValue(true);

    await deliverVideoCompletionNotice(db, job());

    expect(mocks.record).toHaveBeenCalledWith(db, {
      userId: 'user-1',
      category: 'media',
      severity: 'success',
      title: 'Your video is ready',
      message: 'Open the chat to watch it.',
      target: { kind: 'chat', id: CONVERSATION_ID },
      dedupeKey: `video-job:${JOB_ID}`,
    });
  });

  it('sends a notice that deep links to the message holding the video', async () => {
    mocks.claim.mockResolvedValue(true);

    await expect(deliverVideoCompletionNotice(db, job())).resolves.toBe(true);

    expect(mocks.claim).toHaveBeenCalledWith({ db, jobId: JOB_ID, userId: 'user-1' });
    expect(mocks.push).toHaveBeenCalledWith('user-1', {
      title: 'Your video is ready',
      body: 'Open the chat to watch it.',
      data: {
        type: 'chat_message',
        route: '/(app)/(tabs)/chat',
        videoJobId: JOB_ID,
        conversationId: CONVERSATION_ID,
        messageId: MESSAGE_ID,
      },
    });
  });

  /**
   * Several reconcilers observe one terminal transition -- the Workflow, a late
   * status poll, a webhook nudge -- so the claim, not the caller, is what makes
   * the notice singular.
   */
  it('sends nothing when another reconciler already claimed the notice', async () => {
    mocks.claim.mockResolvedValue(false);

    await expect(deliverVideoCompletionNotice(db, job())).resolves.toBe(false);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
  });

  /**
   * `completion_notified_at` arrives with migration 0183. Until it is applied
   * the claim raises, and the job's own result, which is already durable and
   * rendered by the next load, must not be disturbed by a failed announcement.
   */
  it('sends nothing when the claim column does not exist yet', async () => {
    mocks.claim.mockRejectedValue(new Error('column "completion_notified_at" does not exist'));

    await expect(deliverVideoCompletionNotice(db, job())).resolves.toBe(false);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('carries the public failure reason, never the internal one', async () => {
    const failed = job({
      status: 'failed',
      assetId: null,
      publicError: 'The provider rejected this prompt.',
    });
    mocks.claim.mockResolvedValue(true);

    await deliverVideoCompletionNotice(db, failed);

    expect(mocks.push).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        title: 'Your video did not finish',
        body: 'The provider rejected this prompt.',
      }),
    );
  });

  /**
   * The result the notice announces is already durable and the next load shows
   * it, so a dead transport must not propagate into the reconciler that only
   * called this to be polite.
   */
  it('reports no delivery rather than throwing when the transport fails', async () => {
    mocks.claim.mockResolvedValue(true);
    mocks.push.mockRejectedValue(new Error('push service unreachable'));

    await expect(deliverVideoCompletionNotice(db, job())).resolves.toBe(false);
  });

  it('reports no delivery when the account has registered no transport', async () => {
    mocks.claim.mockResolvedValue(true);
    mocks.push.mockResolvedValue({ sent: 0, invalidated: 0 });

    await expect(deliverVideoCompletionNotice(db, job())).resolves.toBe(false);
  });
});
