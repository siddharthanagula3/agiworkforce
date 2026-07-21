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

describe('globalSearchService.search — project surfacing', () => {
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
        stats: { totalResults: 1, sessionMatches: 1, messageMatches: 0, projectMatches: 1 },
      }),
    );

    const { results, stats } = await globalSearchService.search('user-1', { query: 'launch' });

    const project = results.find((r) => r.type === 'project');
    expect(project).toBeDefined();
    // sessionId carries the project id so the dialog routes to /projects/${id}.
    expect(project?.sessionId).toBe('proj-42');
    expect(project?.sessionTitle).toBe('Launch Plan');

    // Conversation results are preserved alongside projects.
    expect(results.some((r) => r.type === 'session' && r.sessionId === 'sess-1')).toBe(true);

    // Stats fold projects into the visible total so the "Found N" count matches rendered rows.
    expect(stats.projectMatches).toBe(1);
    expect(stats.totalResults).toBe(2);
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
