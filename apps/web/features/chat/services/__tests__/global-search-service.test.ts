import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@shared/lib/get-auth-token', () => ({ getAuthToken: vi.fn() }));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { globalSearchService } from '../global-search-service';

beforeEach(async () => {
  const { getAuthToken } = await import('@shared/lib/get-auth-token');
  vi.mocked(getAuthToken).mockResolvedValue('test-auth-token');
  fetchMock.mockReset();
});

afterEach(() => vi.clearAllMocks());

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

describe('globalSearchService.search, project surfacing', () => {
  it('surfaces project matches the route returns, keyed for /projects navigation', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        results: [
          {
            type: 'session',
            sessionId: 'sess-1',
            sessionTitle: 'A conversation',
            content: 'hello',
            createdAt: '2026-07-01T00:00:00Z',
            updatedAt: '2026-07-02T00:00:00Z',
            matchedText: 'hello',
          },
        ],
        projects: [
          {
            type: 'project',
            projectId: 'proj-42',
            projectName: 'Launch Plan',
            content: 'Q3 launch checklist',
            createdAt: '2026-07-03T00:00:00Z',
            updatedAt: '2026-07-04T00:00:00Z',
            matchedText: 'Launch Plan',
          },
        ],
        files: [
          {
            type: 'file',
            fileId: 'file-7',
            fileName: 'launch-deck.pdf',
            content: 'a slide deck',
            createdAt: '2026-07-05T00:00:00Z',
            updatedAt: '2026-07-05T00:00:00Z',
            matchedText: 'launch-deck.pdf',
          },
        ],
        stats: {
          totalResults: 1,
          sessionMatches: 1,
          messageMatches: 0,
          projectMatches: 1,
          fileMatches: 1,
        },
      }),
    );

    const { results, stats } = await globalSearchService.search('user-1', { query: 'launch' });

    const project = results.find((r) => r.type === 'project');
    expect(project).toBeDefined();
    expect(project?.sessionId).toBe('proj-42');
    expect(project?.sessionTitle).toBe('Launch Plan');

    const file = results.find((r) => r.type === 'file');
    expect(file?.sessionId).toBe('file-7');
    expect(file?.sessionTitle).toBe('launch-deck.pdf');

    expect(results.some((r) => r.type === 'session' && r.sessionId === 'sess-1')).toBe(true);

    expect(stats.projectMatches).toBe(1);
    expect(stats.fileMatches).toBe(1);
    expect(stats.totalResults).toBe(3);
  });

  it('is unaffected when the route returns no projects array', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        results: [
          {
            type: 'session',
            sessionId: 'sess-9',
            sessionTitle: 'Only chat',
            content: 'x',
            createdAt: '2026-07-01T00:00:00Z',
            updatedAt: '2026-07-01T00:00:00Z',
            matchedText: 'x',
          },
        ],
        stats: { totalResults: 1, sessionMatches: 1, messageMatches: 0 },
      }),
    );

    const { results, stats } = await globalSearchService.search('user-1', { query: 'x' });
    expect(results.every((r) => r.type !== 'project')).toBe(true);
    expect(stats.projectMatches).toBe(0);
    expect(stats.totalResults).toBe(1);
  });
});

describe('globalSearchService.search, indexed documents', () => {
  it('adds artifacts, reports and developer sessions with their destination links', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        results: [
          {
            type: 'session',
            sessionId: 'sess-1',
            sessionTitle: 'Pricing chat',
            content: 'pricing',
            createdAt: '2026-07-01T00:00:00Z',
            updatedAt: '2026-07-01T00:00:00Z',
            matchedText: 'pricing',
          },
        ],
        documents: [
          {
            type: 'artifact',
            sourceId: 'art-1',
            title: 'Pricing table',
            href: '/chat/conv-1',
            snippet: 'Plan pricing table',
            matchedTerms: ['pricing'],
            indexedAt: '2026-09-17T00:00:00Z',
          },
          {
            type: 'research_report',
            sourceId: 'rep-1',
            title: 'Market pricing',
            href: '/chat/conv-2',
            snippet: 'Competitor pricing',
            matchedTerms: ['pricing'],
            indexedAt: null,
          },
          {
            type: 'developer_session',
            sourceId: 'code-1',
            title: 'Fix pricing page',
            href: '/code/code-1',
            snippet: 'pricing page',
            matchedTerms: ['pricing'],
            indexedAt: null,
          },
          {
            type: 'conversation',
            sourceId: 'sess-1',
            title: 'Pricing chat',
            href: '/chat/sess-1',
            snippet: 'already listed',
            matchedTerms: ['pricing'],
            indexedAt: null,
          },
        ],
        stats: { totalResults: 1, sessionMatches: 1, messageMatches: 0 },
      }),
    );

    const { results, stats } = await globalSearchService.search('user-1', { query: 'pricing' });

    expect(results.map((result) => [result.type, result.href ?? null])).toEqual([
      ['session', null],
      ['artifact', '/chat/conv-1'],
      ['research_report', '/chat/conv-2'],
      ['developer_session', '/code/code-1'],
    ]);
    expect(stats.documentMatches).toBe(3);
    expect(stats.totalResults).toBe(4);
  });
});
