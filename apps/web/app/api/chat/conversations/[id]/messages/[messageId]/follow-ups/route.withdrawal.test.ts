import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { StatementScanPostgres, type Row } from '@/lib/services/__tests__/statement-scan-postgres';

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const WITHDRAWN_ID = '22222222-2222-4222-8222-222222222222';
const KEPT_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = 'user-1';
const ORGANIZATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const mocks = vi.hoisted(() => ({
  db: null as unknown,
  generate: vi.fn(async () => ['a follow-up']),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: mocks.db,
    userId: USER_ID,
    organizationId: ORGANIZATION_ID,
  })),
}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/cors', () => ({
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: vi.fn(async () => ({ plan_tier: 'pro' })) },
}));
vi.mock('../../lib/generate-follow-ups', () => ({
  FOLLOW_UP_SUGGESTIONS_METADATA_KEY: 'followUpSuggestions',
  generateFollowUpSuggestions: mocks.generate,
}));

const { POST } = await import('./route');

function answer(id: string, content: string, deletedAt: string | null): Row {
  return {
    id,
    conversation_id: CONVERSATION_ID,
    role: 'assistant',
    content,
    metadata: { searchResults: [{ title: 'a source', url: 'https://example.invalid' }] },
    deleted_at: deletedAt,
  };
}

function seed(conversationDeletedAt: string | null = null) {
  mocks.db = new StatementScanPostgres({
    web_conversations: [
      {
        id: CONVERSATION_ID,
        user_id: USER_ID,
        organization_id: ORGANIZATION_ID,
        deleted_at: conversationDeletedAt,
      },
    ],
    web_messages: [
      answer(WITHDRAWN_ID, 'the answer the user deleted', '2026-09-19T00:00:00.000Z'),
      answer(KEPT_ID, 'the answer the user kept', null),
    ],
  });
}

async function post(messageId: string) {
  return POST(new NextRequest('https://example.invalid/api', { method: 'POST' }), {
    params: Promise.resolve({ id: CONVERSATION_ID, messageId }),
  });
}

describe('POST follow-ups', () => {
  it('generates nothing from a turn the user deleted', async () => {
    seed();
    mocks.generate.mockClear();
    const response = await post(WITHDRAWN_ID);
    expect(response.status).toBe(404);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('still answers for a turn the user kept', async () => {
    seed();
    mocks.generate.mockClear();
    const response = await post(KEPT_ID);
    expect(response.status).toBe(200);
    expect(mocks.generate).toHaveBeenCalledOnce();
    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({ answer: 'the answer the user kept' }),
    );
  });

  it('refuses the whole thread once the conversation is deleted', async () => {
    seed('2026-09-19T00:00:00.000Z');
    mocks.generate.mockClear();
    const response = await post(KEPT_ID);
    expect(response.status).toBe(404);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
