import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockVerifyCronRequest, mockQuery, mockPurgeFiles } = vi.hoisted(() => ({
  mockVerifyCronRequest: vi.fn(),
  mockQuery: vi.fn(),
  mockPurgeFiles: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/cron-auth', () => ({ verifyCronRequest: mockVerifyCronRequest }));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: (...args: unknown[]) => mockQuery(...args) }),
}));
vi.mock('@/lib/server/temporary-files', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  purgeTemporaryChatFiles: mockPurgeFiles,
}));

import { GET } from './route';

function cronRequest(): NextRequest {
  return new NextRequest('http://localhost/api/cron/purge-temporary-chats');
}

function purgeResult(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    candidates: 0,
    objectsDeleted: 0,
    objectsFailed: 0,
    purged: 0,
    heldFromPurge: 0,
    remaining: false,
    ...overrides,
  };
}

function purgeStatements(): Array<[string, unknown[]]> {
  return mockQuery.mock.calls.filter(
    ([sql]) => !/count\(\*\)::int as count\s+from public\.\w+ candidate/i.test(String(sql)),
  ) as Array<[string, unknown[]]>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCronRequest.mockReturnValue(true);
  mockPurgeFiles.mockResolvedValue(purgeResult());
});

describe('GET /api/cron/purge-temporary-chats', () => {
  it('refuses an unsigned request', async () => {
    mockVerifyCronRequest.mockReturnValue(false);

    expect((await GET(cronRequest())).status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockPurgeFiles).not.toHaveBeenCalled();
  });

  it('hard-deletes the files a temporary chat received on the same clock as the chat', async () => {
    mockQuery
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 3 }])
      .mockResolvedValueOnce([{ count: 1 }]);
    mockPurgeFiles.mockResolvedValue(purgeResult({ purged: 2, heldFromPurge: 4 }));

    const response = await GET(cronRequest());
    const body = (await response.json()) as {
      purged: number;
      jobsPurged: number;
      attachmentsRetired: number;
      heldAttachments: number;
    };

    expect(response.status).toBe(200);
    expect(body.purged).toBe(3);
    expect(body.jobsPurged).toBe(1);
    expect(body.attachmentsRetired).toBe(2);
    expect(body.heldAttachments).toBe(4);

    const [conversationSql] = purgeStatements()[0] as [string, unknown[]];
    expect(conversationSql).toMatch(/delete from web_conversations/i);
    expect(conversationSql).toMatch(/delete from public\.image_generation_jobs/i);
    expect(conversationSql).toMatch(/delete from public\.video_generation_jobs/i);
    const [jobsSql] = purgeStatements()[1] as [string, unknown[]];
    expect(jobsSql).toMatch(/job\.conversation_id is null/i);
    expect(jobsSql).toMatch(/job\.temporary_chat/i);
    expect(mockPurgeFiles).toHaveBeenCalledTimes(1);
  });

  it('never parks a temporary-chat file behind the Library recovery window', async () => {
    mockQuery.mockResolvedValue([{ count: 0 }]);

    await GET(cronRequest());

    for (const [sql] of purgeStatements()) {
      expect(sql).not.toMatch(/update public\.media_assets/i);
      expect(sql).not.toMatch(/set deleted_at/i);
    }
    expect(mockPurgeFiles).toHaveBeenCalledTimes(1);
  });

  it('keeps sweeping files while batches come back full and make progress', async () => {
    mockQuery.mockResolvedValue([{ count: 0 }]);
    mockPurgeFiles
      .mockResolvedValueOnce(purgeResult({ purged: 500, remaining: true }))
      .mockResolvedValueOnce(purgeResult({ purged: 120, remaining: false }));

    const response = await GET(cronRequest());
    const body = (await response.json()) as { attachmentsRetired: number; remaining: boolean };

    expect(mockPurgeFiles).toHaveBeenCalledTimes(2);
    expect(body.attachmentsRetired).toBe(620);
    expect(body.remaining).toBe(false);
  });

  it('stops and reports a backlog when a full batch removes nothing', async () => {
    mockQuery.mockResolvedValue([{ count: 0 }]);
    mockPurgeFiles.mockResolvedValue(
      purgeResult({ purged: 0, objectsFailed: 500, remaining: true }),
    );

    const response = await GET(cronRequest());
    const body = (await response.json()) as { remaining: boolean };

    expect(mockPurgeFiles).toHaveBeenCalledTimes(1);
    expect(body.remaining).toBe(true);
  });
});

type ImportedModule0 = typeof import('@/lib/server/temporary-files');
