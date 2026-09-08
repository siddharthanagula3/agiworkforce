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

/**
 * The push writes the row, then the route reads it back to index it. Both
 * statements are answered here so a test can make the two disagree, which is
 * the whole point of reading the row rather than trusting the payload.
 */
function stubPush(options: { storedContent: string | null; appliedIds?: string[] }) {
  const applied = options.appliedIds ?? [ASSISTANT_MESSAGE_ID];
  queryMock.mockImplementation(async (sql: string) => {
    const text = String(sql);
    if (text.includes('insert into web_messages')) {
      return applied.map((id, index) => ({
        kind: 'applied',
        id,
        server_version: String(index + 1),
        current: null,
      }));
    }
    if (text.includes('from web_messages as message')) {
      return options.storedContent === null
        ? []
        : [
            {
              id: ASSISTANT_MESSAGE_ID,
              conversation_id: CONVERSATION_ID,
              content: options.storedContent,
            },
          ];
    }
    return [];
  });
}

beforeEach(() => {
  queryMock.mockReset();
  scheduleArtifactIndexing.mockReset();
});

describe('POST /api/chat/sync, artifact indexing', () => {
  it('indexes an applied assistant message pushed from another surface', async () => {
    stubPush({ storedContent: 'synced reply' });

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
    stubPush({ storedContent: null, appliedIds: [USER_MESSAGE_ID, ASSISTANT_MESSAGE_ID] });

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

  it('indexes what the row holds, not what the client sent', async () => {
    stubPush({ storedContent: 'what the server stored' });

    const res = await POST(
      postReq({
        protocolVersion: 2,
        messages: [
          {
            id: ASSISTANT_MESSAGE_ID,
            conversationId: CONVERSATION_ID,
            role: 'assistant',
            content: 'what the client claimed',
            baseVersion: '0',
          },
        ],
      }),
    );

    expect(res.status).toBe(200);
    expect(scheduleArtifactIndexing).toHaveBeenCalledTimes(1);
    expect(scheduleArtifactIndexing).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'what the server stored' }),
    );
  });

  it('reads the row back scoped to the caller, not by id alone', async () => {
    stubPush({ storedContent: 'stored' });

    await POST(
      postReq({
        protocolVersion: 2,
        messages: [
          {
            id: ASSISTANT_MESSAGE_ID,
            conversationId: CONVERSATION_ID,
            role: 'assistant',
            content: 'anything',
            baseVersion: '0',
          },
        ],
      }),
    );

    const read = queryMock.mock.calls.find((call) =>
      String(call[0]).includes('from web_messages as message'),
    );
    expect(read).toBeDefined();
    expect(String(read?.[0])).toContain('conversation.user_id = $2');
    expect(String(read?.[0])).toContain("message.role = 'assistant'");
    expect(String(read?.[0])).toContain('message.deleted_at is null');
    expect(read?.[1]).toEqual([[ASSISTANT_MESSAGE_ID], 'u1']);
  });

  it('indexes nothing when the row is gone by the time it is read', async () => {
    stubPush({ storedContent: null });

    await POST(
      postReq({
        protocolVersion: 2,
        messages: [
          {
            id: ASSISTANT_MESSAGE_ID,
            conversationId: CONVERSATION_ID,
            role: 'assistant',
            content: 'client copy',
            baseVersion: '0',
          },
        ],
      }),
    );

    expect(scheduleArtifactIndexing).not.toHaveBeenCalled();
  });
});
