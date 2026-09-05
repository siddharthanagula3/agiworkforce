import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  scoped: vi.fn(),
  query: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.scoped }));

import { GET } from './route';
import { getUserScopedDb } from '@/lib/server/rls-db';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

describe('GET /api/autotag/conversations workspace boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scoped.mockResolvedValue({
      db: { query: mocks.query, execute: mocks.execute },
      userId: 'user-1',
      organizationId: ORGANIZATION_ID,
    });
    mocks.query.mockResolvedValue([{ conversation_id: 'conversation-1' }]);
  });

  it('returns tag matches only through live parent conversations in the active workspace', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/autotag/conversations?tag=coding'),
    );

    expect(response.status).toBe(200);
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining('c.organization_id is not distinct from $3::uuid'),
      ['user-1', 'coding', ORGANIZATION_ID],
    );
    await expect(response.json()).resolves.toEqual({ conversationIds: ['conversation-1'] });
  });

  it('reads through the rls scoped handle, never the schema owner', async () => {
    await GET(new NextRequest('http://localhost/api/autotag/conversations?tag=coding'));

    expect(getUserScopedDb).toHaveBeenCalledTimes(1);
  });
});
