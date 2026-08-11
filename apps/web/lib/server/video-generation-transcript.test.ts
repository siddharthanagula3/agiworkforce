import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/media-storage', () => ({
  authenticatedMediaUrl: (assetId: string) => `/api/files/${assetId}`,
}));

import type { VideoGenerationJob } from './video-generation-jobs';
import {
  failUnboundVideoGenerationTranscript,
  syncVideoGenerationTranscript,
} from './video-generation-transcript';

const JOB_ID = '11111111-1111-4111-8111-111111111111';
const CONVERSATION_ID = '22222222-2222-4222-8222-222222222222';
const MESSAGE_ID = '33333333-3333-4333-8333-333333333333';

function job(overrides: Partial<VideoGenerationJob> = {}): VideoGenerationJob {
  const now = new Date().toISOString();
  return {
    id: JOB_ID,
    userId: 'fixture-owner',
    organizationId: null,
    conversationId: CONVERSATION_ID,
    assistantMessageId: MESSAGE_ID,
    idempotencyKey: 'agi.media.web.video.fixture-operation',
    requestHash: 'a'.repeat(64),
    billingLeaseToken: 'fixture-lease',
    provider: 'openrouter',
    model: 'fixture-catalog-video-model',
    workflowRunId: 'fixture-workflow-run',
    providerTaskId: 'fixture-provider-task',
    prompt: 'fixture prompt',
    durationSecs: 4,
    resolution: '720p',
    sourceSurface: 'web',
    estimatedCostCents: 1,
    estimatedDurationSecs: 60,
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

describe('video generation transcript projection', () => {
  it('lets Workflow persist completion into the same placeholder after client observation timed out', async () => {
    const query = vi.fn().mockResolvedValue([{ id: MESSAGE_ID }]);
    const completed = job({
      status: 'completed',
      progress: 100,
      assetId: JOB_ID,
      actualCostCents: 1,
      billingOutcome: 'completed',
      terminalAt: new Date().toISOString(),
    });

    await expect(syncVideoGenerationTranscript({ query } as never, completed)).resolves.toBe(
      'updated',
    );

    const sql = String(query.mock.calls[0]?.[0]);
    const params = query.mock.calls[0]?.[1] as unknown[];
    expect(sql).toMatch(/conversation\.user_id = \$3/i);
    expect(params.slice(0, 5)).toEqual([
      MESSAGE_ID,
      CONVERSATION_ID,
      'fixture-owner',
      completed.model,
      completed.provider,
    ]);
    expect(JSON.parse(String(params[6]))).toMatchObject({
      videoTaskId: JOB_ID,
      videoStatus: 'completed',
      videoUrl: `/api/files/${JOB_ID}`,
      videoModel: completed.model,
      videoProvider: completed.provider,
    });
  });

  it('cannot project into a cross-tenant or detached assistant row', async () => {
    const query = vi.fn().mockResolvedValue([]);
    await expect(syncVideoGenerationTranscript({ query } as never, job())).resolves.toBe(
      'not_found',
    );
    expect(query.mock.calls[0]?.[1]).toContain('fixture-owner');
  });

  it('persists replay safety only for a confirmed terminal provider failure', async () => {
    const failedQuery = vi.fn().mockResolvedValue([{ id: MESSAGE_ID }]);
    await syncVideoGenerationTranscript(
      { query: failedQuery } as never,
      job({ status: 'failed', publicError: 'Provider rejected the request' }),
    );
    expect(JSON.parse(String(failedQuery.mock.calls[0]?.[1]?.[6]))).toMatchObject({
      videoStatus: 'failed',
      videoRetryable: true,
    });

    const ambiguousQuery = vi.fn().mockResolvedValue([{ id: MESSAGE_ID }]);
    await syncVideoGenerationTranscript(
      { query: ambiguousQuery } as never,
      job({ status: 'outcome_unknown', publicError: 'Task identity was not verified' }),
    );
    expect(JSON.parse(String(ambiguousQuery.mock.calls[0]?.[1]?.[6]))).toMatchObject({
      videoStatus: 'failed',
      videoRetryable: false,
    });
  });

  it('durably replaces a definite pre-job HTTP rejection only while the placeholder is unbound', async () => {
    const failureRow = {
      content: 'Video generation failed: Provider unavailable',
      model: null,
      provider: null,
      metadata: {
        toolType: 'video-generation',
        videoStatus: 'failed',
        videoError: 'Provider unavailable',
        videoRetryable: true,
      },
    };
    const query = vi.fn().mockResolvedValueOnce([failureRow]);

    await expect(
      failUnboundVideoGenerationTranscript({
        db: { query } as never,
        userId: 'fixture-owner',
        conversationId: CONVERSATION_ID,
        assistantMessageId: MESSAGE_ID,
        publicError: 'Provider unavailable',
      }),
    ).resolves.toEqual({ disposition: 'updated', message: failureRow });

    expect(String(query.mock.calls[0]?.[0])).toMatch(
      /nullif\(btrim\(message\.metadata->>'videoTaskId'\), ''\) is null/i,
    );
    expect(query.mock.calls[0]?.[1]).toEqual([
      MESSAGE_ID,
      CONVERSATION_ID,
      'fixture-owner',
      failureRow.content,
      JSON.stringify({
        toolType: 'video-generation',
        videoStatus: 'failed',
        videoError: 'Provider unavailable',
        videoRetryable: true,
      }),
    ]);
  });

  it('protects an already-bound durable task from a later client-observed HTTP error', async () => {
    const durableRow = {
      content: '',
      model: 'fixture-catalog-video-model',
      provider: 'openrouter',
      metadata: {
        toolType: 'video-generation',
        videoTaskId: JOB_ID,
        videoStatus: 'queued',
      },
    };
    const query = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([durableRow]);

    await expect(
      failUnboundVideoGenerationTranscript({
        db: { query } as never,
        userId: 'fixture-owner',
        conversationId: CONVERSATION_ID,
        assistantMessageId: MESSAGE_ID,
        publicError: 'Late gateway response',
      }),
    ).resolves.toEqual({ disposition: 'protected', message: durableRow });
    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[1]?.[0])).toMatch(/conversation\.user_id = \$3/i);
  });

  it('denies cross-tenant failure projection without revealing the message row', async () => {
    const query = vi.fn().mockResolvedValue([]);

    await expect(
      failUnboundVideoGenerationTranscript({
        db: { query } as never,
        userId: 'fixture-attacker',
        conversationId: CONVERSATION_ID,
        assistantMessageId: MESSAGE_ID,
        publicError: 'Synthetic rejection',
      }),
    ).resolves.toEqual({ disposition: 'not_found' });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls.every((call) => call[1]?.includes('fixture-attacker'))).toBe(true);
  });
});
