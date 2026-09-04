import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetUserScopedDb, mockNeonQuery, mockPutPrivateObject } = vi.hoisted(() => ({
  mockGetUserScopedDb: vi.fn(),
  mockNeonQuery: vi.fn(),
  mockPutPrivateObject: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mockGetUserScopedDb }));
vi.mock('@/lib/server/object-storage', () => ({
  isPrivateObjectStorageConfigured: vi.fn(() => true),
  putPrivateObject: mockPutPrivateObject,
}));

import { PUT } from './route';

const PROJECT_ID = 'proj-1';
const OWNED_KEY = `knowledge-files/projects/${PROJECT_ID}/1700000000000_abc123.txt`;

function putRequest(key: string, body: string, contentType = 'text/plain'): NextRequest {
  return new NextRequest(
    `http://localhost:3100/api/uploads/knowledge-file/put?key=${encodeURIComponent(key)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': contentType, 'Content-Length': String(body.length) },
      body,
    },
  );
}

beforeEach(() => {
  mockNeonQuery.mockReset();
  mockPutPrivateObject.mockReset();
  mockPutPrivateObject.mockResolvedValue(undefined);
  mockGetUserScopedDb.mockResolvedValue({
    db: { query: (...args: unknown[]) => mockNeonQuery(...args) },
    userId: 'user-abc',
    organizationId: '11111111-1111-4111-8111-111111111111',
  });
  mockNeonQuery.mockResolvedValue([{ id: PROJECT_ID }]);
});

describe('PUT /api/uploads/knowledge-file/put', () => {
  it('writes an owned key to private storage', async () => {
    const response = await PUT(putRequest(OWNED_KEY, 'hello world'));

    expect(response.status).toBe(200);
    expect(mockPutPrivateObject).toHaveBeenCalledWith(
      expect.objectContaining({ key: OWNED_KEY, contentType: 'text/plain' }),
    );
  });

  it('refuses a key that does not match the knowledge-file shape', async () => {
    const response = await PUT(putRequest('chat-attachments/user-abc/file.txt', 'hello'));

    expect(response.status).toBe(403);
    expect(mockPutPrivateObject).not.toHaveBeenCalled();
  });

  it('refuses a path-traversal key', async () => {
    const response = await PUT(
      putRequest(`knowledge-files/projects/${PROJECT_ID}/../../etc/passwd`, 'hello'),
    );

    expect(response.status).toBe(403);
    expect(mockPutPrivateObject).not.toHaveBeenCalled();
  });

  it('refuses a key for a project the user does not own', async () => {
    mockNeonQuery.mockResolvedValueOnce([]);

    const response = await PUT(putRequest(OWNED_KEY, 'hello world'));

    expect(response.status).toBe(404);
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
      `http://localhost:3100/api/uploads/knowledge-file/put?key=${encodeURIComponent(OWNED_KEY)}`,
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
    const response = await PUT(putRequest(OWNED_KEY, ''));

    expect(response.status).toBe(400);
    expect(mockPutPrivateObject).not.toHaveBeenCalled();
  });
});
