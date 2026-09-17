import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockVerifyCronRequest, mockQuery } = vi.hoisted(() => ({
  mockVerifyCronRequest: vi.fn(),
  mockQuery: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/cron-auth', () => ({ verifyCronRequest: mockVerifyCronRequest }));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: (...args: unknown[]) => mockQuery(...args) }),
}));

import { GET } from './route';

function cronRequest(): NextRequest {
  return new NextRequest('http://localhost/api/cron/purge-temporary-chats');
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCronRequest.mockReturnValue(true);
});

describe('GET /api/cron/purge-temporary-chats', () => {
  it('refuses an unsigned request', async () => {
    mockVerifyCronRequest.mockReturnValue(false);

    expect((await GET(cronRequest())).status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('retires the files a temporary chat received on the same clock as the chat', async () => {
    mockQuery.mockResolvedValueOnce([{ count: 3 }]).mockResolvedValueOnce([{ count: 2 }]);

    const response = await GET(cronRequest());
    const body = (await response.json()) as { purged: number; attachmentsRetired: number };

    expect(response.status).toBe(200);
    expect(body.purged).toBe(3);
    expect(body.attachmentsRetired).toBe(2);

    const [conversationSql, conversationParams] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(conversationSql).toMatch(/delete from web_conversations/i);
    const [mediaSql, mediaParams] = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(mediaSql).toMatch(/update public\.media_assets/i);
    expect(mediaSql).toMatch(/set deleted_at = now\(\)/i);
    expect(mediaSql).toMatch(/where temporary_chat/i);
    expect(mediaParams[0]).toBe(conversationParams[0]);
  });

  it('marks files deleted rather than deleting them, so one job owns the stored bytes', async () => {
    mockQuery.mockResolvedValue([{ count: 0 }]);

    await GET(cronRequest());

    const mediaSql = String((mockQuery.mock.calls[1] as [string])[0]);
    expect(mediaSql).not.toMatch(/delete from public\.media_assets/i);
  });
});
