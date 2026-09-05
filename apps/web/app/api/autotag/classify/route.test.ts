import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  scoped: vi.fn(),
  query: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.scoped }));

import { POST } from './route';
import { getUserScopedDb } from '@/lib/server/rls-db';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

function request(): NextRequest {
  return new NextRequest('http://localhost/api/autotag/classify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ conversationId: 'conversation-1' }),
  });
}

describe('POST /api/autotag/classify workspace boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scoped.mockResolvedValue({
      db: { query: mocks.query, execute: mocks.execute },
      userId: 'user-1',
      organizationId: ORGANIZATION_ID,
    });
    mocks.query
      .mockResolvedValueOnce([{ id: 'conversation-1' }])
      .mockResolvedValueOnce([{ content: 'Please fix this test failure' }]);
    mocks.execute.mockResolvedValue(1);
  });

  it('classifies only a conversation in the server-resolved active workspace', async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('organization_id is not distinct from $3::uuid'),
      ['conversation-1', 'user-1', ORGANIZATION_ID],
    );
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it('does not read messages or write a tag for a conversation in another workspace', async () => {
    mocks.query.mockReset().mockResolvedValueOnce([]);

    const response = await POST(request());

    expect(response.status).toBe(404);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('reads and writes through the rls scoped handle, never the schema owner', async () => {
    await POST(request());

    expect(getUserScopedDb).toHaveBeenCalledTimes(1);
  });
});
