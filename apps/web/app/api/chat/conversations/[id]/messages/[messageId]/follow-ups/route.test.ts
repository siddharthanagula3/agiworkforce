import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const MESSAGE_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = 'user-1';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  generate: vi.fn(),
}));

const db = { query: mocks.query, execute: mocks.execute };

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({ db, userId: USER_ID, organizationId: null })),
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
vi.mock('../../lib/generate-follow-ups', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/generate-follow-ups')>();
  return {
    ...actual,
    generateFollowUpSuggestions: (...args: unknown[]) => mocks.generate(...(args as [])),
  };
});

const { POST } = await import('./route');

const SEARCHED_METADATA = {
  searchResults: {
    query: 'framework laptop 13',
    results: [
      {
        url: 'https://frame.work/laptop13',
        title: 'Framework Laptop 13',
        snippet: 'A repairable laptop.',
      },
    ],
  },
};

function request(): NextRequest {
  return new NextRequest(
    `http://localhost/api/chat/conversations/${CONVERSATION_ID}/messages/${MESSAGE_ID}/follow-ups`,
    { method: 'POST' },
  );
}

function context() {
  return { params: Promise.resolve({ id: CONVERSATION_ID, messageId: MESSAGE_ID }) };
}

function respondWith(metadata: Record<string, unknown> | null) {
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes('web_conversations')) return [{ id: CONVERSATION_ID }];
    if (sql.includes('web_messages')) {
      return [{ content: 'The chassis changed in 2026.', role: 'assistant', metadata }];
    }
    return [];
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.execute.mockResolvedValue(1);
  mocks.generate.mockResolvedValue(['What changed?', 'Who makes it?', 'Is it repairable?']);
});

describe('follow-ups route', () => {
  it('generates exactly once for a turn that searched', async () => {
    respondWith(SEARCHED_METADATA);

    const response = await POST(request(), context());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      suggestions: ['What changed?', 'Who makes it?', 'Is it repairable?'],
      cached: false,
    });
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });

  it('generates nothing for a turn that did not search', async () => {
    respondWith({});

    const response = await POST(request(), context());

    expect(await response.json()).toEqual({ suggestions: [], cached: false });
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('serves a cached set without a second generation', async () => {
    respondWith({ ...SEARCHED_METADATA, followUpSuggestions: ['Cached question?'] });

    const response = await POST(request(), context());

    expect(await response.json()).toEqual({ suggestions: ['Cached question?'], cached: true });
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('caches the generated set on the turn that produced it', async () => {
    respondWith(SEARCHED_METADATA);

    await POST(request(), context());

    expect(mocks.execute).toHaveBeenCalledTimes(1);
    const [sql, params] = mocks.execute.mock.calls[0] ?? [];
    expect(String(sql)).toContain('web_messages');
    expect(JSON.parse(String((params as unknown[])[0]))).toEqual({
      followUpSuggestions: ['What changed?', 'Who makes it?', 'Is it repairable?'],
    });
  });
});
