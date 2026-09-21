import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { StatementScanPostgres, type Row } from '@/lib/services/__tests__/statement-scan-postgres';
import { failUnboundVideoGenerationTranscript } from '../video-generation-transcript';
import { createVideoGenerationJob } from '../video-generation-jobs';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const USER = 'user_owner';
const CONVERSATION = '11111111-1111-4111-8111-111111111111';
const WITHDRAWN = '22222222-2222-4222-8222-222222222222';
const KEPT = '33333333-3333-4333-8333-333333333333';
const ADMISSION = 'an-admission-token';

function turn(id: string, content: string, deletedAt: string | null): Row {
  return {
    id,
    conversation_id: CONVERSATION,
    role: 'assistant',
    content,
    model: 'a-model',
    provider: 'a-provider',
    metadata: { toolType: 'video-generation', videoTaskId: '' },
    deleted_at: deletedAt,
  };
}

function seeded() {
  return new StatementScanPostgres({
    web_conversations: [{ id: CONVERSATION, user_id: USER, deleted_at: null }],
    web_messages: [
      turn(WITHDRAWN, 'the answer the user deleted', '2026-09-19T00:00:00.000Z'),
      turn(KEPT, 'the answer the user kept', null),
    ],
    profiles: [
      {
        id: USER,
        deletion_requested_at: null,
        deletion_scheduled_for: null,
        video_generation_erasure_fence_token: null,
        video_generation_admission_token: ADMISSION,
      },
    ],
    video_generation_jobs: [],
  });
}

function jobFor(assistantMessageId: string) {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    userId: USER,
    organizationId: null,
    conversationId: CONVERSATION,
    assistantMessageId,
    idempotencyKey: 'an-idempotency-key',
    requestHash: 'a-request-hash',
    billingLeaseToken: 'a-lease-token',
    admissionToken: ADMISSION,
    provider: 'google' as const,
    model: 'a-model',
    prompt: 'a prompt',
    durationSecs: 4,
    resolution: '720p' as const,
    aspectRatio: '16:9' as const,
    generateAudio: false,
    sourceSurface: 'web' as const,
    estimatedCostCents: 1,
    estimatedDurationSecs: 4,
    workflowRunId: 'a-workflow-run',
  };
}

async function fail(db: StatementScanPostgres, assistantMessageId: string) {
  return failUnboundVideoGenerationTranscript({
    db: db as unknown as DatabaseAdapter,
    userId: USER,
    conversationId: CONVERSATION,
    assistantMessageId,
    publicError: 'the provider refused',
  });
}

describe('createVideoGenerationJob', () => {
  it('will not hang a generation off a turn the user deleted', async () => {
    const db = seeded();
    await expect(
      createVideoGenerationJob({ db: db as unknown as DatabaseAdapter, ...jobFor(WITHDRAWN) }),
    ).rejects.toThrow(/placeholder is missing/);
    expect(db.rowsIn('video_generation_jobs')).toHaveLength(0);
  });
});

describe('failUnboundVideoGenerationTranscript', () => {
  it('hands back no content from a turn the user deleted', async () => {
    const result = await fail(seeded(), WITHDRAWN);
    expect(result.disposition).toBe('not_found');
    expect(JSON.stringify(result)).not.toContain('the answer the user deleted');
  });

  it('still reports the turn the user kept', async () => {
    const result = await fail(seeded(), KEPT);
    expect(result.disposition).not.toBe('not_found');
  });

  it('hands back nothing at all once the conversation is deleted', async () => {
    const db = seeded();
    db.rowsIn('web_conversations')[0]!['deleted_at'] = '2026-09-19T00:00:00.000Z';
    const result = await fail(db, KEPT);
    expect(result.disposition).toBe('not_found');
  });
});
