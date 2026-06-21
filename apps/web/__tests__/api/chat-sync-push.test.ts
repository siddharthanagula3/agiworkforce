/**
 * POST /api/chat/sync — conversation model COALESCE hardening.
 *
 * Desktop conversations have no `model` column, so a desktop push sends model=null.
 * The upsert must COALESCE model so a null push can never clobber a model another
 * client/device already set. project_id/pinned intentionally stay last-writer-wins
 * (null/false there are legit "unassign from project" / "unpin" intents).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({ db: { query: queryMock }, userId: 'u1' })),
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => undefined) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => undefined) }));

import { POST } from '@/app/api/chat/sync/route';
import { NextRequest } from 'next/server';

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue([{ id: 'x', server_version: '1' }]);
});

function postReq(body: unknown) {
  return new NextRequest('http://localhost/api/chat/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/chat/sync — conversation model COALESCE', () => {
  it('COALESCEs model so a null-model push cannot clobber an existing model', async () => {
    const res = await POST(
      postReq({
        conversations: [
          {
            id: '0190a000-0000-7000-8000-0000000000cc',
            title: 'Desktop chat',
            model: null, // desktop has no conversations.model column → pushes null
            updatedAt: '2026-06-21T00:00:00.000Z',
          },
        ],
        messages: [],
      }),
    );
    expect(res.status).toBe(200);

    const convCall = queryMock.mock.calls.find((c) =>
      String(c[0]).includes('insert into web_conversations'),
    );
    expect(convCall).toBeDefined();
    const sql = String(convCall![0]);
    // The protection: model only updates when the pushed value is non-null.
    expect(sql).toContain('coalesce(excluded.model, web_conversations.model)');
    // project_id stays last-writer-wins (no coalesce) so un-assign propagates.
    expect(sql).toContain('project_id = excluded.project_id');
  });
});
