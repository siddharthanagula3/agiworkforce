import { beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@/lib/services/retrieval-search-service');

const mocks = vi.hoisted(() => ({
  createProvider: vi.fn(),
  search: vi.fn(),
}));

vi.mock('@/lib/services/retrieval-search-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  createPostgresSearchProvider: (scope: unknown) => {
    mocks.createProvider(scope);
    return { search: mocks.search };
  },
}));

import { searchResearchFileSources } from '../research-file-source-service';

const CONVERSATION_ID = '52d14f7e-0b3d-40c7-952d-987e841033c5';

function hit(googleUserData: boolean) {
  return {
    chunkId: 'chunk-1',
    documentId: 'doc-1',
    sourceKind: 'project_knowledge',
    sourceId: '11111111-1111-4111-8111-111111111111',
    title: 'Plan.docx',
    text: 'Quarterly plan',
    start: 0,
    end: 14,
    metadata: googleUserData ? { googleUserData: true } : {},
    chunkVersion: 1,
    indexedAt: null,
    score: 1,
  };
}

function run(googleUserDataRouted: boolean) {
  const query = vi.fn(async (_sql: string, _params?: unknown[]) => []);
  return {
    query,
    result: searchResearchFileSources({ query } as never, {
      userId: 'user-1',
      organizationId: null,
      query: 'quarterly plan',
      conversationId: CONVERSATION_ID,
      googleUserDataRouted,
    }),
  };
}

beforeEach(() => {
  mocks.createProvider.mockReset();
  mocks.search.mockReset();
});

describe('research file sources and Google user data', () => {
  it('leaves Google-derived sources out of a run that may reach a model that trains', async () => {
    mocks.search.mockResolvedValue({ hits: [], semantic: 'unavailable' });

    await run(false).result;

    expect(mocks.createProvider).toHaveBeenCalledWith(
      expect.objectContaining({ googleUserData: 'exclude' }),
    );
  });

  it('keeps them in a no-training run and marks the chat when one is used', async () => {
    mocks.search.mockResolvedValue({ hits: [hit(true)], semantic: 'used' });

    const { query, result } = run(true);
    await result;

    expect(mocks.createProvider).toHaveBeenCalledWith(
      expect.objectContaining({ googleUserData: 'include' }),
    );
    const mark = query.mock.calls.find(([sql]) => sql.includes('set google_user_data_at = now()'));
    expect(mark?.[1]).toEqual([CONVERSATION_ID, 'user-1']);
  });
});
