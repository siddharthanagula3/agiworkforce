import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(() => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(() => null) }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: vi.fn() }));
vi.mock('@/lib/services/cloud-agent-run-service', () => ({
  CloudAgentRunNotFoundError: class CloudAgentRunNotFoundError extends Error {},
  CloudAgentRunNotPausableError: class CloudAgentRunNotPausableError extends Error {},
  requestCloudAgentRunPause: vi.fn(),
}));

import { requireCsrfToken } from '@/lib/csrf';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  CloudAgentRunNotFoundError,
  CloudAgentRunNotPausableError,
  requestCloudAgentRunPause,
} from '@/lib/services/cloud-agent-run-service';
import { POST } from './route';

const RUN_ID = '0190a000-0000-7000-8000-000000000001';
const db = { query: vi.fn() };
const context = { params: Promise.resolve({ runId: RUN_ID }) };

function pauseRequest(): NextRequest {
  return new NextRequest(`http://localhost/api/llm/v1/chat/completions/runs/${RUN_ID}/pause`, {
    method: 'POST',
  });
}

describe('POST /api/llm/v1/chat/completions/runs/[runId]/pause', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserScopedDb).mockResolvedValue({ db, userId: 'user-1' } as never);
  });

  it('accepts the request and returns the run still working with its pause pending', async () => {
    vi.mocked(requestCloudAgentRunPause).mockResolvedValue({
      id: RUN_ID,
      state: 'running',
      workState: 'running',
      pauseRequestedAt: '2026-09-16T20:00:05.000Z',
    } as never);

    const response = await POST(pauseRequest(), context);

    expect(response.status).toBe(202);
    expect(requestCloudAgentRunPause).toHaveBeenCalledWith(db, { userId: 'user-1', runId: RUN_ID });
    await expect(response.json()).resolves.toMatchObject({
      run: { pauseRequestedAt: '2026-09-16T20:00:05.000Z' },
    });
  });

  it('refuses a run that has nothing left to pause', async () => {
    vi.mocked(requestCloudAgentRunPause).mockRejectedValue(
      new CloudAgentRunNotPausableError('ready_for_review'),
    );

    const response = await POST(pauseRequest(), context);

    expect(response.status).toBe(409);
  });

  it('does not disclose a missing or cross-tenant run', async () => {
    vi.mocked(requestCloudAgentRunPause).mockRejectedValue(new CloudAgentRunNotFoundError());

    const response = await POST(pauseRequest(), context);

    expect(response.status).toBe(404);
  });

  it('requires the CSRF token for a cookie session', async () => {
    vi.mocked(requireCsrfToken).mockResolvedValueOnce(new Response(null, { status: 403 }));

    const response = await POST(pauseRequest(), context);

    expect(response.status).toBe(403);
    expect(requestCloudAgentRunPause).not.toHaveBeenCalled();
  });
});
