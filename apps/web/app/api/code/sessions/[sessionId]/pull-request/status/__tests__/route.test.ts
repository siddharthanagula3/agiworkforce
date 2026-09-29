import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  readCloudCodeSessionPullRequestStatus: vi.fn(),
  isCloudCodeSchemaUnavailable: vi.fn(),
  db: { query: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.getUserScopedDb }));
vi.mock('@/lib/services/cloud-code-session-service', () => ({
  CloudCodeNotFoundError: class CloudCodeNotFoundError extends Error {},
  CloudCodeUnavailableError: class CloudCodeUnavailableError extends Error {},
  CloudCodeValidationError: class CloudCodeValidationError extends Error {},
  isCloudCodeSchemaUnavailable: mocks.isCloudCodeSchemaUnavailable,
  readCloudCodeSessionPullRequestStatus: mocks.readCloudCodeSessionPullRequestStatus,
}));

import { createError } from '@/lib/errors';
import {
  CloudCodeNotFoundError,
  CloudCodeUnavailableError,
  CloudCodeValidationError,
} from '@/lib/services/cloud-code-session-service';
import { GET } from '../route';

const SESSION = 'session-1';
const STATUS = { url: 'https://github.com/acme/app/pull/7', state: 'open', checks: 'passing' };

function call() {
  return GET(new NextRequest(`http://localhost/api/code/sessions/${SESSION}/pull-request/status`), {
    params: Promise.resolve({ sessionId: SESSION }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.getUserScopedDb.mockResolvedValue({
    db: mocks.db,
    userId: 'user-1',
    organizationId: 'org-1',
  });
  mocks.isCloudCodeSchemaUnavailable.mockReturnValue(false);
  mocks.readCloudCodeSessionPullRequestStatus.mockResolvedValue(STATUS);
});

describe('GET /api/code/sessions/[sessionId]/pull-request/status', () => {
  it('rejects a signed-out caller with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await call();

    expect(response.status).toBe(401);
    expect(mocks.readCloudCodeSessionPullRequestStatus).not.toHaveBeenCalled();
  });

  it('rate limits per user', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    const response = await call();

    expect(response.status).toBe(429);
    expect(mocks.withRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'chat-conversation',
      'user:user-1',
    );
  });

  it.each([
    [new CloudCodeValidationError('bad id'), 400],
    [new CloudCodeNotFoundError('not yours'), 404],
    [new CloudCodeUnavailableError('down'), 503],
  ])('maps %s to %i', async (error, status) => {
    mocks.readCloudCodeSessionPullRequestStatus.mockRejectedValue(error);

    const response = await call();

    expect(response.status).toBe(status);
  });

  it('answers 503 while the cloud schema is not deployed', async () => {
    mocks.readCloudCodeSessionPullRequestStatus.mockRejectedValue(new Error('relation missing'));
    mocks.isCloudCodeSchemaUnavailable.mockReturnValue(true);

    const response = await call();

    expect(response.status).toBe(503);
    expect((await response.json()).error.message).toContain('Managed Code is coming soon');
  });

  it('returns the status scoped to the caller and organization', async () => {
    const response = await call();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(STATUS);
    expect(mocks.readCloudCodeSessionPullRequestStatus).toHaveBeenCalledWith(
      mocks.db,
      { userId: 'user-1', organizationId: 'org-1' },
      SESSION,
    );
  });
});
