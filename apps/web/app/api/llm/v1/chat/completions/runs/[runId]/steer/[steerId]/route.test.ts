import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(() => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(() => null) }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: vi.fn() }));
vi.mock('@/lib/services/cloud-agent-run-service', () => ({
  CloudAgentRunNotFoundError: class CloudAgentRunNotFoundError extends Error {},
  CloudAgentRunSteerNotFoundError: class CloudAgentRunSteerNotFoundError extends Error {},
  CloudAgentRunSteerStillReadableError: class CloudAgentRunSteerStillReadableError extends Error {},
  withdrawCloudAgentRunSteer: vi.fn(),
}));

import { requireCsrfToken } from '@/lib/csrf';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  CloudAgentRunNotFoundError,
  CloudAgentRunSteerNotFoundError,
  CloudAgentRunSteerStillReadableError,
  withdrawCloudAgentRunSteer,
} from '@/lib/services/cloud-agent-run-service';
import { DELETE } from './route';

const RUN_ID = '0190a000-0000-7000-8000-000000000001';
const STEER_ID = '0190a000-0000-7000-8000-0000000000bb';
const ORGANIZATION_ID = '0190a000-0000-7000-8000-0000000000aa';
const db = { query: vi.fn() };

function withdrawRequest(): NextRequest {
  return new NextRequest(
    `http://localhost/api/llm/v1/chat/completions/runs/${RUN_ID}/steer/${STEER_ID}`,
    { method: 'DELETE' },
  );
}

function context(runId = RUN_ID, steerId = STEER_ID) {
  return { params: Promise.resolve({ runId, steerId }) };
}

describe('DELETE /api/llm/v1/chat/completions/runs/[runId]/steer/[steerId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserScopedDb).mockResolvedValue({
      db,
      userId: 'user-1',
      organizationId: ORGANIZATION_ID,
    } as never);
  });

  it('withdraws an unread message from a finished run in the active workspace', async () => {
    vi.mocked(withdrawCloudAgentRunSteer).mockResolvedValue({
      id: RUN_ID,
      state: 'ready_for_review',
    } as never);

    const response = await DELETE(withdrawRequest(), context());

    expect(response.status).toBe(200);
    expect(withdrawCloudAgentRunSteer).toHaveBeenCalledWith(db, {
      userId: 'user-1',
      organizationId: ORGANIZATION_ID,
      runId: RUN_ID,
      steerId: STEER_ID,
    });
    await expect(response.json()).resolves.toMatchObject({ run: { id: RUN_ID } });
  });

  it('leaves a message the task can still read where it is', async () => {
    vi.mocked(withdrawCloudAgentRunSteer).mockRejectedValue(
      new CloudAgentRunSteerStillReadableError(),
    );

    const response = await DELETE(withdrawRequest(), context());

    expect(response.status).toBe(409);
  });

  it('does not disclose a missing run, a missing message or a malformed id', async () => {
    vi.mocked(withdrawCloudAgentRunSteer).mockRejectedValueOnce(new CloudAgentRunNotFoundError());
    expect((await DELETE(withdrawRequest(), context())).status).toBe(404);

    vi.mocked(withdrawCloudAgentRunSteer).mockRejectedValueOnce(
      new CloudAgentRunSteerNotFoundError(),
    );
    expect((await DELETE(withdrawRequest(), context())).status).toBe(404);

    expect((await DELETE(withdrawRequest(), context(RUN_ID, 'not-an-id'))).status).toBe(404);
  });

  it('requires the CSRF token for a cookie session', async () => {
    vi.mocked(requireCsrfToken).mockResolvedValueOnce(new Response(null, { status: 403 }));

    const response = await DELETE(withdrawRequest(), context());

    expect(response.status).toBe(403);
    expect(withdrawCloudAgentRunSteer).not.toHaveBeenCalled();
  });
});
