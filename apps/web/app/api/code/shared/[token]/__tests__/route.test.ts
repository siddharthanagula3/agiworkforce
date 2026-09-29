import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  isCloudCodeSchemaUnavailable: vi.fn(),
  openSharedCloudCodeSession: vi.fn(),
  db: { query: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.getUserScopedDb }));
vi.mock('@/lib/services/cloud-code-session-service', () => ({
  isCloudCodeSchemaUnavailable: mocks.isCloudCodeSchemaUnavailable,
}));
vi.mock('@/lib/services/cloud-code-session-sharing', () => ({
  CloudCodeSharedRepositoryError: class CloudCodeSharedRepositoryError extends Error {},
  openSharedCloudCodeSession: mocks.openSharedCloudCodeSession,
}));

import { createError } from '@/lib/errors';
import { CloudCodeSharedRepositoryError } from '@/lib/services/cloud-code-session-sharing';
import { GET } from '../route';

const TOKEN = 'share-token-1';
const SHARED = { sessionId: 'session-1', title: 'Fix the build', transcript: [] };

function call() {
  return GET(new NextRequest(`http://localhost/api/code/shared/${TOKEN}`), {
    params: Promise.resolve({ token: TOKEN }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.getUserScopedDb.mockResolvedValue({ db: mocks.db, userId: 'viewer-1' });
  mocks.isCloudCodeSchemaUnavailable.mockReturnValue(false);
  mocks.openSharedCloudCodeSession.mockResolvedValue(SHARED);
});

describe('GET /api/code/shared/[token]', () => {
  it('rejects a signed-out caller with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await call();

    expect(response.status).toBe(401);
    expect(mocks.openSharedCloudCodeSession).not.toHaveBeenCalled();
  });

  it('rate limits share views per user', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    const response = await call();

    expect(response.status).toBe(429);
    expect(mocks.withRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'share-view',
      'user:viewer-1',
    );
  });

  it('answers 404 when the share is gone', async () => {
    mocks.openSharedCloudCodeSession.mockResolvedValue(null);

    const response = await call();

    expect(response.status).toBe(404);
  });

  it('answers 403 when the viewer cannot read the repository', async () => {
    mocks.openSharedCloudCodeSession.mockRejectedValue(
      new CloudCodeSharedRepositoryError('You need access to acme/app'),
    );

    const response = await call();

    expect(response.status).toBe(403);
  });

  it('answers 503 while the cloud schema is not deployed', async () => {
    mocks.openSharedCloudCodeSession.mockRejectedValue(new Error('relation missing'));
    mocks.isCloudCodeSchemaUnavailable.mockReturnValue(true);

    const response = await call();

    expect(response.status).toBe(503);
  });

  it('opens the shared session for the viewer', async () => {
    const response = await call();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(SHARED);
    expect(mocks.openSharedCloudCodeSession).toHaveBeenCalledWith(mocks.db, 'viewer-1', TOKEN);
  });
});
