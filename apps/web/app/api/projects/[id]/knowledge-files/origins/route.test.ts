import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

type RateLimitModule = typeof import('@/lib/rate-limit');
type RlsDbModule = typeof import('@/lib/server/rls-db');

const mocks = vi.hoisted(() => ({ query: vi.fn(), rateLimit: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: mocks.rateLimit,
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getUserScopedDb: async () => ({
    db: { query: mocks.query },
    userId: 'user-1',
    organizationId: null,
  }),
}));

const { GET } = await import('./route');

const PROJECT = '6f1d6c3a-2b4f-4d7e-9a1c-0f2e3d4c5b6a';
const DRIVE_FILE = '55555555-5555-4555-8555-555555555555';
const WEB_FILE = '66666666-6666-4666-8666-666666666666';

function call() {
  return GET(new NextRequest(`http://localhost/api/projects/${PROJECT}/knowledge-files/origins`), {
    params: Promise.resolve({ id: PROJECT }),
  });
}

describe('GET /api/projects/[id]/knowledge-files/origins', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue(null);
  });

  it('lists where each live source came from, and marks only Drive sources refreshable', async () => {
    mocks.query.mockResolvedValueOnce([
      {
        file_id: DRIVE_FILE,
        provider: 'google_drive',
        uri: 'https://drive.google.com/file/d/abc',
        version: '7',
        last_seen_at: new Date('2026-10-19T01:00:00.000Z'),
      },
      {
        file_id: WEB_FILE,
        provider: 'web',
        uri: 'https://example.com/spec',
        version: null,
        last_seen_at: '2026-10-18T09:30:00+00:00',
      },
    ]);

    const response = await call();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      origins: [
        {
          fileId: DRIVE_FILE,
          provider: 'google_drive',
          uri: 'https://drive.google.com/file/d/abc',
          refreshable: true,
          checkedAt: '2026-10-19T01:00:00.000Z',
        },
        {
          fileId: WEB_FILE,
          provider: 'web',
          uri: 'https://example.com/spec',
          refreshable: false,
          checkedAt: '2026-10-18T09:30:00.000Z',
        },
      ],
    });
  });

  it('reads only the caller’s references to live, current files of the project', async () => {
    mocks.query.mockResolvedValueOnce([]);
    await call();

    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('file.deleted_at is null');
    expect(sql).toContain('file.superseded_at is null');
    expect(sql).toContain('ref.user_id = $2');
    expect(params).toEqual([PROJECT, 'user-1']);
  });

  it('returns the rate limit answer without reading', async () => {
    mocks.rateLimit.mockResolvedValue(NextResponse.json({ error: 'slow' }, { status: 429 }));
    expect((await call()).status).toBe(429);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
