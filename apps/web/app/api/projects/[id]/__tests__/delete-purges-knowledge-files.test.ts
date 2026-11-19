type OriginalObjectStorageModule = typeof import('@/lib/server/object-storage');
type OriginalProjectKnowledgeObjectStorageModule =
  typeof import('@/lib/server/project-knowledge-object-storage');
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
vi.mock('@/lib/server/object-storage', async (importOriginal) => ({
  ...(await importOriginal<OriginalObjectStorageModule>()),
  copyPrivateObjectIfUnchanged: vi.fn(),
  objectKeyFromStorageUri: (value: string) => value,
  StoredObjectTooLargeError: class StoredObjectTooLargeError extends Error {},
  deleteObject: vi.fn(),
  deletePrivateObject: vi.fn(),
  getBoundedObject: vi.fn(),
  getBoundedPrivateObject: vi.fn(),
  isObjectStorageConfigured: vi.fn(),
  isPrivateObjectStorageConfigured: vi.fn(),
}));
vi.mock('@/lib/server/project-knowledge-object-storage', async (importOriginal) => ({
  ...(await importOriginal<OriginalProjectKnowledgeObjectStorageModule>()),
  deleteProjectKnowledgeObject: mocks.deleteProjectKnowledgeObject,
}));
vi.mock('@/lib/services/org-sharing-service', () => ({
  resolveSharedProjectScope: vi.fn(async () => null),
  // The route asks this before it lets a non-owner write; a delete is owner-only,
  // so the answer here is the owner the fixture already is.
  resolveProjectWriteAccess: vi.fn(async () => 'owner'),
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
  return ([...mocks.query.mock.calls, ...mocks.execute.mock.calls] as [string, unknown[]][]).filter(
    ([sql]) => sql.includes('project_knowledge_files'),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getClerkAuthUser.mockResolvedValue({ userId: 'user-abc' });
  mocks.resolveActiveOrganizationId.mockResolvedValue(null);
  mocks.execute.mockResolvedValue(1);
  mocks.query.mockImplementation(async (sql: string) =>
    sql.includes('update user_projects') ? [{ id: PROJECT_ID }] : [],
  );
  mocks.deleteProjectKnowledgeObject.mockResolvedValue(undefined);
});

describe('DELETE /api/projects/[id] · knowledge-file retention', () => {
  it('soft-deletes the project knowledge rows the ON DELETE CASCADE can never reach', async () => {
    const res = await callDelete();

    expect(res.status).toBe(200);

    const purge = knowledgeFileCalls().filter(([sql]) =>
      sql.includes('update project_knowledge_files'),
    );
    expect(purge).toHaveLength(1);
    const [sql, params] = purge[0]!;
    expect(sql).toContain('update project_knowledge_files');
    expect(sql).toContain('deleted_at=now()');
    expect(sql).toContain('deleted_at is null');
    expect(params).toEqual([PROJECT_ID, 'user-abc', null, 'project_file']);
  });

  it('commits source retirement without issuing object-storage requests', async () => {
    await callDelete();

    const deletedKeys = (mocks.deleteProjectKnowledgeObject.mock.calls as [string][]).map(
      ([key]) => key,
    );
    expect(deletedKeys).toEqual([]);
  });

  it('leaves reference accounting to the transaction and outbox', async () => {
    await callDelete();

    expect(mocks.deleteProjectKnowledgeObject).not.toHaveBeenCalled();
    expect(knowledgeFileCalls().some(([sql]) => sql.includes('select distinct storage_uri'))).toBe(
      false,
    );
  });

  it('refuses to retire a project whose file an active legal hold preserves', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('update user_projects')) return [{ id: PROJECT_ID }];
      if (sql.includes('select k.id from project_knowledge_files')) return [{ id: 'file-held' }];
      return [];
    });

    const res = await callDelete();

    expect(res.status).toBe(403);
    expect(
      knowledgeFileCalls().some(([sql]) => sql.includes('update project_knowledge_files')),
    ).toBe(false);
    const holdQuery = knowledgeFileCalls().find(([sql]) =>
      sql.includes('public.app_project_content_held('),
    );
    expect(holdQuery?.[1]).toContain('project_file');
    expect(mocks.deleteProjectKnowledgeObject).not.toHaveBeenCalled();
  });

  it('does not purge knowledge files when no live project matched', async () => {
    mocks.query.mockResolvedValue([]);

    const res = await callDelete();

    expect(res.status).toBe(404);
    expect(knowledgeFileCalls()).toHaveLength(0);
    expect(mocks.deleteProjectKnowledgeObject).not.toHaveBeenCalled();
  });

  it('fails the delete instead of leaving knowledge files behind when their cleanup errors', async () => {
    mocks.execute.mockImplementation(async (sql: string) => {
      if (sql.includes('project_knowledge_files')) {
        throw Object.assign(new Error('relation does not exist'), { code: '42P01' });
      }
      return 1;
    });

    const res = await callDelete();

    expect(res.status).toBe(500);
    expect(mocks.deleteProjectKnowledgeObject).not.toHaveBeenCalled();
  });

  it('reports success even when object storage refuses to delete an orphaned object', async () => {
    mocks.deleteProjectKnowledgeObject.mockRejectedValue(new Error('storage down'));

    const res = await callDelete();

    expect(res.status).toBe(200);
    expect(mocks.deleteProjectKnowledgeObject).not.toHaveBeenCalled();
  });
});
