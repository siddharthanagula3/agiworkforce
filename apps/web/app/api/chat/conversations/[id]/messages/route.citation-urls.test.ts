import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const MESSAGE_ID = '55555555-5555-4555-8555-555555555555';
const USER_ID = 'user-1';
const ORGANIZATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const REDIRECT = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc';
const PUBLISHER = 'https://www.reuters.com/world/story';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  resolveRoutingRedirectUrls: vi.fn(),
}));

const db: {
  query: typeof mocks.query;
  execute: typeof mocks.execute;
  transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
} = {
  query: mocks.query,
  execute: mocks.execute,
  transaction: (fn) => fn(db),
};

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-chat', () => ({
  normalizeMessageMetadata: (value: unknown) => value,
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({ db, userId: USER_ID, organizationId: ORGANIZATION_ID })),
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
vi.mock('./lib/generate-title', () => ({ scheduleConversationTitleGeneration: vi.fn() }));
vi.mock('./lib/index-artifacts', () => ({ scheduleArtifactIndexing: vi.fn() }));

// The host check stays real: it is what decides whether this request pays for a
// network call at all, and a fixture host would make that decision here rather
// than in the code under test. Only the hop itself is stubbed.
vi.mock('@/lib/web-search/web-search-tool', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/web-search/web-search-tool')>()),
  resolveRoutingRedirectUrls: (results: unknown, overrides: unknown) =>
    mocks.resolveRoutingRedirectUrls(results, overrides),
}));

const { POST } = await import('./route');

const CONVERSATION_SELECT = /select id, model, active_leaf_message_id/;
const INSERT = /insert into web_messages/;

const context = { params: Promise.resolve({ id: CONVERSATION_ID }) };

function request(body: unknown): NextRequest {
  return new NextRequest(
    `https://agiworkforce.com/api/chat/conversations/${CONVERSATION_ID}/messages`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );
}

function savedRow() {
  return {
    id: MESSAGE_ID,
    parent_id: null,
    role: 'assistant',
    content: 'an answer',
    model: null,
    provider: null,
    input_tokens: 0,
    output_tokens: 0,
    created_at: '2026-09-01T00:00:00.000Z',
    metadata: {},
  };
}

/** The metadata jsonb the insert actually wrote. */
function storedMetadata(): Record<string, unknown> {
  const call = mocks.query.mock.calls.find(([sql]) => INSERT.test(String(sql)));
  expect(call, 'the message should have been inserted').toBeDefined();
  return JSON.parse(String((call?.[1] as unknown[])[5])) as Record<string, unknown>;
}

function assistantSave(metadata: Record<string, unknown>): unknown {
  return { id: MESSAGE_ID, role: 'assistant', content: 'an answer', skipLlm: true, metadata };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockImplementation(async (sql: string) => {
    if (CONVERSATION_SELECT.test(sql)) {
      return [{ id: CONVERSATION_ID, model: null, active_leaf_message_id: null }];
    }
    if (INSERT.test(sql)) return [savedRow()];
    return [];
  });
  mocks.execute.mockResolvedValue(1);
  mocks.resolveRoutingRedirectUrls.mockImplementation(async (results: { url: string }[]) =>
    results.map((result) => (result.url === REDIRECT ? { url: PUBLISHER } : result)),
  );
});

/**
 * The server patches the row it wrote once the stream closes, but the client's
 * own save merges into that same row under `metadata || excluded.metadata`. A
 * save that is slow or has been retried lands after the patch and would put the
 * routing provider's redirects back, so this writer resolves them too and
 * whichever of the two lands last stores publisher URLs.
 */
describe('POST /api/chat/conversations/[id]/messages, citation hrefs', () => {
  it('stores the publisher URL when a late client save carries the redirect', async () => {
    const response = await POST(
      request(
        assistantSave({
          searchResults: [{ url: REDIRECT, title: 'reuters.com', snippet: 'a snippet' }],
          citations: [{ type: 'url_citation', url: REDIRECT, title: 'reuters.com' }],
        }),
      ),
      context,
    );

    expect(response.status).toBe(200);
    expect(storedMetadata()['searchResults']).toEqual([
      { url: PUBLISHER, title: 'reuters.com', snippet: 'a snippet' },
    ]);
    expect(storedMetadata()['citations']).toEqual([
      { type: 'url_citation', url: PUBLISHER, title: 'reuters.com' },
    ]);
  });

  /**
   * This is a request a user is waiting on, unlike the post-stream patch. Most
   * turns cite publishers directly, so the gate is a synchronous walk of two
   * metadata keys: no hop, and no second statement to undo what the insert
   * already stored correctly.
   */
  it('makes no network call and no extra write when the payload carries no redirect', async () => {
    await POST(
      request(
        assistantSave({
          searchResults: [{ url: PUBLISHER, title: 'Reuters', snippet: '' }],
          citations: [{ type: 'url_citation', url: 'https://apnews.com/article/a', title: 'AP' }],
        }),
      ),
      context,
    );

    expect(mocks.resolveRoutingRedirectUrls).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls.filter(([sql]) => INSERT.test(String(sql)))).toHaveLength(1);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(storedMetadata()['searchResults']).toEqual([
      { url: PUBLISHER, title: 'Reuters', snippet: '' },
    ]);
  });

  /**
   * The client's copy is the richer one: `searchResults` is an array on one path
   * and a `{ results, sources }` object on another, and it carries keys the
   * server never writes. Only href strings are substituted, so nothing else the
   * save was going to store is lost.
   */
  it('substitutes hrefs inside the shape the client sent without reshaping it', async () => {
    await POST(
      request(
        assistantSave({
          searchResults: {
            results: [{ url: REDIRECT, title: 'Reuters', favicon: 'reuters.ico' }],
            sources: [REDIRECT],
          },
          toolTimeline: [{ id: 'search-1', status: 'complete' }],
        }),
      ),
      context,
    );

    expect(storedMetadata()['searchResults']).toEqual({
      results: [{ url: PUBLISHER, title: 'Reuters', favicon: 'reuters.ico' }],
      sources: [PUBLISHER],
    });
    expect(storedMetadata()['toolTimeline']).toEqual([{ id: 'search-1', status: 'complete' }]);
  });

  /**
   * A citation href is cosmetic next to the message itself. A resolver that
   * throws must cost the reader the publisher domain, never the save.
   */
  it('saves the message with the redirect it arrived with when resolution throws', async () => {
    mocks.resolveRoutingRedirectUrls.mockRejectedValue(new Error('resolver exploded'));

    const response = await POST(
      request(assistantSave({ citations: [{ type: 'url_citation', url: REDIRECT, title: 'R' }] })),
      context,
    );

    expect(response.status).toBe(200);
    expect(storedMetadata()['citations']).toEqual([
      { type: 'url_citation', url: REDIRECT, title: 'R' },
    ]);
  });
});
