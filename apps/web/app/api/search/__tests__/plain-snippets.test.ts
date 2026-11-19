import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type MarkdownDocumentModule = typeof import('@agiworkforce/unified-chat/markdown-document');
type RateLimitModule = typeof import('@/lib/rate-limit');
type CsrfModule = typeof import('@/lib/csrf');
type LoggerModule = typeof import('@/lib/logger');
type RlsDbModule = typeof import('@/lib/server/rls-db');
type DataRegionModule = typeof import('@/lib/server/data-region');

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('@agiworkforce/unified-chat/markdown-document', async (importOriginal) => {
  const actual = await importOriginal<MarkdownDocumentModule>();
  return { ...actual, markdownRenderedText: vi.fn(actual.markdownRenderedText) };
});
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<CsrfModule>()),
  requireCsrfToken: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getUserScopedDb: vi.fn(async () => ({
    db: { query: (...args: unknown[]) => mocks.query(...args) },
    userId: 'user-abc',
    organizationId: null,
  })),
}));
vi.mock('@/lib/server/data-region', async (importOriginal) => ({
  ...(await importOriginal<DataRegionModule>()),
  readStoredOrganizationRegion: vi.fn(async () => ({
    effective: 'us',
    requested: null,
    requestedAt: null,
    provisioned: true,
    missing: [],
  })),
}));

import { markdownRenderedText } from '@agiworkforce/unified-chat/markdown-document';
import { GET } from '@/app/api/search/route';

interface MessageHit {
  type: string;
  content: string;
  matchedText: string;
  contextBefore: string;
  contextAfter: string;
}

function messageRow(content: string, id = 'm1', updatedAt = '2026-01-02T00:00:00Z') {
  return {
    id,
    conversation_id: 'c1',
    role: 'assistant',
    content,
    created_at: '2026-01-02T00:00:00Z',
    updated_at: updatedAt,
    session_title: 'Launch',
  };
}

async function searchFor(query: string, content: string): Promise<MessageHit> {
  mocks.query.mockImplementation(async (sql: string) =>
    sql.includes('from web_messages') ? [messageRow(content)] : [],
  );
  const response = await GET(
    new NextRequest(`http://localhost/api/search?q=${query}`, { method: 'GET' }),
  );
  const body = (await response.json()) as { results: MessageHit[] };
  const hit = body.results.find((result) => result.type === 'message');
  expect(hit).toBeDefined();
  return hit!;
}

beforeEach(() => {
  vi.mocked(markdownRenderedText).mockClear();
  mocks.query.mockReset();
  mocks.query.mockResolvedValue([]);
});

describe('GET /api/search snippets', () => {
  it('cuts the snippet from the text a reader sees, without heading or bold marks', async () => {
    const hit = await searchFor(
      'roadmap',
      '# Launch plan\n\nThe **roadmap** ships on Friday.\n\n```ts\nconst roadmap = 1;\n```',
    );

    expect(hit.matchedText).toBe('roadmap');
    expect(hit.contextBefore).toBe('Launch plan The ');
    expect(hit.contextAfter).toBe(' ships on Friday. const roadmap = 1;');
    for (const part of [hit.matchedText, hit.contextBefore, hit.contextAfter]) {
      expect(part).not.toMatch(/[#*`]/);
    }
  });

  it('shows the code of a fence without its fence marks when the match is inside it', async () => {
    const hit = await searchFor('roadmap', '```ts\nconst roadmap = 1;\n```');

    expect(hit.contextBefore).toBe('const ');
    expect(hit.matchedText).toBe('roadmap');
    expect(hit.contextAfter).toBe(' = 1;');
  });

  it('keeps the offsets of the match in the plain text, not in the Markdown it came from', async () => {
    const content = `${'**bold** '.repeat(12)}roadmap done`;
    const hit = await searchFor('roadmap', content);

    const text = `${hit.contextBefore}${hit.matchedText}${hit.contextAfter}`;
    expect(text.slice(hit.contextBefore.length, hit.contextBefore.length + 7)).toBe('roadmap');
    expect(hit.contextBefore).toBe('bold '.repeat(12).slice(-50));
    expect(hit.contextAfter).toBe(' done');
  });

  it('leaves the stored message content untouched', async () => {
    const content = 'The **roadmap** ships.';
    const hit = await searchFor('roadmap', content);

    expect(hit.content).toBe(content);
  });

  it('shows the query inside a link target as the start of the text, cut from the Markdown it matched', async () => {
    const hit = await searchFor(
      'github.com',
      'Read the [GitHub guide](https://github.com/example/guide) before you start.',
    );

    expect(hit.matchedText).toBe('github.com');
    expect(hit.contextBefore).toBe('Read the [GitHub guide](https://');
  });

  it('converts only a window around the match of a very long message', async () => {
    const filler = 'A plain line of ordinary answer text.\n\n'.repeat(4000);
    const content = `${filler}The **roadmap** ships on Friday.\n\n${filler}`;

    const hit = await searchFor('roadmap', content);

    expect(hit.matchedText).toBe('roadmap');
    expect(hit.contextAfter).toBe(' ships on Friday. A plain line of ordinary answer ');
    const inputs = vi.mocked(markdownRenderedText).mock.calls.map(([text]) => text.length);
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toBeLessThan(5000);
    expect(content.length).toBeGreaterThan(150_000);
  });

  it('builds snippets only for the hits that are returned', async () => {
    const rows = Array.from({ length: 5 }, (_, index) =>
      messageRow(
        `The **roadmap** number ${index}.`,
        `m${index}`,
        `2026-01-0${index + 1}T00:00:00Z`,
      ),
    );
    mocks.query.mockImplementation(async (sql: string) =>
      sql.includes('from web_messages') ? rows : [],
    );

    const response = await GET(
      new NextRequest('http://localhost/api/search?q=roadmap&limit=2', { method: 'GET' }),
    );
    const body = (await response.json()) as {
      results: Array<{ messageId: string }>;
      stats: { messageMatches: number; totalResults: number };
    };

    expect(body.results.map((result) => result.messageId)).toEqual(['m4', 'm3']);
    expect(vi.mocked(markdownRenderedText)).toHaveBeenCalledTimes(2);
    expect(body.stats.messageMatches).toBe(5);
    expect(body.stats.totalResults).toBe(5);
  });

  it('keeps the words of two lines apart in the snippet', async () => {
    const hit = await searchFor('plumber', 'Buy milk\nCall the plumber tomorrow');

    expect(hit.contextBefore).toBe('Buy milk Call the ');
    expect(hit.matchedText).toBe('plumber');
    expect(hit.contextAfter).toBe(' tomorrow');
  });

  it('returns an answer stored with citation markup without it, in the content and the snippet', async () => {
    const hit = await searchFor(
      'flew',
      'Starship flew again. \uE200cite\uE202turn620734view2\uE201 Next.',
    );

    expect(hit.content).toBe('Starship flew again.  Next.');
    expect(`${hit.contextBefore}${hit.matchedText}${hit.contextAfter}`).toBe(
      'Starship flew again. Next.',
    );
  });
});
