import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  withRateLimit: vi.fn(),
  requireCsrfToken: vi.fn(),
  saveTemporaryChatAssetToLibrary: vi.fn(),
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
vi.mock('@/lib/csrf', () => ({
  generateCsrfToken: vi.fn(),
  getOrCreateAnonSession: vi.fn(),
  getSessionIdFromRequest: vi.fn(),
  isBearerTokenValid: vi.fn(),
  readCookie: vi.fn(),
  resetCsrfCache: vi.fn(),
  validateCsrfFromRequest: vi.fn(),
  verifyCsrfToken: vi.fn(),
  requireCsrfToken: mocks.requireCsrfToken,
}));
vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  ACTIVE_ORG_HEADER: vi.fn(),
  getCurrentUserRlsDb: vi.fn(),
  getVerifiedBearerUserScopedDb: vi.fn(),
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/server/media-assets', () => ({
  TEMPORARY_CHAT_RETENTION_DAYS: vi.fn(),
  TEMPORARY_FILE_RETENTION_CLAIM: vi.fn(),
  TemporaryChatFilePurge: vi.fn(),
  deleteVideoMediaAsset: vi.fn(),
  getActiveWorkspaceMediaAssetById: vi.fn(),
  getMediaAssetByContentHash: vi.fn(),
  getMediaAssetById: vi.fn(),
  getMediaAssetByStoragePathname: vi.fn(),
  insertMediaAsset: vi.fn(),
  insertMediaAssetsAtomically: vi.fn(),
  isMediaAssetStoreReady: vi.fn(),
  latestConversationImageAssetId: vi.fn(),
  listLibraryAssets: vi.fn(),
  listMediaAssets: vi.fn(),
  permanentlyDeleteMediaAsset: vi.fn(),
  purgeTemporaryChatFiles: vi.fn(),
  restoreMediaAsset: vi.fn(),
  softDeleteMediaAsset: vi.fn(),
  upsertVideoMediaAsset: vi.fn(),
  saveTemporaryChatAssetToLibrary: mocks.saveTemporaryChatAssetToLibrary,
}));

import { createError } from '@/lib/errors';
import { POST } from '../route';

const ASSET = '99999999-9999-4999-8999-999999999999';
const db = { query: vi.fn() };

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/media/keep', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('/api/media/keep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: null });
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.requireCsrfToken.mockResolvedValue(null);
  });

  it('refuses a request that fails the CSRF check', async () => {
    mocks.requireCsrfToken.mockResolvedValue(NextResponse.json({ error: 'csrf' }, { status: 403 }));
    const response = await POST(request({ id: ASSET }));
    expect(response.status).toBe(403);
    expect(mocks.saveTemporaryChatAssetToLibrary).not.toHaveBeenCalled();
  });

  it('rejects a body that is not json', async () => {
    const response = await POST(request('{'));
    expect(response.status).toBe(400);
    expect(mocks.saveTemporaryChatAssetToLibrary).not.toHaveBeenCalled();
  });

  it('rejects an id that is not a uuid', async () => {
    const response = await POST(request({ id: 'asset-1' }));
    expect(response.status).toBe(400);
    expect(mocks.saveTemporaryChatAssetToLibrary).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated caller with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());
    const response = await POST(request({ id: ASSET }));
    expect(response.status).toBe(401);
    expect(mocks.saveTemporaryChatAssetToLibrary).not.toHaveBeenCalled();
  });

  it('answers 404 when the file is no longer temporary', async () => {
    mocks.saveTemporaryChatAssetToLibrary.mockResolvedValue(false);
    const response = await POST(request({ id: ASSET }));
    expect(response.status).toBe(404);
  });

  it('keeps the caller temporary file', async () => {
    mocks.saveTemporaryChatAssetToLibrary.mockResolvedValue(true);
    const response = await POST(request({ id: ASSET }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ kept: true });
    expect(mocks.saveTemporaryChatAssetToLibrary).toHaveBeenCalledWith('user-1', ASSET, db);
  });
});
