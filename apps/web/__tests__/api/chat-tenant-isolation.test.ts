/**
 * Tenant-isolation regression tests (AUDIT CRITICAL #16 / #17).
 *
 * #16 (BOLA): POST /api/chat/sessions with a client-supplied id used
 * `on conflict (id) do update` with NO user_id guard — any authenticated
 * user could overwrite another user's conversation metadata by UUID.
 *
 * #17 (IDOR): POST /api/chat/conversations/[id]/messages/bulk upserted by
 * global message PK with NO conversation guard — posting a victim's message
 * UUID overwrote the victim's row and leaked provider/token/cost fields via
 * RETURNING.
 *
 * Both upserts now carry a WHERE guard on the DO UPDATE; a foreign-row
 * conflict updates nothing and the missing RETURNING row is rejected
 * explicitly instead of silently swallowed (or crashed on).
 */

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
const mockRequireCurrentUserId = vi.fn();

vi.mock('@/lib/server/neon-chat', () => ({
  getNeonChatDb: () => ({ query: mockQuery, execute: mockExecute }),
  requireCurrentUserId: (...args: unknown[]) => mockRequireCurrentUserId(...args),
  normalizeMessageMetadata: (v: unknown) => v,
}));

import { POST as postSession } from '@/app/api/chat/sessions/route';
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
  mockRequireCurrentUserId.mockResolvedValue(ATTACKER);
});

describe('POST /api/chat/sessions — cross-tenant upsert guard (#16)', () => {
  it('includes the user_id ownership guard in the upsert SQL', async () => {
    mockQuery.mockResolvedValueOnce([
      {
        id: VICTIM_CONVERSATION_ID,
        title: 't',
        model: null,
        pinned: false,
        project_id: null,
        created_at: 'now',
        updated_at: 'now',
        message_count: '0',
        preview: null,
      },
    ]);

    const res = await postSession(
      makeJsonRequest('http://localhost/api/chat/sessions', {
        id: VICTIM_CONVERSATION_ID,
        title: 'hijacked',
      }),
    );

    expect(res.status).toBe(201);
    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('on conflict (id) do update');
    expect(sql).toContain('where web_conversations.user_id = excluded.user_id');
  });

  it('returns 404 (not 500, not success) when the guarded upsert touches no row', async () => {
    // Foreign-owned conversation: guard filters the update, RETURNING is empty.
    mockQuery.mockResolvedValueOnce([]);

    const res = await postSession(
      makeJsonRequest('http://localhost/api/chat/sessions', {
        id: VICTIM_CONVERSATION_ID,
        title: 'hijacked',
      }),
    );

    expect(res.status).toBe(404);
  });
});

describe('POST /api/chat/conversations/[id]/messages/bulk — IDOR guard (#17)', () => {
  function makeContext(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it('includes the conversation ownership guard in the message upsert SQL', async () => {
    // 1st query: conversation ownership check passes (attacker's own convo)
    mockQuery.mockResolvedValueOnce([{ id: ATTACKER_CONVERSATION_ID }]);
    // 2nd query: upsert returns the row (same-conversation message)
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
    const [sql] = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(sql).toContain('on conflict (id) do update');
    expect(sql).toContain('where web_messages.conversation_id = excluded.conversation_id');
  });

  it('rejects (400, not silent success) a message id owned by another conversation', async () => {
    // Ownership check on attacker's conversation passes…
    mockQuery.mockResolvedValueOnce([{ id: ATTACKER_CONVERSATION_ID }]);
    // …but the guarded upsert touches no row (victim's message id).
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
    mockQuery.mockResolvedValueOnce([]); // ownership check fails

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
