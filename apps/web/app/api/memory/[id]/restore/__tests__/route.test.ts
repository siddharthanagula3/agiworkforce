import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  withRateLimit: vi.fn(),
  requireCsrfToken: vi.fn(),
  assertMemoryWriteAllowed: vi.fn(),
  query: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.getUserScopedDb }));
vi.mock('@/lib/services/memory-write-service', () => ({
  assertMemoryWriteAllowed: mocks.assertMemoryWriteAllowed,
}));
vi.mock('@/lib/services/managed-memory-context-service', () => ({
  activeMemoryPredicate: () => 'true',
  unexpiredMemoryPredicate: () => 'true',
  workspaceMemoryPredicate: () => 'true',
}));

import { createError } from '@/lib/errors';
import { POST } from '../route';

const MEMORY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const KEPT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function request(): NextRequest {
  return new NextRequest(`http://localhost:3000/api/memory/${MEMORY}/restore`, { method: 'POST' });
}

function context(id = MEMORY) {
  return { params: Promise.resolve({ id }) };
}

describe('/api/memory/[id]/restore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserScopedDb.mockResolvedValue({
      db: { query: mocks.query },
      userId: 'user-1',
      organizationId: 'org-1',
    });
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.assertMemoryWriteAllowed.mockResolvedValue(undefined);
  });

  it('refuses a request that fails the CSRF check', async () => {
    mocks.requireCsrfToken.mockResolvedValue(NextResponse.json({ error: 'csrf' }, { status: 403 }));
    const response = await POST(request(), context());
    expect(response.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('rejects an id that is not a uuid', async () => {
    const response = await POST(request(), context('memory-1'));
    expect(response.status).toBe(400);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated caller with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());
    const response = await POST(request(), context());
    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('answers 404 when the memory is not the caller or is deleted', async () => {
    mocks.query.mockResolvedValueOnce([]);
    const response = await POST(request(), context());
    expect(response.status).toBe(404);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.query.mock.calls[0]?.[1]).toEqual([MEMORY, 'user-1', 'org-1']);
    expect(mocks.assertMemoryWriteAllowed).not.toHaveBeenCalled();
  });

  it('does not swap when the write policy refuses the content', async () => {
    mocks.query.mockResolvedValueOnce([{ content: 'blocked content' }]);
    mocks.assertMemoryWriteAllowed.mockRejectedValue(createError.forbidden('blocked'));
    const response = await POST(request(), context());
    expect(response.status).toBe(403);
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it('answers 404 when there is nothing left to swap', async () => {
    mocks.query
      .mockResolvedValueOnce([{ content: 'likes tea' }])
      .mockResolvedValueOnce([{ restored: null, replaced: null }]);
    const response = await POST(request(), context());
    expect(response.status).toBe(404);
  });

  it('restores the replaced memory and demotes the one that replaced it', async () => {
    mocks.query
      .mockResolvedValueOnce([{ content: 'likes tea' }])
      .mockResolvedValueOnce([{ restored: MEMORY, replaced: KEPT }]);
    const response = await POST(request(), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ restoredId: MEMORY, replacedId: KEPT });
    expect(mocks.assertMemoryWriteAllowed).toHaveBeenCalledWith(
      { query: mocks.query },
      { userId: 'user-1', content: 'likes tea' },
    );
    expect(mocks.query.mock.calls[1]?.[1]).toEqual([MEMORY, 'user-1', 'org-1']);
  });
});
