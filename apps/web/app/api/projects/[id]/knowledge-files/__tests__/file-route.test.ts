type OriginalObjectStorageModule = typeof import('@/lib/server/object-storage');
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  transactionRolledBack: { current: false },
  getBoundedPrivateObject: vi.fn(),
  deletePrivateObject: vi.fn(),
  deleteObject: vi.fn(),
  resolveActiveOrganizationId: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: async () => ({
    db: {
      query: mocks.query,
      execute: mocks.execute,
      transaction: async <T>(
        run: (tx: { query: typeof mocks.query; execute: typeof mocks.execute }) => Promise<T>,
      ): Promise<T> => {
        try {
          return await run({ query: mocks.query, execute: mocks.execute });
        } catch (error) {
          mocks.transactionRolledBack.current = true;
          throw error;
        }
      },
    },
    userId: 'user-1',
    organizationId: await mocks.resolveActiveOrganizationId(),
  }),
}));
vi.mock('@/lib/server/object-storage', async (importOriginal) => ({
  ...(await importOriginal<OriginalObjectStorageModule>()),
  createPrivateObjectWriter: vi.fn(),
  createObjectCleanupPlan: () => ({
    targets: { private: 'fixture-private', 'legacy-public': 'fixture-public' },
    remove: async ({ name, objectKey }: { name: string; objectKey: string }) => {
      if (name === 'private') await mocks.deletePrivateObject(objectKey);
      else if (name === 'legacy-public') await mocks.deleteObject(objectKey);
      else throw new Error('Unexpected cleanup fixture target');
    },
  }),
  putPrivateObject: vi.fn(async ({ key }: { key: string }) => ({ key })),
  copyPrivateObjectIfUnchanged: vi.fn(),
  objectKeyFromStorageUri: (value: string) => value,
  isObjectStorageConfigured: () => true,
  isPrivateObjectStorageConfigured: () => true,
  getBoundedObject: vi.fn(),
  getBoundedPrivateObject: mocks.getBoundedPrivateObject,
  StoredObjectTooLargeError: class StoredObjectTooLargeError extends Error {},
  deletePrivateObject: mocks.deletePrivateObject,
  deleteObject: mocks.deleteObject,
}));
vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: () => mocks.resolveActiveOrganizationId(),
  resolveOrganizationMembershipId: vi.fn(),
}));

import { DELETE, GET } from '@/app/api/projects/[id]/knowledge-files/[fileId]/route';

const context = {
  params: Promise.resolve({ id: 'project-1', fileId: 'file-1' }),
};

describe('project knowledge file bytes and deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transactionRolledBack.current = false;
    mocks.query.mockResolvedValue([
      {
        mime_type: 'text/plain',
        file_name: 'notes.txt',
        storage_uri: 'knowledge-files/projects/project-1/notes.txt',
      },
    ]);
    mocks.execute.mockResolvedValue(1);
    mocks.getBoundedPrivateObject.mockResolvedValue({
      data: Buffer.from('hello'),
      contentType: 'text/plain',
    });
    mocks.deletePrivateObject.mockResolvedValue(undefined);
    mocks.deleteObject.mockResolvedValue(undefined);
    mocks.resolveActiveOrganizationId.mockResolvedValue(null);
  });

  it('serves bytes only through the authenticated private response', async () => {
    const response = await GET(
      new NextRequest('https://agiworkforce.com/api/projects/project-1/knowledge-files/file-1'),
      context,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('hello');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(String(mocks.query.mock.calls[0]?.[0])).toContain('p.user_id = $2');
    expect(String(mocks.query.mock.calls[0]?.[0])).toContain('p.id = $1');
    expect(String(mocks.query.mock.calls[0]?.[0])).toContain('f.id = $4');
    expect(String(mocks.query.mock.calls[0]?.[0])).toContain("m.status = 'active'");
    expect(String(mocks.query.mock.calls[0]?.[0])).toContain(
      'p.organization_id is not distinct from $3::uuid',
    );
    expect(mocks.query.mock.calls[0]?.[1]).toEqual(['project-1', 'user-1', null, 'file-1']);
  });

  it('denies a knowledge file whose parent project belongs to another workspace', async () => {
    const organizationId = '11111111-1111-4111-8111-111111111111';
    mocks.resolveActiveOrganizationId.mockResolvedValue(organizationId);
    mocks.query.mockResolvedValueOnce([]);

    const response = await GET(
      new NextRequest('https://agiworkforce.com/api/projects/project-1/knowledge-files/file-1'),
      context,
    );

    expect(response.status).toBe(404);
    expect(mocks.getBoundedPrivateObject).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls[0]?.[1]).toEqual([
      'project-1',
      'user-1',
      organizationId,
      'file-1',
    ]);
  });

  it.each([
    ['text/html', 'page.html'],
    ['image/svg+xml', 'logo.svg'],
    ['application/xml', 'feed.xml'],
  ])('serves an uploaded %s source as an opaque download', async (mimeType, fileName) => {
    const bytes = Buffer.from('<script>fetch("/api/me").then(r=>r.json())</script>', 'utf8');
    mocks.query.mockResolvedValue([
      {
        mime_type: mimeType,
        file_name: fileName,
        storage_uri: `knowledge-files/projects/project-1/${fileName}`,
      },
    ]);
    mocks.getBoundedPrivateObject.mockResolvedValue({ data: bytes, contentType: mimeType });

    const response = await GET(
      new NextRequest('https://agiworkforce.com/api/projects/project-1/knowledge-files/file-1'),
      context,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(response.headers.get('content-disposition')).toBe('attachment');
    expect(await response.text()).toBe(bytes.toString('utf8'));
  });

  it('keeps an explicit download an attachment with its filename', async () => {
    const response = await GET(
      new NextRequest(
        'https://agiworkforce.com/api/projects/project-1/knowledge-files/file-1?download=true',
      ),
      context,
    );

    expect(response.headers.get('content-type')).toBe('text/plain');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="notes.txt"');
  });

  it('retires metadata without issuing a storage request', async () => {
    mocks.query.mockResolvedValueOnce([{ id: 'file-1' }]);

    const response = await DELETE(
      new NextRequest('https://agiworkforce.com/api/projects/project-1/knowledge-files/file-1', {
        method: 'DELETE',
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.query.mock.calls[0]?.[0]).toContain('set deleted_at=now()');
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.deletePrivateObject).not.toHaveBeenCalled();
  });

  it('fails before acknowledging when metadata retirement is unavailable', async () => {
    mocks.query.mockRejectedValueOnce(new Error('Database unavailable'));

    const response = await DELETE(
      new NextRequest('https://agiworkforce.com/api/projects/project-1/knowledge-files/file-1', {
        method: 'DELETE',
      }),
      context,
    );

    expect(response.status).toBe(500);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.deletePrivateObject).not.toHaveBeenCalled();
  });

  it('does not scan committed references or remove bytes inline', async () => {
    mocks.query.mockResolvedValueOnce([{ id: 'file-1' }]);
    const response = await DELETE(
      new NextRequest('https://agiworkforce.com/api/projects/project-1/knowledge-files/file-1', {
        method: 'DELETE',
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.deletePrivateObject).not.toHaveBeenCalled();
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it('serializes a workspace deletion with legal-hold placement before touching the file', async () => {
    mocks.resolveActiveOrganizationId.mockResolvedValue('11111111-1111-4111-8111-111111111111');
    mocks.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'file-1' }]);

    const response = await DELETE(
      new NextRequest('https://agiworkforce.com/api/projects/project-1/knowledge-files/file-1', {
        method: 'DELETE',
      }),
      context,
    );

    expect(response.status).toBe(200);
    const statements = mocks.query.mock.calls.map(([sql]) => String(sql));
    expect(statements[0]).toContain('pg_advisory_xact_lock_shared');
    expect(statements[1]).toContain('set deleted_at=now()');
    expect(mocks.transactionRolledBack.current).toBe(false);
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.deletePrivateObject).not.toHaveBeenCalled();
  });
});
