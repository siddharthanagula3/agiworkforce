import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(() => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(() => null) }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: vi.fn() }));
vi.mock('@/lib/services/cloud-agent-run-service', () => ({
  CloudAgentRunNotFoundError: class CloudAgentRunNotFoundError extends Error {},
  getCloudAgentRun: vi.fn(),
  requestCloudAgentRunCancellation: vi.fn(),
}));

import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  getCloudAgentRun,
  requestCloudAgentRunCancellation,
} from '@/lib/services/cloud-agent-run-service';
import { GET, OPTIONS, POST } from '@/app/api/llm/v1/chat/completions/runs/[runId]/route';

const db = { query: vi.fn() };
const run = {
  id: '0190a000-0000-7000-8000-000000000001',
  userId: 'user-1',
  requestId: 'agi.chat.web.send.turn-1',
  conversationId: '0190a000-0000-7000-8000-000000000099',
  originSurface: 'web',
  workMode: 'agiwork',
  state: 'running',
  provider: 'anthropic',
  model: 'claude-test',
  lastEventSequence: 2,
  cancellationRequestedAt: null,
  completedAt: null,
  createdAt: '2026-07-17T20:00:00.000Z',
  updatedAt: '2026-07-17T20:00:01.000Z',
};
const event = {
  schemaVersion: 3,
  sessionId: run.conversationId,
  turnId: run.requestId,
  sequence: 2,
  emittedAtMs: 1_752_780_000_000,
  event: { type: 'lifecycle', phase: 'started' },
};
const context = { params: Promise.resolve({ runId: run.id }) };

describe('/api/llm/v1/chat/completions/runs/[runId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserScopedDb).mockResolvedValue({ db, userId: 'user-1' } as never);
  });

  it('returns owner-scoped state plus canonical events after a cursor', async () => {
    vi.mocked(getCloudAgentRun).mockResolvedValue({ run, events: [event] } as never);

    const response = await GET(
      new NextRequest(
        `http://localhost/api/llm/v1/chat/completions/runs/${run.id}?after=1&limit=50`,
      ),
      context,
    );

    expect(response.status).toBe(200);
    expect(getCloudAgentRun).toHaveBeenCalledWith(db, {
      userId: 'user-1',
      runId: run.id,
      afterSequence: 1,
      limit: 50,
    });
    await expect(response.json()).resolves.toMatchObject({
      run: { id: run.id, state: 'running' },
      events: [event],
      nextAfterSequence: 2,
    });
  });

  it('advances the replay cursor only through events included in this page', async () => {
    vi.mocked(getCloudAgentRun).mockResolvedValue({
      run: { ...run, lastEventSequence: 100 },
      events: [event],
    } as never);

    const response = await GET(
      new NextRequest(
        `http://localhost/api/llm/v1/chat/completions/runs/${run.id}?after=1&limit=1`,
      ),
      context,
    );

    await expect(response.json()).resolves.toMatchObject({ nextAfterSequence: 2 });
  });

  it('allows authenticated Desktop and Mobile clients to read the reconnect cursor', async () => {
    vi.mocked(getCloudAgentRun).mockResolvedValue({ run, events: [] } as never);
    const url = `http://localhost/api/llm/v1/chat/completions/runs/${run.id}`;

    const response = await GET(
      new NextRequest(url, { headers: { Origin: 'https://tauri.localhost' } }),
      context,
    );
    const preflight = OPTIONS(
      new NextRequest(url, {
        method: 'OPTIONS',
        headers: { Origin: 'https://tauri.localhost' },
      }),
    );

    expect(response.headers.get('access-control-allow-origin')).toBe('https://tauri.localhost');
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('https://tauri.localhost');
  });

  it('does not disclose a missing or cross-tenant run', async () => {
    vi.mocked(getCloudAgentRun).mockResolvedValue(null);

    const response = await GET(
      new NextRequest(`http://localhost/api/llm/v1/chat/completions/runs/${run.id}`),
      context,
    );

    expect(response.status).toBe(404);
  });

  it('records an authenticated cancellation request', async () => {
    vi.mocked(requestCloudAgentRunCancellation).mockResolvedValue({
      ...run,
      cancellationRequestedAt: '2026-07-17T20:00:02.000Z',
    } as never);

    const response = await POST(
      new NextRequest(`http://localhost/api/llm/v1/chat/completions/runs/${run.id}`, {
        method: 'POST',
      }),
      context,
    );

    expect(response.status).toBe(202);
    expect(requestCloudAgentRunCancellation).toHaveBeenCalledWith(db, {
      userId: 'user-1',
      runId: run.id,
    });
    await expect(response.json()).resolves.toMatchObject({
      run: {
        state: 'running',
        cancellationRequestedAt: '2026-07-17T20:00:02.000Z',
      },
    });
  });
});
