import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => {
  class GoogleDriveFileError extends Error {}
  return {
    GoogleDriveFileError,
    query: vi.fn(),
    csrf: vi.fn(async (): Promise<Response | null> => null),
    access: vi.fn(),
    importFile: vi.fn(),
    assertProject: vi.fn(async () => undefined),
  };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: () => mocks.csrf() }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: async () => null }));
vi.mock('@/lib/connectors/connector-capability', () => ({
  assertConnectorsReleased: () => undefined,
}));
vi.mock('@/lib/connectors/google-drive-files', () => ({
  GoogleDriveFileError: mocks.GoogleDriveFileError,
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: async () => ({
    db: { query: (...args: unknown[]) => mocks.query(...args) },
    userId: 'user-1',
    organizationId: null,
  }),
}));
vi.mock('@/lib/server/project-drive-import', () => ({
  assertDriveImportableProject: () => mocks.assertProject(),
  resolveDriveAccess: () => mocks.access(),
  driveImportLimits: async () => ({ maxBytes: 100, tooLargeMessage: undefined }),
  importDriveFileIntoProject: (...args: unknown[]) => mocks.importFile(...args),
}));

const { POST } = await import('./route');

const FILE = '55555555-5555-4555-8555-555555555555';

function call(fileId = FILE) {
  return POST(new NextRequest('http://localhost/x', { method: 'POST' }), {
    params: Promise.resolve({ id: 'p-1', fileId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ accessToken: 't', accountKey: 'k' });
  mocks.query.mockResolvedValue([
    { provider: 'google_drive', external_id: 'drive-1', version: '7' },
  ]);
});

describe('POST /api/projects/[id]/knowledge-files/[fileId]/refresh', () => {
  it('re-reads a Drive source as a new version when it changed', async () => {
    mocks.importFile.mockResolvedValue({
      status: 'added',
      registration: { file: { id: 'new-version' } },
    });
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'refreshed', file: { id: 'new-version' } });
    const args = mocks.importFile.mock.calls[0]!;
    expect(args[3]).toBe('drive-1');
    expect(args[4]).toEqual({ skipIfVersion: '7' });
    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('file.superseded_at is null');
    expect(params).toEqual([FILE, 'p-1', 'user-1']);
  });

  it('says so when Drive has nothing newer', async () => {
    mocks.importFile.mockResolvedValue({ status: 'unchanged' });
    expect(await (await call()).json()).toEqual({ status: 'unchanged' });
  });

  it('refuses a source that did not come from Drive', async () => {
    mocks.query.mockResolvedValue([{ provider: 'github', external_id: 'x', version: null }]);
    expect((await call()).status).toBe(409);
    expect(mocks.importFile).not.toHaveBeenCalled();
  });

  it('passes on the connect prompt when Drive is not connected', async () => {
    mocks.access.mockResolvedValue(
      NextResponse.json({ error: { code: 'google_drive_not_connected' } }, { status: 409 }),
    );
    const response = await call();
    expect(response.status).toBe(409);
    expect(mocks.importFile).not.toHaveBeenCalled();
  });

  it('404s an unknown source or a malformed id', async () => {
    mocks.query.mockResolvedValue([]);
    expect((await call()).status).toBe(404);
    expect((await call('nope')).status).toBe(404);
  });
});
