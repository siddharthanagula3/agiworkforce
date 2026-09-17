import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  verifyCron: vi.fn(),
  getNeonDb: vi.fn(),
  reserveDue: vi.fn(),
  dispatch: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/cron-auth', () => ({ verifyCronRequest: mocks.verifyCron }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: mocks.getNeonDb }));
vi.mock('@/lib/services/retrieval-index-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  reserveDueRetrievalDocuments: mocks.reserveDue,
}));
vi.mock('@/lib/workflows/start-retrieval-index-workflow', () => ({
  dispatchRetrievalIndexWorkflows: mocks.dispatch,
  startRetrievalIndexWorkflow: vi.fn(),
}));

import { GET } from './route';

function cronRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/cron/index-retrieval-documents');
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyCron.mockReturnValue(true);
  mocks.getNeonDb.mockReturnValue({ query: vi.fn() });
});

describe('GET /api/cron/index-retrieval-documents', () => {
  it('refuses a request without the cron secret', async () => {
    mocks.verifyCron.mockReturnValue(false);
    const response = await GET(cronRequest());
    expect(response.status).toBe(401);
    expect(mocks.reserveDue).not.toHaveBeenCalled();
  });

  it('starts one index run per due document in its owner scope', async () => {
    mocks.reserveDue.mockResolvedValue([
      { id: 'doc-1', user_id: 'user-1', organization_id: null },
      { id: 'doc-2', user_id: 'user-2', organization_id: 'org-1' },
    ]);
    mocks.dispatch.mockResolvedValue({ started: 2, failed: 0 });

    const response = await GET(cronRequest());

    expect(await response.json()).toEqual({ due: 2, started: 2, failed: 0 });
    expect(mocks.dispatch).toHaveBeenCalledWith([
      { documentId: 'doc-1', userId: 'user-1', organizationId: null },
      { documentId: 'doc-2', userId: 'user-2', organizationId: 'org-1' },
    ]);
  });

  it('reports a failed sweep without starting anything', async () => {
    mocks.reserveDue.mockRejectedValue(new Error('database down'));
    const response = await GET(cronRequest());
    expect(response.status).toBe(500);
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
});
