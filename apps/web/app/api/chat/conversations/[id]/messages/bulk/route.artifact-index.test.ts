import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(() => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
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
  resolveOrganizationMembershipId: vi.fn(),
}));

const { scheduleArtifactIndexing } = vi.hoisted(() => ({ scheduleArtifactIndexing: vi.fn() }));
vi.mock('../lib/index-artifacts', () => ({ scheduleArtifactIndexing }));

import { POST as postBulkMessages } from './route';

const USER_ID = 'user_1';
const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest(
    `http://localhost/api/chat/conversations/${CONVERSATION_ID}/messages/bulk`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );
}

function makeContext() {
  return { params: Promise.resolve({ id: CONVERSATION_ID }) };
}

function mockSavedRow(id: string, role: string, content: string) {
  mockQuery.mockResolvedValueOnce([
    {
      id,
      role,
      content,
      model: null,
      provider: null,
      input_tokens: null,
      output_tokens: null,
      created_at: 'now',
      metadata: {},
    },
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUserScopedDb.mockResolvedValue({
    db: { query: mockQuery, execute: mockExecute },
    userId: USER_ID,
    organizationId: null,
  });
  mockQuery.mockResolvedValueOnce([{ id: CONVERSATION_ID }]); // ownership check
});

describe('POST /api/chat/conversations/[id]/messages/bulk, artifact indexing', () => {
  it('indexes a bulk-saved assistant message', async () => {
    const messageId = '22222222-2222-4222-8222-222222222222';
    mockSavedRow(messageId, 'assistant', 'assistant reply');

    const res = await postBulkMessages(
      makeRequest({ messages: [{ id: messageId, role: 'assistant', content: 'assistant reply' }] }),
      makeContext(),
    );

    expect(res.status).toBe(200);
    expect(scheduleArtifactIndexing).toHaveBeenCalledWith({
      db: { query: mockQuery, execute: mockExecute },
      userId: USER_ID,
      conversationId: CONVERSATION_ID,
      messageId,
      content: 'assistant reply',
    });
  });

  it('leaves user and system messages unindexed', async () => {
    const userMessageId = '33333333-3333-4333-8333-333333333333';
    const systemMessageId = '44444444-4444-4444-8444-444444444444';
    mockSavedRow(userMessageId, 'user', 'hello');
    mockSavedRow(systemMessageId, 'system', 'context note');

    const res = await postBulkMessages(
      makeRequest({
        messages: [
          { id: userMessageId, role: 'user', content: 'hello' },
          { id: systemMessageId, role: 'system', content: 'context note' },
        ],
      }),
      makeContext(),
    );

    expect(res.status).toBe(200);
    expect(scheduleArtifactIndexing).not.toHaveBeenCalled();
  });
});
