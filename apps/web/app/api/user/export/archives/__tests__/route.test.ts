import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  readDataExportArchive: vi.fn(),
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
vi.mock('@/lib/server/data-export-archive', () => ({
  DATA_EXPORT_DOWNLOAD_URL_TTL_SECONDS: 300,
  buildDataExportArchiveVolume: vi.fn(),
  eraseUserDataExportArchives: vi.fn(),
  expireDataExportArchive: vi.fn(),
  listDataExportWorkspaces: vi.fn(),
  requestDataExportArchive: vi.fn(),
  resolveDataExportDownload: vi.fn(),
  sendDataExportReadyEmailJob: vi.fn(),
  readDataExportArchive: mocks.readDataExportArchive,
}));

import { createError } from '@/lib/errors';
import { GET } from '../route';

const db = { query: vi.fn() };

function request(): NextRequest {
  return new NextRequest('http://localhost/api/user/export/archives');
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user_1' });
});

describe('GET /api/user/export/archives', () => {
  it('answers 401 when there is no session', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mocks.readDataExportArchive).not.toHaveBeenCalled();
  });

  it('returns the rate limit response', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    const response = await GET(request());

    expect(response.status).toBe(429);
    expect(mocks.readDataExportArchive).not.toHaveBeenCalled();
  });

  it('reads the archive for the caller and is never cached', async () => {
    const archive = { exportId: 'exp_1', status: 'ready', volumes: 1 };
    mocks.readDataExportArchive.mockResolvedValue(archive);

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(mocks.withRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'chat-conversation-read',
      'user_1',
    );
    expect(mocks.readDataExportArchive).toHaveBeenCalledWith(db, 'user_1');
    expect(await response.json()).toEqual({ archive });
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('returns a null archive when the caller has none', async () => {
    mocks.readDataExportArchive.mockResolvedValue(null);

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ archive: null });
  });
});
