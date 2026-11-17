import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type CloudAgentRunSearchModule = typeof import('@/lib/services/cloud-agent-run-search');

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  listCloudAgentRuns: vi.fn(),
  findActiveRun: vi.fn(),
  searchCloudAgentRuns: vi.fn(),
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

vi.mock('@/lib/services/cloud-agent-run-search', async (importOriginal) => ({
  ...(await importOriginal<CloudAgentRunSearchModule>()),
  searchCloudAgentRuns: mocks.searchCloudAgentRuns,
}));

import {
  MANAGED_CLOUD_AGENT_RUNS_SEARCH_HEADER,
  MANAGED_CLOUD_AGENT_RUNS_SEARCH_SUPPORTED,
} from '@agiworkforce/cloud-contracts';
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
    });
    await expect(response.json()).resolves.toEqual({ runs: [], nextCursor: null });
  });

  // A phone ended right after Send never read the run id from the response
  // headers; the request id it sent is the only way back to a chat turn the
  // server went on to finish.
  it('finds a chat turn by its request id in any state', async () => {
    const chatRun = {
      id: 'run-chat',
      requestId: 'agi.chat.mobile.send.op-1',
      workMode: 'chat',
      state: 'ready_for_review',
    };
    mocks.listCloudAgentRuns.mockResolvedValue({ runs: [chatRun], next: null });

    const response = await GET(
      request('?requestId=agi.chat.mobile.send.op-1&state=ready_for_review&state=failed&limit=1'),
    );

    const input = mocks.listCloudAgentRuns.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(input).not.toHaveProperty('workModes');
    expect(input).toMatchObject({ userId: 'user-owner', requestId: 'agi.chat.mobile.send.op-1' });
    await expect(response.json()).resolves.toEqual({ runs: [chatRun], nextCursor: null });
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

describe('searching Cloud tasks by text', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-owner' });
    mocks.listCloudAgentRuns.mockResolvedValue({ runs: [], next: null });
    mocks.searchCloudAgentRuns.mockResolvedValue({ runs: [], next: null });
  });

  it('searches inside the owner, state and AGI Work scope with the trimmed text', async () => {
    const response = await GET(request('?q=%20Quarterly%20report%20&state=completed&limit=10'));

    expect(response.status).toBe(200);
    expect(mocks.listCloudAgentRuns).not.toHaveBeenCalled();
    expect(mocks.searchCloudAgentRuns).toHaveBeenCalledWith(db, {
      userId: 'user-owner',
      states: ['completed'],
      requestId: undefined,
      before: undefined,
      limit: 10,
      workModes: ['agiwork'],
      text: 'Quarterly report',
    });
  });

  it('carries the cursor into the search and returns the next one', async () => {
    const cursor = Buffer.from(
      JSON.stringify({
        updatedAt: '2026-11-01T10:00:00.000Z',
        id: '8f2d3f5a-1c4e-4c3a-9f2b-6b0f9d3c1a77',
      }),
    ).toString('base64url');
    mocks.searchCloudAgentRuns.mockResolvedValue({
      runs: [],
      next: { updatedAt: '2026-10-01T10:00:00.000Z', id: '9f2d3f5a-1c4e-4c3a-9f2b-6b0f9d3c1a77' },
    });

    const response = await GET(request(`?q=invoice&cursor=${cursor}`));

    expect(mocks.searchCloudAgentRuns).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        text: 'invoice',
        before: {
          updatedAt: '2026-11-01T10:00:00.000Z',
          id: '8f2d3f5a-1c4e-4c3a-9f2b-6b0f9d3c1a77',
        },
      }),
    );
    const body = (await response.json()) as { nextCursor: string };
    expect(JSON.parse(Buffer.from(body.nextCursor, 'base64url').toString('utf8'))).toEqual({
      updatedAt: '2026-10-01T10:00:00.000Z',
      id: '9f2d3f5a-1c4e-4c3a-9f2b-6b0f9d3c1a77',
    });
  });

  it.each(['?q=', '?q=%20%20', `?q=${'x'.repeat(201)}`])(
    'refuses search text that is empty or over 200 characters before database access: %s',
    async (query) => {
      const response = await GET(request(query));

      expect(response.status).toBe(400);
      expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
      expect(mocks.searchCloudAgentRuns).not.toHaveBeenCalled();
    },
  );

  it('tells the phone the server searched, with or without text', async () => {
    const withText = await GET(request('?q=invoice'));
    const without = await GET(request());

    for (const response of [withText, without]) {
      expect(response.headers.get(MANAGED_CLOUD_AGENT_RUNS_SEARCH_HEADER)).toBe(
        MANAGED_CLOUD_AGENT_RUNS_SEARCH_SUPPORTED,
      );
    }
    expect(mocks.listCloudAgentRuns).toHaveBeenCalledTimes(1);
  });
});
