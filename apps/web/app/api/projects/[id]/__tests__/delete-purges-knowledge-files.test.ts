import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  getClerkAuthUser: vi.fn(),
  resolveActiveOrganizationId: vi.fn(),
  deleteProjectKnowledgeObject: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: async () => {
    const adapter: Record<string, unknown> = {
      query: (...args: unknown[]) => mocks.query(...args),
      execute: (...args: unknown[]) => mocks.execute(...args),
      withUser: () => ({}),
      dispose: () => {},
    };
    adapter['transaction'] = (fn: (tx: unknown) => unknown) => fn(adapter);
    const { userId } = await mocks.getClerkAuthUser();
    const organizationId = await mocks.resolveActiveOrganizationId();
    return { db: adapter, userId, organizationId };
  },
}));
vi.mock('@/lib/server/object-storage', () => ({
  objectKeyFromStorageUri: (value: string) => value,
  StoredObjectTooLargeError: class StoredObjectTooLargeError extends Error {},
  deleteObject: vi.fn(),
  deletePrivateObject: vi.fn(),
  getBoundedObject: vi.fn(),
  getBoundedPrivateObject: vi.fn(),
  isObjectStorageConfigured: vi.fn(),
  isPrivateObjectStorageConfigured: vi.fn(),
}));
vi.mock('@/lib/server/project-knowledge-object-storage', () => ({
  deleteProjectKnowledgeObject: mocks.deleteProjectKnowledgeObject,
}));
vi.mock('@/lib/services/org-sharing-service', () => ({
  resolveSharedProjectScope: vi.fn(async () => null),
}));

import { DELETE } from '@/app/api/projects/[id]/route';

const PROJECT_ID = 'proj-1';

function deleteRequest(): NextRequest {
  return new NextRequest(`http://localhost/api/projects/${PROJECT_ID}`, { method: 'DELETE' });
}

function callDelete() {
  return DELETE(deleteRequest(), { params: Promise.resolve({ id: PROJECT_ID }) });
}

function knowledgeFileCalls(): [string, unknown[]][] {
  return (mocks.query.mock.calls as [string, unknown[]][]).filter(([sql]) =>
    sql.includes('project_knowledge_files'),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getClerkAuthUser.mockResolvedValue({ userId: 'user-abc' });
  mocks.resolveActiveOrganizationId.mockResolvedValue(null);
  mocks.execute.mockResolvedValue(1);
  mocks.query.mockResolvedValue([
    { storage_uri: 'knowledge-files/projects/proj-1/notes.txt' },
    { storage_uri: 'knowledge-files/projects/proj-1/spec.pdf' },
    { storage_uri: null },
  ]);
  mocks.deleteProjectKnowledgeObject.mockResolvedValue(undefined);
});

describe('DELETE /api/projects/[id] · knowledge-file retention', () => {
  it('soft-deletes the project knowledge rows the ON DELETE CASCADE can never reach', async () => {
    const res = await callDelete();

    expect(res.status).toBe(200);

    const purge = knowledgeFileCalls();
    expect(purge).toHaveLength(1);
    const [sql, params] = purge[0]!;
    expect(sql).toContain('update project_knowledge_files');
    expect(sql).toContain('deleted_at = now()');
    expect(sql).toContain('deleted_at is null');
    expect(params).toEqual([PROJECT_ID]);
  });

  it('deletes every stored knowledge object so the bytes do not outlive the project', async () => {
    await callDelete();

    const deletedKeys = (mocks.deleteProjectKnowledgeObject.mock.calls as [string][]).map(
      ([key]) => key,
    );
    expect(deletedKeys).toEqual([
      'knowledge-files/projects/proj-1/notes.txt',
      'knowledge-files/projects/proj-1/spec.pdf',
    ]);
  });

  it('does not purge knowledge files when no live project matched', async () => {
    mocks.execute.mockResolvedValue(0);

    const res = await callDelete();

    expect(res.status).toBe(404);
    expect(knowledgeFileCalls()).toHaveLength(0);
    expect(mocks.deleteProjectKnowledgeObject).not.toHaveBeenCalled();
  });

  it('still deletes the project when the knowledge-file schema is not deployed yet', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('project_knowledge_files')) {
        throw Object.assign(new Error('relation does not exist'), { code: '42P01' });
      }
      return [];
    });

    const res = await callDelete();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(mocks.deleteProjectKnowledgeObject).not.toHaveBeenCalled();
  });

  it('reports success even when object storage refuses to delete an orphaned object', async () => {
    mocks.deleteProjectKnowledgeObject.mockRejectedValue(new Error('storage down'));

    const res = await callDelete();

    expect(res.status).toBe(200);
    expect(mocks.deleteProjectKnowledgeObject).toHaveBeenCalledTimes(2);
  });
});
