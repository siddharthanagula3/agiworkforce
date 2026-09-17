import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  requestReindex: vi.fn(),
  readStates: vi.fn(),
  dispatch: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: mocks.query },
    userId: 'user-1',
    organizationId: null,
  })),
}));
vi.mock('@/lib/services/retrieval-index-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requestProjectKnowledgeReindex: mocks.requestReindex,
  readProjectKnowledgeIndexStates: mocks.readStates,
}));
vi.mock('@/lib/workflows/start-retrieval-index-workflow', () => ({
  dispatchRetrievalIndexWorkflows: mocks.dispatch,
  startRetrievalIndexWorkflow: vi.fn(),
}));

import { POST } from './route';

const PROJECT_ID = '33333333-3333-4333-8333-333333333333';
const FILE_ID = '44444444-4444-4444-8444-444444444444';

function reindex(): Promise<Response> {
  return POST(
    new NextRequest(
      `http://localhost/api/projects/${PROJECT_ID}/knowledge-files/${FILE_ID}/reindex`,
      { method: 'POST' },
    ),
    { params: Promise.resolve({ id: PROJECT_ID, fileId: FILE_ID }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dispatch.mockResolvedValue({ started: 1, failed: 0 });
  mocks.readStates.mockResolvedValue(
    new Map([
      [
        FILE_ID,
        {
          status: 'pending',
          chunkCount: 0,
          semantic: false,
          attempts: 0,
          error: null,
          indexedAt: null,
        },
      ],
    ]),
  );
});

describe('POST /api/projects/[id]/knowledge-files/[fileId]/reindex', () => {
  it('resets the owner file to pending and starts an index run', async () => {
    mocks.query.mockResolvedValue([{ file_name: 'handbook.pdf' }]);
    mocks.requestReindex.mockResolvedValue('doc-1');

    const response = await reindex();

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      indexing: { status: 'pending' },
      dispatched: true,
    });
    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('p.user_id = $3');
    expect(params).toEqual([FILE_ID, PROJECT_ID, 'user-1', null]);
    expect(mocks.requestReindex).toHaveBeenCalledWith(expect.anything(), {
      fileId: FILE_ID,
      ownerUserId: 'user-1',
      organizationId: null,
      fileName: 'handbook.pdf',
    });
    expect(mocks.dispatch).toHaveBeenCalledWith([
      { documentId: 'doc-1', userId: 'user-1', organizationId: null },
    ]);
  });

  it('refuses a file the caller does not own', async () => {
    mocks.query.mockResolvedValue([]);
    const response = await reindex();
    expect(response.status).toBe(404);
    expect(mocks.requestReindex).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
});
