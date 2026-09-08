import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  listCloudAgentRuns: vi.fn(),
  findActiveRun: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/cors', () => ({
  getCorsHeaders: vi.fn(() => ({})),
  getSecurityHeaders: vi.fn(() => ({})),
  handleCorsPreflightRequest: vi.fn(() => null),
  withCorsRoute: vi.fn((handler) => handler),
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/services/cloud-agent-run-service', () => ({
  listCloudAgentRuns: mocks.listCloudAgentRuns,
  findActiveCloudAgentRunForConversation: mocks.findActiveRun,
}));

import { GET } from './route';

const db = { query: vi.fn() };

function request(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/llm/v1/chat/completions/runs${query}`);
}

describe('GET /api/llm/v1/chat/completions/runs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-owner' });
    mocks.listCloudAgentRuns.mockResolvedValue({ runs: [], next: null });
    mocks.findActiveRun.mockResolvedValue(null);
  });

  it('passes an exact request identity through the authenticated tenant and state filters', async () => {
    const response = await GET(
      request('?requestId=request-1&state=completed&state=cancelled&limit=1'),
    );

    expect(response.status).toBe(200);
    expect(mocks.listCloudAgentRuns).toHaveBeenCalledWith(db, {
      userId: 'user-owner',
      states: ['completed', 'cancelled'],
      requestId: 'request-1',
      before: undefined,
      limit: 1,
      workModes: ['agiwork'],
    });
    await expect(response.json()).resolves.toEqual({ runs: [], nextCursor: null });
  });

  // Tasks is the AGI Work surface. An ordinary `chat` turn also writes a
  // cloud_agent_runs row, so without the work-mode filter every conversation
  // was listed here as a task.
  it('lists AGI Work runs only', async () => {
    await GET(request());

    expect(mocks.listCloudAgentRuns).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ workModes: ['agiwork'] }),
    );
  });

  it.each([
    '?requestId=bad%20key',
    `?requestId=${'x'.repeat(129)}`,
    '?requestId=request-1&requestId=request-2',
  ])(
    'rejects a malformed or ambiguous request identity before database access: %s',
    async (query) => {
      const response = await GET(request(query));

      expect(response.status).toBe(400);
      expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
      expect(mocks.listCloudAgentRuns).not.toHaveBeenCalled();
    },
  );
});

/**
 * A reloaded transcript could not tell a turn that is still running from one
 * that produced nothing: the only endpoint listing runs is scoped to AGI Work,
 * deliberately, so an ordinary chat turn's run was invisible to it and the
 * transcript fell back to a stopwatch.
 */
describe('asking whether one conversation has a turn in flight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-owner' });
    mocks.listCloudAgentRuns.mockResolvedValue({ runs: [], next: null });
    mocks.findActiveRun.mockResolvedValue(null);
  });

  const CONVERSATION_ID = '8f2d3f5a-1c4e-4c3a-9f2b-6b0f9d3c1a77';

  it('answers for a chat turn, which the AGI Work listing deliberately hides', async () => {
    mocks.findActiveRun.mockResolvedValue({ id: 'run-1', state: 'running' });

    const response = await GET(request(`?conversationId=${CONVERSATION_ID}`));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      runs: [{ id: 'run-1', state: 'running' }],
      nextCursor: null,
    });
    expect(mocks.findActiveRun).toHaveBeenCalledWith(db, {
      userId: 'user-owner',
      conversationId: CONVERSATION_ID,
    });
    expect(mocks.listCloudAgentRuns).not.toHaveBeenCalled();
  });

  it('says so plainly when that conversation has nothing in flight', async () => {
    const response = await GET(request(`?conversationId=${CONVERSATION_ID}`));

    await expect(response.json()).resolves.toEqual({ runs: [], nextCursor: null });
  });

  it('leaves the Tasks listing exactly as it was', async () => {
    await GET(request('?limit=5'));

    expect(mocks.findActiveRun).not.toHaveBeenCalled();
    expect(mocks.listCloudAgentRuns).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ workModes: ['agiwork'] }),
    );
  });

  it('refuses a conversation id that is not one', async () => {
    const response = await GET(request('?conversationId=not-a-uuid'));

    expect(response.status).toBe(400);
    expect(mocks.findActiveRun).not.toHaveBeenCalled();
  });
});
