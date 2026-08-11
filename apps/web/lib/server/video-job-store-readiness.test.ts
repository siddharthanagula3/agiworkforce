import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { isVideoJobStoreReady } from './video-job-store-readiness';

describe('durable video job store readiness', () => {
  it('admits only the complete table/function/workflow schema', async () => {
    const query = vi.fn().mockResolvedValue([{ ready: true }]);
    const db = { query } as never;

    await expect(isVideoJobStoreReady(db)).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(
        /mark_video_generation_outcome_unknown[\s\S]*reconcile_video_generation_billing_settlement[\s\S]*workflow_run_id[\s\S]*provider_failure_code/i,
      ),
    );
    expect(String(query.mock.calls[0]?.[0])).toMatch(
      /video_generation_erasure_fence_token[\s\S]*video_generation_erasure_fence_expires_at/i,
    );
    expect(String(query.mock.calls[0]?.[0])).toMatch(
      /conversation_id[\s\S]*assistant_message_id[\s\S]*aspect_ratio[\s\S]*generate_audio[\s\S]*actual_cost_cents[\s\S]*last_provider_event_key/i,
    );
  });

  it.each([{ rows: [{ ready: false }] }, { rows: [] }])(
    'fails closed for an incomplete schema',
    async ({ rows }) => {
      const db = { query: vi.fn().mockResolvedValue(rows) } as never;
      await expect(isVideoJobStoreReady(db)).resolves.toBe(false);
    },
  );

  it('fails closed when Neon cannot prove readiness', async () => {
    const db = { query: vi.fn().mockRejectedValue(new Error('Neon unavailable')) } as never;
    await expect(isVideoJobStoreReady(db)).resolves.toBe(false);
  });
});
