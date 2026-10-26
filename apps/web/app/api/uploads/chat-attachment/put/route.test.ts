import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetClerkAuthUser, mockPutPrivateObject } = vi.hoisted(() => ({
  mockGetClerkAuthUser: vi.fn(),
  mockPutPrivateObject: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: mockGetClerkAuthUser }));
vi.mock('@/lib/server/object-storage', () => ({
  copyPrivateObjectIfUnchanged: vi.fn(),
  isPrivateObjectStorageConfigured: vi.fn(() => true),
  isObjectStorageConfigured: vi.fn(() => true),
  putPrivateObject: mockPutPrivateObject,
  deletePrivateObject: vi.fn(),
  deleteObject: vi.fn(),
  getObject: vi.fn(),
  getPrivateObject: vi.fn(),
  getObjectStream: vi.fn(),
  getPrivateObjectStream: vi.fn(),
  getBoundedObject: vi.fn(),
  getBoundedPrivateObject: vi.fn(),
  StoredObjectTooLargeError: class extends Error {},
}));
vi.mock('@/lib/server/object-storage-runtime', () => ({
  getObjectStore: vi.fn(),
  objectStorageConfig: () => ({ secretAccessKey: 'test-object-storage-secret' }),
}));

import { PUT } from './route';
import { createChatAttachmentRelayAuthorization } from '@/lib/server/chat-attachment-completion';
import { sealedChatAttachmentPathname } from '@/lib/server/media-storage';

const USER = 'user-abc';
const OWNED_KEY = `chat-attachments/${USER}/1700000000000_abc123.txt`;
const BODY = 'hello world';

function authorize(
  overrides: Partial<Parameters<typeof createChatAttachmentRelayAuthorization>[0]> = {},
) {
  return createChatAttachmentRelayAuthorization({
    userId: USER,
    key: OWNED_KEY,
    contentType: 'text/plain',
    byteCount: BODY.length,
    ...overrides,
  });
}

function putRequest(query: string, body: string, contentType = 'text/plain'): NextRequest {
  return new NextRequest(`http://localhost:3100/api/uploads/chat-attachment/put?${query}`, {
    method: 'PUT',
    headers: { 'Content-Type': contentType, 'Content-Length': String(body.length) },
    body,
  });
}

async function tokenQuery(
  overrides?: Partial<Parameters<typeof createChatAttachmentRelayAuthorization>[0]>,
): Promise<string> {
  return `token=${encodeURIComponent(await authorize(overrides))}`;
}

beforeEach(() => {
  mockPutPrivateObject.mockReset();
  mockPutPrivateObject.mockResolvedValue(undefined);
  mockGetClerkAuthUser.mockResolvedValue({ userId: USER });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PUT /api/uploads/chat-attachment/put', () => {
  it('writes the key its authorization names', async () => {
    const response = await PUT(putRequest(await tokenQuery(), BODY));

    expect(response.status).toBe(200);
    expect(mockPutPrivateObject).toHaveBeenCalledWith(
      expect.objectContaining({ key: OWNED_KEY, contentType: 'text/plain' }),
    );
  });

  it('refuses a caller-chosen key naming the sealed copy of an inspected attachment', async () => {
    const response = await PUT(
      putRequest(`key=${encodeURIComponent(sealedChatAttachmentPathname(OWNED_KEY))}`, BODY),
    );

    expect(response.status).toBe(403);
    expect(mockPutPrivateObject).not.toHaveBeenCalled();
  });

  it('refuses a caller-chosen key that no admitted presign issued', async () => {
    const response = await PUT(putRequest(`key=${encodeURIComponent(OWNED_KEY)}`, BODY));

    expect(response.status).toBe(403);
    expect(mockPutPrivateObject).not.toHaveBeenCalled();
  });

  it('never authorizes a sealed destination', async () => {
    await expect(authorize({ key: sealedChatAttachmentPathname(OWNED_KEY) })).rejects.toThrow();
  });

  it('refuses an authorization whose key was rewritten to the sealed copy', async () => {
    const [payload, signature] = (await authorize()).split('.');
    const forged = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8')),
        key: sealedChatAttachmentPathname(OWNED_KEY),
      }),
    ).toString('base64url');

    const response = await PUT(
      putRequest(`token=${encodeURIComponent(`${forged}.${signature}`)}`, BODY),
    );

    expect(response.status).toBe(403);
    expect(mockPutPrivateObject).not.toHaveBeenCalled();
  });

  it('refuses a body larger than the size that was admitted', async () => {
    const response = await PUT(putRequest(await tokenQuery({ byteCount: 4 }), BODY));

    expect(response.status).toBe(403);
    expect(mockPutPrivateObject).not.toHaveBeenCalled();
  });

  it('refuses a content type other than the one that was admitted', async () => {
    const response = await PUT(putRequest(await tokenQuery(), BODY, 'text/html'));

    expect(response.status).toBe(403);
    expect(mockPutPrivateObject).not.toHaveBeenCalled();
  });

  it('refuses an authorization minted for another account', async () => {
    const response = await PUT(
      putRequest(
        await tokenQuery({ userId: 'user-other', key: 'chat-attachments/user-other/1_a.txt' }),
        BODY,
      ),
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
});
