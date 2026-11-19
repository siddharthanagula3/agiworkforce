import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  presignUploadPart: vi.fn(),
  touchPartRequest: vi.fn(),
}));

vi.mock('@/lib/server/chat-file-intake/store', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  touchPartRequest: (...args: unknown[]) => mocks.touchPartRequest(...args),
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
vi.mock('@/lib/server/object-storage-runtime', () => ({
  objectStorageConfig: () => ({
    provider: 's3',
    endpoint: 'https://objects.example.test',
    region: 'auto',
    forcePathStyle: false,
    accessKeyId: 'access-key-id',
    secretAccessKey: 'secret-access-key',
    publicBucket: 'agi-public',
    privateBucket: 'agi-private',
    publicBaseUrl: 'https://assets.example.test',
    encryption: undefined,
  }),
  getObjectStore: () => ({
    createMultipartUpload: vi.fn(),
    uploadPart: vi.fn(),
    listUploadedParts: vi.fn(),
    completeMultipartUpload: vi.fn(),
    abortMultipartUpload: vi.fn(),
    listPendingMultipartUploads: vi.fn(),
    presignUploadPart: mocks.presignUploadPart,
  }),
}));

import { createError } from '@/lib/errors';
import { createSchemaAbsentDb } from '@/lib/server/chat-file-intake/__tests__/schema-absent-db';
import { issueResumableUploadSession } from '../../../resumable-upload';
import { POST } from '../route';

const UPLOAD_ID = 'mpu-1';
const MIB = 1024 * 1024;

async function session(overrides: Record<string, unknown> = {}): Promise<string> {
  const { token } = await issueResumableUploadSession({
    userId: 'user-1',
    organizationId: null,
    kind: 'chat-attachment',
    key: 'users/user-1/uploads/big.bin',
    uploadId: UPLOAD_ID,
    fileName: 'big.bin',
    mimeType: 'application/octet-stream',
    byteCount: 12 * MIB,
    partBytes: 5 * MIB,
    checksumSha256: 'a'.repeat(64),
    projectId: null,
    sourceSurface: null,
    ...overrides,
  } as Parameters<typeof issueResumableUploadSession>[0]);
  return token;
}

function request(body: unknown, origin = 'http://localhost:3000'): NextRequest {
  return new NextRequest(`${origin}/api/files/uploads/${UPLOAD_ID}/parts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': 'csrf-1' },
    body: JSON.stringify(body),
  });
}

function browserRequest(body: unknown, origin: string): NextRequest {
  return new NextRequest(`${origin}/api/files/uploads/${UPLOAD_ID}/parts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': 'csrf-1', origin },
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ uploadId: UPLOAD_ID }) };

describe('/api/files/uploads/[uploadId]/parts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VERCEL_ENV', '');
    mocks.getUserScopedDb.mockResolvedValue({ db: {}, userId: 'user-1', organizationId: null });
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.presignUploadPart.mockImplementation(
      async ({ partNumber }: { partNumber: number }) =>
        `https://objects.example.test/p${partNumber}`,
    );
    mocks.touchPartRequest.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('refuses an unauthenticated caller with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());
    const response = await POST(request({ session: await session(), partNumbers: [1] }), context);
    expect(response.status).toBe(401);
    expect(mocks.presignUploadPart).not.toHaveBeenCalled();
  });

  it('refuses a request that fails the CSRF check', async () => {
    mocks.requireCsrfToken.mockResolvedValue(NextResponse.json({ error: 'csrf' }, { status: 403 }));
    const response = await POST(request({ session: await session(), partNumbers: [1] }), context);
    expect(response.status).toBe(403);
    expect(mocks.presignUploadPart).not.toHaveBeenCalled();
  });

  it('rate limits per user', async () => {
    mocks.withRateLimit.mockResolvedValue(NextResponse.json({ error: 'slow' }, { status: 429 }));
    const response = await POST(request({ session: await session(), partNumbers: [1] }), context);
    expect(response.status).toBe(429);
    expect(mocks.withRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'uploads-presign',
      'user-1',
    );
  });

  it('rejects a body without part numbers', async () => {
    const response = await POST(request({ session: await session(), partNumbers: [] }), context);
    expect(response.status).toBe(400);
    expect(mocks.presignUploadPart).not.toHaveBeenCalled();
  });

  it('answers 404 for a session token that was not signed by this server', async () => {
    const response = await POST(request({ session: 'forged.token', partNumbers: [1] }), context);
    expect(response.status).toBe(404);
    expect(mocks.presignUploadPart).not.toHaveBeenCalled();
  });

  it('answers 404 for another user session', async () => {
    const response = await POST(
      request({ session: await session({ userId: 'user-2' }), partNumbers: [1] }),
      context,
    );
    expect(response.status).toBe(404);
    expect(mocks.presignUploadPart).not.toHaveBeenCalled();
  });

  it('rejects a part number beyond the upload', async () => {
    const response = await POST(request({ session: await session(), partNumbers: [4] }), context);
    expect(response.status).toBe(400);
    expect(mocks.presignUploadPart).not.toHaveBeenCalled();
  });

  it('presigns each distinct requested part with its exact length', async () => {
    const response = await POST(
      request({ session: await session(), partNumbers: [1, 3, 1] }),
      context,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      parts: [
        { partNumber: 1, url: 'https://objects.example.test/p1', method: 'PUT', headers: {} },
        { partNumber: 3, url: 'https://objects.example.test/p3', method: 'PUT', headers: {} },
      ],
    });
    expect(mocks.presignUploadPart).toHaveBeenCalledTimes(2);
    expect(mocks.presignUploadPart).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: 'agi-private',
        key: 'users/user-1/uploads/big.bin',
        uploadId: UPLOAD_ID,
        partNumber: 3,
        contentLength: 2 * MIB,
      }),
    );
  });

  it('relays through this origin when storage CORS does not cover the caller origin', async () => {
    const token = await session();
    const response = await POST(
      request({ session: token, partNumbers: [2] }, 'http://localhost:4000'),
      context,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      parts: Array<{ partNumber: number; url: string; headers: Record<string, string> }>;
    };
    expect(body.parts).toHaveLength(1);
    expect(body.parts[0]?.url.startsWith('http://localhost:4000/')).toBe(true);
    expect(new URL(body.parts[0]!.url).searchParams.get('partNumber')).toBe('2');
    expect(body.parts[0]?.headers).toEqual({ 'x-csrf-token': 'csrf-1' });
    expect(mocks.presignUploadPart).not.toHaveBeenCalled();
  });

  describe('a chat-large-file session', () => {
    const RELAY_ORIGIN = 'http://localhost:4000';

    function largeSession() {
      return session({
        kind: 'chat-large-file',
        key: 'chat-attachments/user-1/1_abc.csv',
        fileName: 'survey.csv',
        mimeType: 'text/csv',
        byteCount: 30 * MIB,
        partBytes: 5 * MIB,
        intakeId: '3f6a2c1e-9b8d-4e7f-a1b2-c3d4e5f60718',
      });
    }

    it('answers 409 from a relay origin, never a relay URL', async () => {
      const response = await POST(
        browserRequest({ session: await largeSession(), partNumbers: [1] }, RELAY_ORIGIN),
        context,
      );

      expect(response.status).toBe(409);
      const body = (await response.json()) as {
        error?: { details?: { code?: string } };
        parts?: unknown;
      };
      expect(body.error?.details?.code).toBe('large_file_needs_direct_upload');
      expect(body.parts).toBeUndefined();
      expect(mocks.presignUploadPart).not.toHaveBeenCalled();
      expect(mocks.touchPartRequest).not.toHaveBeenCalled();
    });

    it('presigns straight to storage from an origin the storage CORS rule lists', async () => {
      vi.stubEnv('UPLOAD_STORAGE_CORS_ORIGINS', RELAY_ORIGIN);

      const response = await POST(
        browserRequest({ session: await largeSession(), partNumbers: [1] }, RELAY_ORIGIN),
        context,
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        parts: [
          { partNumber: 1, url: 'https://objects.example.test/p1', method: 'PUT', headers: {} },
        ],
      });
      expect(mocks.touchPartRequest).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          userId: 'user-1',
          stagingKey: 'chat-attachments/user-1/1_abc.csv',
        }),
      );
    });

    it('presigns straight to storage for a native client that a small session would relay', async () => {
      const response = await POST(
        request({ session: await largeSession(), partNumbers: [1] }, RELAY_ORIGIN),
        context,
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        parts: [
          { partNumber: 1, url: 'https://objects.example.test/p1', method: 'PUT', headers: {} },
        ],
      });
      expect(mocks.touchPartRequest).toHaveBeenCalledTimes(1);
    });

    it('answers 404 when its intake is no longer awaiting parts', async () => {
      mocks.touchPartRequest.mockResolvedValue(false);

      const response = await POST(
        request({ session: await largeSession(), partNumbers: [1] }),
        context,
      );

      expect(response.status).toBe(404);
      expect(mocks.presignUploadPart).not.toHaveBeenCalled();
    });
  });

  it('signs a chat-attachment session on a database without the intake tables without naming them', async () => {
    const delegate = { query: vi.fn(async () => []) };
    mocks.getUserScopedDb.mockResolvedValue({
      db: createSchemaAbsentDb(delegate),
      userId: 'user-1',
      organizationId: null,
    });
    mocks.touchPartRequest.mockImplementation(async (db: { query: (sql: string) => unknown }) =>
      db.query('select 1 from public.chat_file_intakes'),
    );

    const response = await POST(request({ session: await session(), partNumbers: [1] }), context);

    expect(response.status).toBe(200);
    expect(mocks.touchPartRequest).not.toHaveBeenCalled();
    expect(delegate.query).not.toHaveBeenCalled();
  });
});
