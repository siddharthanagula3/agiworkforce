import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
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
    db: { query: mocks.query, execute: mocks.execute },
    userId: 'user-1',
    organizationId: await mocks.resolveActiveOrganizationId(),
  }),
}));
vi.mock('@/lib/server/object-storage', () => ({
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
    expect(String(mocks.query.mock.calls[0]?.[0])).toContain('p.user_id = $3');
    expect(String(mocks.query.mock.calls[0]?.[0])).toContain(
      'p.organization_id is not distinct from $4::uuid',
    );
    expect(mocks.query.mock.calls[0]?.[1]).toEqual(['file-1', 'project-1', 'user-1', null]);
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
      'file-1',
      'project-1',
      'user-1',
      organizationId,
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

  it('soft-deletes metadata before removing the backing object', async () => {
    const order: string[] = [];
    mocks.execute.mockImplementation(async () => {
      order.push('metadata');
      return 1;
    });
    mocks.deleteObject.mockImplementation(async () => {
      order.push('object');
    });

    const response = await DELETE(
      new NextRequest('https://agiworkforce.com/api/projects/project-1/knowledge-files/file-1', {
        method: 'DELETE',
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(order).toEqual(['metadata', 'object']);
  });

  it('restores visible metadata when backing-object deletion fails', async () => {
    mocks.deleteObject.mockRejectedValueOnce(new Error('R2 unavailable'));

    const response = await DELETE(
      new NextRequest('https://agiworkforce.com/api/projects/project-1/knowledge-files/file-1', {
        method: 'DELETE',
      }),
      context,
    );

    expect(response.status).toBe(500);
    expect(mocks.execute).toHaveBeenCalledTimes(2);
    expect(String(mocks.execute.mock.calls[1]?.[0])).toContain('set deleted_at = null');
  });
});
