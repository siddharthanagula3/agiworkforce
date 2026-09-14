import { createHash } from 'node:crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetUserScopedDb, mockNeonQuery, mockPutPrivateObject } = vi.hoisted(() => ({
  mockGetUserScopedDb: vi.fn(),
  mockNeonQuery: vi.fn(),
  mockPutPrivateObject: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mockGetUserScopedDb }));
vi.mock('@/lib/server/object-storage', () => ({
  copyPrivateObjectIfUnchanged: vi.fn(),
  isPrivateObjectStorageConfigured: vi.fn(() => true),
  isObjectStorageConfigured: vi.fn(() => true),
  putPrivateObject: mockPutPrivateObject,
  deletePrivateObject: vi.fn(),
  deleteObject: vi.fn(),
  getBoundedObject: vi.fn(),
  getBoundedPrivateObject: vi.fn(),
  StoredObjectTooLargeError: class extends Error {},
}));
vi.mock('@/lib/server/object-storage-runtime', () => ({
  getObjectStore: vi.fn(),
  objectStorageConfig: () => ({ secretAccessKey: 'test-object-storage-secret' }),
}));

import { PUT } from './route';
import { createProjectKnowledgeUploadAuthorization } from '@/lib/server/project-knowledge-object-storage';

const PROJECT_ID = 'proj-1';
const OWNED_KEY = `knowledge-files/projects/${PROJECT_ID}/1700000000000_abc123.txt`;
const USER = 'user-abc';
const BODY = 'hello world';

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function authorize(
  overrides: Partial<Parameters<typeof createProjectKnowledgeUploadAuthorization>[0]> = {},
) {
  return createProjectKnowledgeUploadAuthorization({
    userId: USER,
    key: OWNED_KEY,
    contentType: 'text/plain',
    byteCount: BODY.length,
    checksumSha256: sha256Hex(BODY),
    ...overrides,
  });
}

function putRequest(query: string, body: string, contentType = 'text/plain'): NextRequest {
  return new NextRequest(`http://localhost:3100/api/uploads/knowledge-file/put?${query}`, {
    method: 'PUT',
    headers: { 'Content-Type': contentType, 'Content-Length': String(body.length) },
    body,
  });
}

async function tokenQuery(
  overrides?: Partial<Parameters<typeof createProjectKnowledgeUploadAuthorization>[0]>,
): Promise<string> {
  return `token=${encodeURIComponent(await authorize(overrides))}`;
}

beforeEach(() => {
  mockNeonQuery.mockReset();
  mockPutPrivateObject.mockReset();
  mockPutPrivateObject.mockResolvedValue(undefined);
  mockGetUserScopedDb.mockResolvedValue({
    db: { query: (...args: unknown[]) => mockNeonQuery(...args) },
    userId: USER,
    organizationId: '11111111-1111-4111-8111-111111111111',
  });
  mockNeonQuery.mockResolvedValue([{ id: PROJECT_ID }]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PUT /api/uploads/knowledge-file/put', () => {
  it('writes the key its authorization names, taken from the token and not the request', async () => {
    const response = await PUT(putRequest(await tokenQuery(), BODY));

    expect(response.status).toBe(200);
    expect(mockPutPrivateObject).toHaveBeenCalledWith(
      expect.objectContaining({ key: OWNED_KEY, contentType: 'text/plain' }),
    );
  });

  it('refuses the pre-authorization shape that named a key in the query string', async () => {
    const response = await PUT(putRequest(`key=${encodeURIComponent(OWNED_KEY)}`, BODY));

    expect(response.status).toBe(403);
    expect(mockPutPrivateObject).not.toHaveBeenCalled();
  });

  it('refuses a second body of the same length and type, which is how an inspected object was rewritten', async () => {
    const rewrite = 'HELLO WORLD';
    expect(rewrite.length).toBe(BODY.length);

    const response = await PUT(putRequest(await tokenQuery(), rewrite));

    expect(response.status).toBe(403);
    expect(mockPutPrivateObject).not.toHaveBeenCalled();
  });

  it('refuses an authorization minted for another account', async () => {
    const response = await PUT(putRequest(await tokenQuery({ userId: 'user-other' }), BODY));

    expect(response.status).toBe(403);
    expect(mockPutPrivateObject).not.toHaveBeenCalled();
  });

  it('refuses a tampered authorization', async () => {
    const token = await authorize();
    const [payload, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8')),
        key: `knowledge-files/projects/${PROJECT_ID}/victim.txt`,
      }),
    ).toString('base64url');

    const response = await PUT(
      putRequest(`token=${encodeURIComponent(`${forged}.${signature}`)}`, BODY),
    );

    expect(response.status).toBe(403);
    expect(mockPutPrivateObject).not.toHaveBeenCalled();
  });

  it('refuses an expired authorization', async () => {
    const query = await tokenQuery();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 6 * 60 * 1000);

    const response = await PUT(putRequest(query, BODY));

    expect(response.status).toBe(403);
    expect(mockPutPrivateObject).not.toHaveBeenCalled();
  });

  it('refuses a request with no authorization at all', async () => {
    const response = await PUT(putRequest('', BODY));

    expect(response.status).toBe(403);
    expect(mockPutPrivateObject).not.toHaveBeenCalled();
  });

  it('refuses a body over the declared content-length cap before this route ever reads it', async () => {
    // Caught by the shared payload-ceiling guard in error-handler.ts, whose
    // `/api/uploads/` prefix entry already matches this route at the same
    // MAX_ATTACHMENT_BYTES bound this route's own declaredLength check
    // enforces -- this route's check is the defense-in-depth layer for a
    // request that skips or lies about Content-Length.
    const oversized = 'x'.repeat(1024);
    const request = new NextRequest(
      `http://localhost:3100/api/uploads/knowledge-file/put?${await tokenQuery()}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain', 'Content-Length': String(26 * 1024 * 1024) },
        body: oversized,
      },
    );

    const response = await PUT(request);

    expect(response.status).toBe(413);
    expect(mockPutPrivateObject).not.toHaveBeenCalled();
  });

  it('refuses an empty body', async () => {
    const response = await PUT(putRequest(await tokenQuery(), ''));

    expect(response.status).toBe(400);
    expect(mockPutPrivateObject).not.toHaveBeenCalled();
  });
});
