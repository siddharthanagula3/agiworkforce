import { beforeEach, describe, expect, it, vi } from 'vitest';

type RetrievalSearchModule = typeof import('../retrieval-search-service');

const search = vi.hoisted(() => ({ provider: vi.fn(), run: vi.fn() }));

vi.mock('../retrieval-search-service', async (importOriginal) => ({
  ...(await importOriginal<RetrievalSearchModule>()),
  createPostgresSearchProvider: search.provider,
}));

const { loadProjectContext } = await import('../project-context-service');

function projectDb() {
  const query = vi
    .fn()
    .mockResolvedValueOnce([
      { id: 'proj-1', name: 'Handbook', description: null, instructions: null },
    ])
    .mockResolvedValueOnce([
      {
        id: 'file-1',
        file_name: 'handbook.md',
        summary: null,
        extracted_text: 'Refunds are issued within 14 days. '.repeat(1_000),
        extracted_anchors: null,
      },
    ])
    .mockResolvedValueOnce([]);
  return { query, transaction: vi.fn(), execute: vi.fn() };
}

beforeEach(() => {
  search.provider.mockReset();
  search.run.mockReset();
  search.run.mockResolvedValue({ hits: [], semantic: 'unavailable' });
  search.provider.mockReturnValue({ search: search.run });
});

describe('searching the index for a large project file', () => {
  it('ranks by meaning, which embeds the request, when the caller allows it', async () => {
    await loadProjectContext(projectDb(), {
      projectId: 'proj-1',
      userId: 'user-1',
      currentUserQuery: 'what is the refund window?',
    });

    expect(search.provider).toHaveBeenCalledWith(expect.objectContaining({ semantic: true }));
  });

  it('ranks by the words alone, so no model is called, when the caller has no model to spend', async () => {
    await loadProjectContext(projectDb(), {
      projectId: 'proj-1',
      userId: 'user-1',
      currentUserQuery: 'what is the refund window?',
      semanticRetrieval: false,
    });

    expect(search.provider).toHaveBeenCalledWith(expect.objectContaining({ semantic: false }));
    expect(search.run).toHaveBeenCalledOnce();
  });
});
