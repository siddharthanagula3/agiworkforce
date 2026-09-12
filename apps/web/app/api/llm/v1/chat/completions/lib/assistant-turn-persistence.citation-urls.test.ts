import { beforeEach, describe, expect, it, vi } from 'vitest';

const CONVERSATION_ID = '77777777-7777-4777-8777-777777777777';
const MESSAGE_ID = '88888888-8888-4888-8888-888888888888';
const USER_ID = 'user-owner';

const dnsMocks = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock('node:dns/promises', () => ({
  default: { lookup: dnsMocks.lookup },
  lookup: dnsMocks.lookup,
}));

const executed: Array<{ sql: string; params: unknown[] }> = [];
let storedMetadata: Record<string, unknown> | null = null;

const db = {
  query: vi.fn(async () => (storedMetadata ? [{ metadata: storedMetadata }] : [])),
  execute: vi.fn(async (sql: string, params: unknown[] = []) => {
    executed.push({ sql, params });
    return 1;
  }),
  transaction: vi.fn(),
};

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => db }));
vi.mock('@/lib/server/claimed-user-scope-db', () => ({ createClaimedUserScopedDb: () => db }));
vi.mock('@/app/api/chat/conversations/[id]/messages/lib/index-artifacts', () => ({
  scheduleArtifactIndexing: vi.fn(),
}));

import { patchAssistantTurnSourceUrls } from './assistant-turn-persistence';
import type { ProcessedRequest } from './request-processor';

const processed = {
  requestId: 'req-citation-urls',
  conversationId: CONVERSATION_ID,
  assistantMessageId: MESSAGE_ID,
  conversationIsTemporary: false,
  organizationId: null,
} as unknown as ProcessedRequest;

const REDIRECT = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect';

function redirectTo(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

function patchedMetadata(): Record<string, unknown> {
  const update = executed.find((call) => call.sql.includes('update web_messages'));
  expect(update, 'the turn should have been patched').toBeDefined();
  return JSON.parse(String(update?.params[3])) as Record<string, unknown>;
}

beforeEach(() => {
  executed.length = 0;
  storedMetadata = null;
  vi.clearAllMocks();
  dnsMocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
});

/**
 * A plain grounded chat turn has no ingestion hop the way a research run does:
 * its sources travel from the provider frame through the assembler to the
 * client untouched, so the href stored on the row stayed Google's
 * `grounding-api-redirect` link. Those redirects expire, so every saved
 * conversation quietly accumulated dead citations. Resolving them is a network
 * call and cannot sit in the streaming translation path, so the row is written
 * with what arrived and patched once the stream is closed.
 */
describe('a persisted grounded turn is patched to the publisher URLs', () => {
  it('replaces the routing redirect on both the sources and the citations', async () => {
    storedMetadata = {
      searchResults: [
        { url: `${REDIRECT}/both-lists`, title: 'reuters.com', snippet: 'a snippet' },
      ],
      citations: [{ type: 'url_citation', url: `${REDIRECT}/both-lists`, title: 'reuters.com' }],
    };
    const fetchImpl = vi.fn(async () =>
      redirectTo('https://www.reuters.com/world/story'),
    ) as unknown as typeof fetch;

    await patchAssistantTurnSourceUrls({
      processed,
      userId: USER_ID,
      sources: [{ url: `${REDIRECT}/both-lists`, title: 'reuters.com', snippet: 'a snippet' }],
      overrides: { fetchImpl },
    });

    expect(patchedMetadata()['searchResults']).toEqual([
      { url: 'https://www.reuters.com/world/story', title: 'reuters.com', snippet: 'a snippet' },
    ]);
    expect(patchedMetadata()['citations']).toEqual([
      { type: 'url_citation', url: 'https://www.reuters.com/world/story', title: 'reuters.com' },
    ]);
  });

  /**
   * The `[n]` markers in the answer the reader is already looking at count
   * positions in these lists. Two grounded chunks can stand in front of one
   * article, so deduplicating on the resolved URL would drop an entry and
   * renumber every marker after it, silently repointing citations in text that
   * is already on screen.
   */
  it('keeps every entry at the position the answer already cited it in', async () => {
    const first = `${REDIRECT}/order-first`;
    const second = `${REDIRECT}/order-second`;
    storedMetadata = {
      citations: [
        { type: 'url_citation', url: first, title: 'AP News' },
        { type: 'url_citation', url: 'https://www.reuters.com/world/kept', title: 'Reuters' },
        { type: 'url_citation', url: second, title: 'AP News' },
      ],
    };
    // Both redirects stand in front of the same article.
    const fetchImpl = vi.fn(async () =>
      redirectTo('https://apnews.com/article/same'),
    ) as unknown as typeof fetch;

    await patchAssistantTurnSourceUrls({
      processed,
      userId: USER_ID,
      citations: [
        { type: 'url_citation', url: first, title: 'AP News' },
        { type: 'url_citation', url: second, title: 'AP News' },
      ],
      overrides: { fetchImpl },
    });

    expect(patchedMetadata()['citations']).toEqual([
      { type: 'url_citation', url: 'https://apnews.com/article/same', title: 'AP News' },
      { type: 'url_citation', url: 'https://www.reuters.com/world/kept', title: 'Reuters' },
      { type: 'url_citation', url: 'https://apnews.com/article/same', title: 'AP News' },
    ]);
  });

  /**
   * A failed resolution must leave the citation pointing at the redirect. The
   * redirect is dead only once it expires; a URL we invented, or an emptied
   * href, is dead immediately.
   */
  it('keeps the original URL and writes nothing when resolution fails', async () => {
    const url = `${REDIRECT}/resolution-fails`;
    storedMetadata = { searchResults: [{ url, title: 'reuters.com', snippet: '' }] };
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    await patchAssistantTurnSourceUrls({
      processed,
      userId: USER_ID,
      sources: [{ url, title: 'reuters.com', snippet: '' }],
      overrides: { fetchImpl },
    });

    expect(executed).toEqual([]);
  });

  /**
   * Most turns cite publishers directly. Reaching the open web for a URL that
   * is already the publisher's would spend a request, and a timeout, per
   * citation, and reading the row back would spend a query, for nothing.
   */
  it('makes no read, no network call and no write when every URL is a publisher URL', async () => {
    storedMetadata = {
      searchResults: [{ url: 'https://www.reuters.com/world/story', title: 'Reuters' }],
    };
    const fetchImpl = vi.fn();

    await patchAssistantTurnSourceUrls({
      processed,
      userId: USER_ID,
      sources: [{ url: 'https://www.reuters.com/world/story', title: 'Reuters', snippet: '' }],
      citations: [{ type: 'url_citation', url: 'https://apnews.com/article/c', title: 'AP News' }],
      overrides: { fetchImpl: fetchImpl as unknown as typeof fetch },
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
    expect(executed).toEqual([]);
  });

  /**
   * The client's own save lands on this row too and carries a richer copy than
   * the server's: `searchResults` is an array on one path and a
   * `{ results, sources }` object on another. Rewriting the key with the
   * server's lean list would have thrown that away, so only the href strings
   * inside whatever is stored are substituted.
   */
  it('substitutes hrefs inside the stored shape without replacing it', async () => {
    const url = `${REDIRECT}/client-shape`;
    storedMetadata = {
      searchResults: {
        results: [{ url, title: 'AP News', favicon: 'apnews.ico' }],
        sources: [url],
      },
      serverPersisted: true,
    };
    const fetchImpl = vi.fn(async () =>
      redirectTo('https://apnews.com/article/kept-shape'),
    ) as unknown as typeof fetch;

    await patchAssistantTurnSourceUrls({
      processed,
      userId: USER_ID,
      sources: [{ url, title: 'AP News', snippet: '' }],
      overrides: { fetchImpl },
    });

    expect(patchedMetadata()['searchResults']).toEqual({
      results: [
        { url: 'https://apnews.com/article/kept-shape', title: 'AP News', favicon: 'apnews.ico' },
      ],
      sources: ['https://apnews.com/article/kept-shape'],
    });
    // The patch is merged with `||`, so a key it does not carry is untouched.
    expect(patchedMetadata()).not.toHaveProperty('serverPersisted');
  });

  /**
   * The patch is a second write to a row another request may also be updating,
   * so it carries the same ownership join the insert does rather than trusting
   * the message id alone.
   */
  it('scopes both the read and the patch to the conversation this user owns', async () => {
    const url = `${REDIRECT}/scoped`;
    storedMetadata = { citations: [{ type: 'url_citation', url, title: 'AP News' }] };
    const fetchImpl = vi.fn(async () =>
      redirectTo('https://apnews.com/article/scoped'),
    ) as unknown as typeof fetch;

    await patchAssistantTurnSourceUrls({
      processed,
      userId: USER_ID,
      citations: [{ type: 'url_citation', url, title: 'AP News' }],
      overrides: { fetchImpl },
    });

    const read = db.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(read[0]).toContain('c.user_id = $3');
    expect(read[0]).toContain('c.deleted_at is null');
    expect(read[1]).toEqual([MESSAGE_ID, CONVERSATION_ID, USER_ID, null]);

    const update = executed.find((call) => call.sql.includes('update web_messages'));
    expect(update?.sql).toContain('c.user_id = $3');
    expect(update?.sql).toContain('c.organization_id is not distinct from $5::uuid');
    expect(update?.sql).toContain('c.deleted_at is null');
    expect(update?.params[0]).toBe(MESSAGE_ID);
    expect(update?.params[1]).toBe(CONVERSATION_ID);
    expect(update?.params[2]).toBe(USER_ID);
  });

  /**
   * A temporary conversation has no row to patch, and resolving for one would
   * reach the open web on behalf of a turn nobody will reload.
   */
  it('does nothing for a turn that was never persisted server-side', async () => {
    const fetchImpl = vi.fn();

    await patchAssistantTurnSourceUrls({
      processed: { ...processed, conversationIsTemporary: true } as ProcessedRequest,
      userId: USER_ID,
      citations: [{ type: 'url_citation', url: `${REDIRECT}/temporary`, title: 'AP News' }],
      overrides: { fetchImpl: fetchImpl as unknown as typeof fetch },
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
    expect(executed).toEqual([]);
  });

  /**
   * A turn whose row never landed, because the insert matched no conversation,
   * has nothing to patch and must not be recreated by the update.
   */
  it('writes nothing when the row it would patch does not exist', async () => {
    storedMetadata = null;
    const fetchImpl = vi.fn();

    await patchAssistantTurnSourceUrls({
      processed,
      userId: USER_ID,
      citations: [{ type: 'url_citation', url: `${REDIRECT}/missing-row`, title: 'AP News' }],
      overrides: { fetchImpl: fetchImpl as unknown as typeof fetch },
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(executed).toEqual([]);
  });
});
