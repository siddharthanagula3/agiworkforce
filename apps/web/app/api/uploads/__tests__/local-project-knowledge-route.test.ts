import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetClerkAuthUser, mockStore, mockLoggerError } = vi.hoisted(() => ({
  mockGetClerkAuthUser: vi.fn(),
  mockStore: vi.fn(),
  mockLoggerError: vi.fn(),
}));

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  withRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  logger: { info: vi.fn(), error: mockLoggerError, warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  getClerkAuthUser: mockGetClerkAuthUser,
}));
vi.mock('@/lib/server/project-knowledge-object-storage', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, storeLocalProjectKnowledgeUpload: mockStore };
});

import { PUT } from '../local-project-knowledge/route';

const UNSTORABLE = 'ENOSPC: no space left on device, open /Users/somebody/.agi/objects/a.tmp';

function putRequest(query = '?token=abc'): NextRequest {
  return new NextRequest(`http://localhost:3000/api/uploads/local-project-knowledge${query}`, {
    method: 'PUT',
    headers: { 'content-type': 'text/plain' },
    body: 'notes',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'development');
  mockGetClerkAuthUser.mockResolvedValue({ userId: 'user-owner' });
  mockStore.mockResolvedValue(undefined);
});

describe('PUT /api/uploads/local-project-knowledge', () => {
  it('stores a local project source and answers with no body', async () => {
    const response = await PUT(putRequest());

    expect(response.status).toBe(204);
    expect(mockStore).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'abc', userId: 'user-owner', contentType: 'text/plain' }),
    );
  });

  it('is not routable outside development, before it authenticates anybody', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const response = await PUT(putRequest());

    expect(response.status).toBe(404);
    expect(mockGetClerkAuthUser).not.toHaveBeenCalled();
  });

  it('refuses a request that names no upload authorization', async () => {
    const response = await PUT(putRequest(''));

    expect(response.status).toBe(400);
    expect(mockStore).not.toHaveBeenCalled();
  });

  it('names the condition and the next step when the bytes cannot be stored', async () => {
    mockStore.mockRejectedValue(new Error(UNSTORABLE));

    const response = await PUT(putRequest());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.message).toBe(
      'This upload could not be stored. Ask for a new upload link and add the file again.',
    );
    expect(JSON.stringify(body)).not.toContain('ENOSPC');
    expect(JSON.stringify(body)).not.toContain('/Users/');
    expect(mockLoggerError).toHaveBeenCalled();
  });
});
