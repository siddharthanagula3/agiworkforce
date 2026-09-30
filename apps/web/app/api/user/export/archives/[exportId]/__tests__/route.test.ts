import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  resolveDataExportDownload: vi.fn(),
  getPresignedPrivateDownloadUrl: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  REDIS_OUTAGE_POLICY_ENV: 'AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY',
  acquireManagedTurnSlot: vi.fn(),
  checkRateLimit: vi.fn(),
  clientIpRateLimitIdentifier: vi.fn(),
  getClientIpForRateLimit: vi.fn(),
  isSharedStoreQuotaExhausted: vi.fn(),
  rateLimitConfigs: vi.fn(),
  readManagedTurnSlots: vi.fn(),
  resolveRedisOutagePolicy: vi.fn(),
  resolveTierRateLimit: vi.fn(),
  withRateLimitHandler: vi.fn(),
  withRateLimit: mocks.withRateLimit,
}));
vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  ACTIVE_ORG_HEADER: vi.fn(),
  getCurrentUserRlsDb: vi.fn(),
  getVerifiedBearerUserScopedDb: vi.fn(),
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/server/identity', () => ({
  getIdentityAuthorizedParties: vi.fn(),
  getIdentityUser: vi.fn(),
  getRequestIdentity: vi.fn(),
  verifyIdentitySessionToken: vi.fn(),
  getIdentityProvider: () => ({
    middleware: {
      signInRoute: () => ({ path: '/sign-in', redirectParam: 'redirect_url' }),
    },
  }),
}));
vi.mock('@/lib/server/object-storage', () => ({
  ObjectStorageTimeoutError: class ObjectStorageTimeoutError extends Error {},
  StoredObjectTooLargeError: class StoredObjectTooLargeError extends Error {},
  copyPrivateObjectIfUnchanged: vi.fn(),
  deleteObject: vi.fn(),
  deletePrivateObject: vi.fn(),
  getBoundedObject: vi.fn(),
  getBoundedPrivateObject: vi.fn(),
  getObject: vi.fn(),
  getObjectStream: vi.fn(),
  getPresignedPrivateUploadUrl: vi.fn(),
  getPresignedUploadUrl: vi.fn(),
  getPrivateObject: vi.fn(),
  getPrivateObjectStream: vi.fn(),
  headPrivateObject: vi.fn(),
  isObjectStorageConfigured: vi.fn(),
  isPrivateObjectStorageConfigured: vi.fn(),
  objectKeyFromPublicUrl: vi.fn(),
  objectKeyFromStorageUri: vi.fn(),
  publicUrlForKey: vi.fn(),
  putObject: vi.fn(),
  putPrivateObject: vi.fn(),
  getPresignedPrivateDownloadUrl: mocks.getPresignedPrivateDownloadUrl,
}));
vi.mock('@/lib/server/data-export-archive', () => ({
  buildDataExportArchiveVolume: vi.fn(),
  eraseUserDataExportArchives: vi.fn(),
  expireDataExportArchive: vi.fn(),
  listDataExportWorkspaces: vi.fn(),
  readDataExportArchive: vi.fn(),
  requestDataExportArchive: vi.fn(),
  sendDataExportReadyEmailJob: vi.fn(),
  DATA_EXPORT_DOWNLOAD_URL_TTL_SECONDS: 300,
  resolveDataExportDownload: mocks.resolveDataExportDownload,
}));

import { createError } from '@/lib/errors';
import { GET } from '../route';

const EXPORT_ID = 'exp_1';
const db = { query: vi.fn() };
const context = { params: Promise.resolve({ exportId: EXPORT_ID }) };

function request(query = '', headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost/api/user/export/archives/${EXPORT_ID}${query}`, {
    headers,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user_1' });
  mocks.resolveDataExportDownload.mockResolvedValue({
    key: 'exports/user_1/exp_1/part-2.zip',
    fileName: 'export-part-2.zip',
  });
  mocks.getPresignedPrivateDownloadUrl.mockResolvedValue('https://storage.example/signed');
});

describe('GET /api/user/export/archives/[exportId]', () => {
  it('answers 401 to a signed-out fetch', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await GET(request(), context);

    expect(response.status).toBe(401);
    expect(mocks.resolveDataExportDownload).not.toHaveBeenCalled();
  });

  it('sends a signed-out browser navigation to sign in and back', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await GET(request('?volume=2', { 'sec-fetch-mode': 'navigate' }), context);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location')!);
    expect(location.pathname).toBe('/sign-in');
    expect(location.searchParams.get('redirect_url')).toBe(
      `/api/user/export/archives/${EXPORT_ID}?volume=2`,
    );
    expect(mocks.resolveDataExportDownload).not.toHaveBeenCalled();
  });

  it('rejects a volume that is not a positive integer', async () => {
    const response = await GET(request('?volume=0'), context);

    expect(response.status).toBe(400);
    expect(mocks.resolveDataExportDownload).not.toHaveBeenCalled();
  });

  it('passes through a not found from the archive lookup', async () => {
    mocks.resolveDataExportDownload.mockRejectedValue(createError.notFound('No such export'));

    const response = await GET(request(), context);

    expect(response.status).toBe(404);
    expect(mocks.getPresignedPrivateDownloadUrl).not.toHaveBeenCalled();
  });

  it('redirects the owner to a short-lived signed url for the requested part', async () => {
    const response = await GET(request('?volume=2'), context);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://storage.example/signed');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocks.resolveDataExportDownload).toHaveBeenCalledWith(db, 'user_1', EXPORT_ID, 2);
    expect(mocks.getPresignedPrivateDownloadUrl).toHaveBeenCalledWith({
      key: 'exports/user_1/exp_1/part-2.zip',
      fileName: 'export-part-2.zip',
      expiresInSeconds: 300,
    });
  });

  it('defaults to the first part', async () => {
    await GET(request(), context);

    expect(mocks.resolveDataExportDownload).toHaveBeenCalledWith(db, 'user_1', EXPORT_ID, 1);
  });
});
