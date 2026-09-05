import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(() => null),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
  })),
}));

const mockQuery = vi.fn();
const mockExecute = vi.fn();
const mockGetUserScopedDb = vi.fn();

vi.mock('@/lib/server/neon-chat', () => ({
  normalizeMessageMetadata: (v: unknown) => v,
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...args: unknown[]) => mockGetUserScopedDb(...args),
}));

vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: vi.fn(async () => null),
  resolveOrganizationMembershipId: vi.fn(async () => null),
}));

import { POST as postBulkMessages } from '@/app/api/chat/conversations/[id]/messages/bulk/route';

const ATTACKER = 'user_attacker';
const VICTIM_CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const VICTIM_MESSAGE_ID = '22222222-2222-4222-8222-222222222222';
const ATTACKER_CONVERSATION_ID = '33333333-3333-4333-8333-333333333333';

function makeJsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUserScopedDb.mockResolvedValue({
    db: { query: mockQuery, execute: mockExecute },
    userId: ATTACKER,
    organizationId: null,
  });
});

describe('POST /api/chat/conversations/[id]/messages/bulk, IDOR guard (#17)', () => {
  function makeContext(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it('includes the conversation ownership guard in the message upsert SQL', async () => {
    mockQuery.mockResolvedValueOnce([{ id: ATTACKER_CONVERSATION_ID }]);
    mockQuery.mockResolvedValueOnce([
      {
        id: VICTIM_MESSAGE_ID,
        role: 'user',
        content: 'hello',
        model: null,
        provider: null,
        input_tokens: null,
        output_tokens: null,
        cost_cents: null,
        created_at: 'now',
        metadata: {},
      },
    ]);

    const res = await postBulkMessages(
      makeJsonRequest(
        `http://localhost/api/chat/conversations/${ATTACKER_CONVERSATION_ID}/messages/bulk`,
        { messages: [{ id: VICTIM_MESSAGE_ID, role: 'user', content: 'hello' }] },
      ),
      makeContext(ATTACKER_CONVERSATION_ID),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).messages[0]).not.toHaveProperty('cost_cents');
    expect(mockQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/user_id = \$2[\s\S]*organization_id is not distinct from \$3/),
      [ATTACKER_CONVERSATION_ID, ATTACKER, null],
    );
    const [sql] = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(sql).toContain('on conflict (id) do update');
    expect(sql).toContain('where web_messages.conversation_id = excluded.conversation_id');
  });

  it('rejects (400, not silent success) a message id owned by another conversation', async () => {
    mockQuery.mockResolvedValueOnce([{ id: ATTACKER_CONVERSATION_ID }]);
    mockQuery.mockResolvedValueOnce([]);

    const res = await postBulkMessages(
      makeJsonRequest(
        `http://localhost/api/chat/conversations/${ATTACKER_CONVERSATION_ID}/messages/bulk`,
        { messages: [{ id: VICTIM_MESSAGE_ID, role: 'user', content: 'overwrite' }] },
      ),
      makeContext(ATTACKER_CONVERSATION_ID),
    );

    expect(res.status).toBe(400);
  });

  it('still 404s when the URL conversation is not owned by the caller', async () => {
    mockQuery.mockResolvedValueOnce([]);

    const res = await postBulkMessages(
      makeJsonRequest(
        `http://localhost/api/chat/conversations/${VICTIM_CONVERSATION_ID}/messages/bulk`,
        { messages: [{ role: 'user', content: 'hi' }] },
      ),
      makeContext(VICTIM_CONVERSATION_ID),
    );

    expect(res.status).toBe(404);
  });
});
