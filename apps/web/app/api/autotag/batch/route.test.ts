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

describe('POST /api/autotag/batch workspace boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scoped.mockResolvedValue({
      db: { query: mocks.query, execute: mocks.execute },
      userId: 'user-1',
      organizationId: ORGANIZATION_ID,
    });
    mocks.query.mockResolvedValue([{ conversation_id: 'conversation-1', tag: 'coding' }]);
  });

  it('reads tags only through live parent conversations in the active workspace', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/autotag/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversationIds: ['conversation-1', 'conversation-2'] }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining('c.organization_id is not distinct from $3::uuid'),
      ['user-1', ['conversation-1', 'conversation-2'], ORGANIZATION_ID],
    );
    await expect(response.json()).resolves.toEqual({
      tags: { 'conversation-1': 'coding', 'conversation-2': 'general' },
    });
  });

  it('compares the uuid tag key against the uuid conversation id, not text', async () => {
    await POST(
      new NextRequest('http://localhost/api/autotag/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversationIds: ['conversation-1'] }),
      }),
    );

    const [sql] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('on c.id = ct.conversation_id');
    expect(sql).not.toContain('c.id::text');
  });

  it('reads through the rls scoped handle, never the schema owner', async () => {
    await POST(
      new NextRequest('http://localhost/api/autotag/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversationIds: ['conversation-1'] }),
      }),
    );

    expect(getUserScopedDb).toHaveBeenCalledTimes(1);
  });
});
