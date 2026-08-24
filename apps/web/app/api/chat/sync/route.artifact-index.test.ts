import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const queryMock = vi.fn();

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: queryMock },
    userId: 'u1',
    organizationId: null,
  })),
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => undefined) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => undefined) }));

const { scheduleArtifactIndexing } = vi.hoisted(() => ({ scheduleArtifactIndexing: vi.fn() }));
vi.mock('@/app/api/chat/conversations/[id]/messages/lib/index-artifacts', () => ({
  scheduleArtifactIndexing,
}));

import { POST } from '@/app/api/chat/sync/route';

const CONVERSATION_ID = '0190a000-0000-7000-8000-0000000000cc';
const ASSISTANT_MESSAGE_ID = '0190a000-0000-7000-8000-0000000000aa';
const USER_MESSAGE_ID = '0190a000-0000-7000-8000-0000000000bb';

function postReq(body: unknown) {
  return new NextRequest('http://localhost/api/chat/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  queryMock.mockReset();
  scheduleArtifactIndexing.mockReset();
});

describe('POST /api/chat/sync — artifact indexing', () => {
  it('indexes an applied assistant message pushed from another surface', async () => {
    queryMock.mockResolvedValueOnce([
      { kind: 'applied', id: ASSISTANT_MESSAGE_ID, server_version: '1', current: null },
    ]);

    const res = await POST(
      postReq({
        protocolVersion: 2,
        messages: [
          {
            id: ASSISTANT_MESSAGE_ID,
            conversationId: CONVERSATION_ID,
            role: 'assistant',
            content: 'synced reply',
            baseVersion: '0',
          },
        ],
      }),
    );

    expect(res.status).toBe(200);
    expect(scheduleArtifactIndexing).toHaveBeenCalledWith({
      db: { query: queryMock },
      userId: 'u1',
      conversationId: CONVERSATION_ID,
      messageId: ASSISTANT_MESSAGE_ID,
      content: 'synced reply',
    });
  });

  it('does not index a user message or a tombstoned assistant message', async () => {
    queryMock.mockResolvedValueOnce([
      { kind: 'applied', id: USER_MESSAGE_ID, server_version: '1', current: null },
      { kind: 'applied', id: ASSISTANT_MESSAGE_ID, server_version: '2', current: null },
    ]);

    const res = await POST(
      postReq({
        protocolVersion: 2,
        messages: [
          {
            id: USER_MESSAGE_ID,
            conversationId: CONVERSATION_ID,
            role: 'user',
            content: 'hi',
            baseVersion: '0',
          },
          {
            id: ASSISTANT_MESSAGE_ID,
            conversationId: CONVERSATION_ID,
            role: 'assistant',
            content: 'deleted reply',
            baseVersion: '1',
            isDeleted: true,
          },
        ],
      }),
    );

    expect(res.status).toBe(200);
    expect(scheduleArtifactIndexing).not.toHaveBeenCalled();
  });
});
