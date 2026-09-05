import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn().mockReturnValue(null),
  getCorsHeaders: vi.fn().mockReturnValue({}),
  getSecurityHeaders: vi.fn().mockReturnValue({}),
  withCorsRoute:
    (handler: (...args: unknown[]) => Promise<Response>) =>
    (...args: unknown[]) =>
      handler(...args),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const mockGetClerkAuthUser = vi.fn();
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: (...args: unknown[]) => mockGetClerkAuthUser(...args),
}));

const mockGetSubscription = vi.fn();
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: (...args: unknown[]) => mockGetSubscription(...args) },
}));

vi.mock('@/lib/neon-db', () => ({ getServiceClient: vi.fn(() => ({})) }));

vi.mock('@/lib/error-handler', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/error-handler')>();
  return { withErrorHandler: actual.withErrorHandler, handleError: actual.handleError };
});

const storageMocks = vi.hoisted(() => ({
  configured: vi.fn(() => true),
  store: vi.fn(async () => ({ pathname: 'users/u/img.png', byteSize: 12 })),
  del: vi.fn(async () => undefined),
  url: vi.fn((id: string) => `/api/files/${id}`),
  read: vi.fn(),
}));
vi.mock('@/lib/server/media-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/media-storage')>()),
  isMediaStorageConfigured: storageMocks.configured,
  isImageStorageConfigured: storageMocks.configured,
  storeMedia: storageMocks.store,
  deleteStoredMedia: storageMocks.del,
  authenticatedMediaUrl: storageMocks.url,
  readStoredMedia: storageMocks.read,
}));

const assetMocks = vi.hoisted(() => ({
  insert: vi.fn(async (_params: { metadata?: { aiAct?: unknown } }) => 'asset-1'),
  insertMany: vi.fn(async (_params: Array<{ model?: string; metadata?: { aiAct?: unknown } }>) => [
    'asset-1',
  ]),
  byId: vi.fn(),
  ready: vi.fn(async () => true),
}));
vi.mock('@/lib/server/media-assets', () => ({
  insertMediaAsset: assetMocks.insert,
  insertMediaAssetsAtomically: assetMocks.insertMany,
  getActiveWorkspaceMediaAssetById: assetMocks.byId,
  isMediaAssetStoreReady: assetMocks.ready,
}));

const managedUsageMocks = vi.hoisted(() => ({
  reserve: vi.fn(),
  providerStarted: vi.fn(async () => undefined),
  finalize: vi.fn(async () => ({ requestStatus: 'completed', settlementStatus: 'succeeded' })),
  delivered: vi.fn(async () => undefined),
}));
const rlsMocks = vi.hoisted(() => ({ getUserScopedDb: vi.fn() }));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...args: unknown[]) => rlsMocks.getUserScopedDb(...args),
}));
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/managed-usage-request-service')>()),
  reserveManagedUsageRequest: managedUsageMocks.reserve,
  markManagedUsageProviderStarted: managedUsageMocks.providerStarted,
  finalizeManagedUsageRequest: managedUsageMocks.finalize,
  markManagedUsageClientDelivered: managedUsageMocks.delivered,
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

const PROVIDER_HOSTS = ['api.openai.com', 'generativelanguage.googleapis.com'];

function isProviderCall(call: unknown[]): boolean {
  const target = String(call[0]);
  return PROVIDER_HOSTS.some((host) => target.includes(host));
}

function providerCalls(): unknown[][] {
  return mockFetch.mock.calls.filter(isProviderCall);
}

function databaseResponse() {
  return { ok: true, json: async () => ({ command: 'SELECT', rowCount: 0, rows: [], fields: [] }) };
}

import { POST } from '@/app/api/media/image/generate/route';
import { GET as GET_FILE } from '@/app/api/files/[id]/route';
import {
  AI_GENERATED_HEADER,
  AI_GENERATED_PROVENANCE_HEADER,
  hasAiGeneratedProvenance,
} from '@/lib/compliance/ai-act';

const BASE_URL = 'http://localhost/api/media/image/generate';
const TEST_USER = { userId: 'user-test-id', email: 'test@example.com' };
const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const PRO_SUBSCRIPTION = { status: 'active', plan_tier: 'pro' };

const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function authedRequest(
  body: unknown,
  idempotencyKey = 'agi.media.web.image.operation-123',
): NextRequest {
  return new NextRequest(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer valid-test-token',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(body),
  });
}

describe('Article 50(2), generated image provenance', () => {
  let queuedProviderResponses: unknown[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClerkAuthUser.mockResolvedValue(TEST_USER);
    mockGetSubscription.mockResolvedValue(PRO_SUBSCRIPTION);
    rlsMocks.getUserScopedDb.mockResolvedValue({
      db: {},
      userId: TEST_USER.userId,
      organizationId: ORGANIZATION_ID,
    });
    managedUsageMocks.reserve.mockImplementation(async (input: Record<string, unknown>) => ({
      ...input,
      leaseToken: 'lease-image',
    }));
    storageMocks.configured.mockReturnValue(true);
    storageMocks.store.mockResolvedValue({ pathname: 'users/u/img.png', byteSize: 12 });
    assetMocks.insert.mockResolvedValue('asset-1');
    assetMocks.insertMany.mockResolvedValue(['asset-1']);

    process.env['OPENAI_API_KEY'] = 'sk-test-openai-key';
    delete process.env['GOOGLE_API_KEY'];

    queuedProviderResponses = [];
    mockFetch.mockImplementation(async (input: RequestInfo | URL) => {
      if (!isProviderCall([input])) return databaseResponse();
      return (
        queuedProviderResponses.shift() ?? {
          ok: true,
          json: async () => ({ data: [{ b64_json: PNG_B64 }] }),
        }
      );
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fails closed before reservation or provider egress when production storage is unavailable', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    storageMocks.configured.mockReturnValue(false);

    const response = await POST(authedRequest({ prompt: 'a cat' }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toMatchObject({
      type: 'server_error',
      code: 'media_storage_unavailable',
    });
    expect(managedUsageMocks.reserve).not.toHaveBeenCalled();
    expect(managedUsageMocks.providerStarted).not.toHaveBeenCalled();
    expect(managedUsageMocks.finalize).not.toHaveBeenCalled();
    // The scope is resolved once for the entitlement read, so the guarantee
    // here is that nothing is catalogued or reserved, not that no connection
    // was opened.
    expect(assetMocks.ready).not.toHaveBeenCalled();
    expect(assetMocks.insertMany).not.toHaveBeenCalled();
    expect(providerCalls()).toEqual([]);
  });

  it('returns a machine-readable claim for every generated image', async () => {
    const response = await POST(authedRequest({ prompt: 'a cat' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.provenance).toHaveLength(body.images.length);
    expect(hasAiGeneratedProvenance(body.provenance[0])).toBe(true);
    expect(body.provenance[0].kind).toBe('image');
    expect(body.provenance[0].provider).toBe('openai');
    expect(body.provenance[0].model).toBe(body.catalog_model);
  });

  it('binds the claim to the image bytes, not to their transport encoding', async () => {
    const response = await POST(authedRequest({ prompt: 'a cat' }));
    const body = await response.json();

    const expected = createHash('sha256').update(Buffer.from(PNG_B64, 'base64')).digest('hex');
    expect(body.provenance[0].content_hash_sha256).toBe(expected);
  });

  it('marks the response itself so a consumer that never parses the body detects it', async () => {
    const response = await POST(authedRequest({ prompt: 'a cat' }));

    expect(response.headers.get(AI_GENERATED_HEADER)).toBe('true');
  });

  it('writes the claim onto the asset row', async () => {
    const response = await POST(authedRequest({ prompt: 'a cat' }));
    const body = await response.json();

    expect(assetMocks.insertMany).toHaveBeenCalledTimes(1);
    const written = assetMocks.insertMany.mock.calls[0]?.[0]?.[0];
    expect(hasAiGeneratedProvenance(written?.metadata?.aiAct)).toBe(true);
    expect(written?.model).toBe(body.catalog_model);
    expect((written?.metadata?.aiAct as { model?: string } | undefined)?.model).toBe(
      body.catalog_model,
    );
  });

  it('loads an owned edit source through its private storage pathname', async () => {
    const sourceAssetId = '22222222-2222-4222-8222-222222222222';
    const sourcePathname =
      'private-media/image/0123456789abcdef0123456789abcdef/22222222-2222-4222-8222-222222222222.png';
    const sourceBytes = Buffer.from(PNG_B64, 'base64');
    assetMocks.byId.mockResolvedValue({
      id: sourceAssetId,
      userId: TEST_USER.userId,
      kind: 'image',
      mimeType: 'image/png',
      byteSize: sourceBytes.byteLength,
      storageUrl: sourcePathname,
      storagePathname: sourcePathname,
      metadata: {},
      deletedAt: null,
    });
    storageMocks.read.mockResolvedValue({ data: sourceBytes, contentType: 'image/png' });

    const response = await POST(
      authedRequest({
        prompt: 'make the background warmer',
        provider: 'openai',
        operation: 'edit',
        source_image: { asset_id: sourceAssetId },
      }),
    );

    expect(response.status).toBe(200);
    expect(assetMocks.byId).toHaveBeenCalledWith(
      TEST_USER.userId,
      sourceAssetId,
      expect.anything(),
    );
    expect(storageMocks.read).toHaveBeenCalledWith(sourcePathname);
    expect(providerCalls()).toHaveLength(1);
    expect(String(providerCalls()[0]?.[0])).toContain('api.openai.com');
  });

  it('rejects a non-image asset before reading private bytes or calling the provider', async () => {
    const sourceAssetId = '33333333-3333-4333-8333-333333333333';
    assetMocks.byId.mockResolvedValue({
      id: sourceAssetId,
      userId: TEST_USER.userId,
      kind: 'file',
      mimeType: 'application/pdf',
      byteSize: 12,
      storageUrl: 'private-media/file/owner/source.pdf',
      storagePathname: 'private-media/file/owner/source.pdf',
      metadata: {},
      deletedAt: null,
    });

    const response = await POST(
      authedRequest({
        prompt: 'edit this source',
        provider: 'openai',
        operation: 'edit',
        source_image: { asset_id: sourceAssetId },
      }),
    );

    expect(response.status).toBe(422);
    expect(storageMocks.read).not.toHaveBeenCalled();
    expect(providerCalls()).toEqual([]);
  });

  it('removes every staged sibling and refunds when a multi-image batch cannot persist', async () => {
    queuedProviderResponses.push({
      ok: true,
      json: async () => ({ data: [{ b64_json: PNG_B64 }, { b64_json: PNG_B64 }] }),
    });
    storageMocks.store
      .mockResolvedValueOnce({ pathname: 'users/u/first.png', byteSize: 12 })
      .mockRejectedValueOnce(new Error('second object write failed'));

    const response = await POST(authedRequest({ prompt: 'two cats', n: 2 }));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({ success: false, images: [], persisted: false });
    expect(assetMocks.insertMany).not.toHaveBeenCalled();
    expect(storageMocks.del).toHaveBeenCalledWith('users/u/first.png');
    expect(managedUsageMocks.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failed', actualCostCents: 0 }),
    );
  });

  it('rolls back all staged objects when the atomic media catalog transaction fails', async () => {
    queuedProviderResponses.push({
      ok: true,
      json: async () => ({ data: [{ b64_json: PNG_B64 }, { b64_json: PNG_B64 }] }),
    });
    storageMocks.store
      .mockResolvedValueOnce({ pathname: 'users/u/first.png', byteSize: 12 })
      .mockResolvedValueOnce({ pathname: 'users/u/second.png', byteSize: 12 });
    assetMocks.insertMany.mockRejectedValueOnce(new Error('catalog transaction rolled back'));

    const response = await POST(authedRequest({ prompt: 'two cats', n: 2 }));

    expect(response.status).toBe(502);
    expect(storageMocks.del).toHaveBeenCalledWith('users/u/first.png');
    expect(storageMocks.del).toHaveBeenCalledWith('users/u/second.png');
    expect(managedUsageMocks.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failed', actualCostCents: 0 }),
    );
  });

  it.each(['web', 'mobile', 'desktop'] as const)(
    'persists the %s source surface parsed from the managed-media identity',
    async (sourceSurface) => {
      await POST(
        authedRequest(
          { prompt: `a cat sent from ${sourceSurface}` },
          `agi.media.${sourceSurface}.image.operation-123`,
        ),
      );

      expect(assetMocks.insertMany).toHaveBeenCalledWith(
        [expect.objectContaining({ sourceSurface })],
        expect.anything(),
      );
    },
  );

  it('binds the claim to the bytes when the provider returns a URL instead of base64', async () => {
    mockFetch.mockImplementation(async (input: unknown) => {
      const url = typeof input === 'string' ? input : String((input as { url?: string }).url ?? '');
      if (url.includes('api.openai.com')) {
        return { ok: true, json: async () => ({ data: [{ url: 'https://cdn.test/img.png' }] }) };
      }
      return {
        ok: true,
        headers: new Headers({ 'content-type': 'image/png' }),
        arrayBuffer: async () => Uint8Array.from(Buffer.from(PNG_B64, 'base64')).buffer,
      };
    });

    const response = await POST(authedRequest({ prompt: 'a cat' }));
    const body = await response.json();

    const expected = createHash('sha256').update(Buffer.from(PNG_B64, 'base64')).digest('hex');
    expect(body.provenance[0].content_hash_sha256).toBe(expected);
    const written = assetMocks.insertMany.mock.calls[0]?.[0]?.[0];
    expect(
      (written?.metadata?.aiAct as { content_hash_sha256?: string })?.content_hash_sha256,
    ).toBe(expected);
  });

  it('marks images even when object storage is unconfigured and bytes stay inline', async () => {
    storageMocks.configured.mockReturnValue(false);

    const response = await POST(authedRequest({ prompt: 'a cat' }));
    const body = await response.json();

    expect(body.persisted).toBe(false);
    expect(hasAiGeneratedProvenance(body.provenance[0])).toBe(true);
  });
});

describe('Article 50(2), the mark survives to the download', () => {
  const ASSET_ID = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClerkAuthUser.mockResolvedValue(TEST_USER);
    rlsMocks.getUserScopedDb.mockResolvedValue({
      db: {},
      userId: TEST_USER.userId,
      organizationId: null,
    });
    storageMocks.configured.mockReturnValue(true);
    storageMocks.read.mockResolvedValue({
      data: Buffer.from(PNG_B64, 'base64'),
      contentType: 'image/png',
    });
  });

  function storedRow(metadata: Record<string, unknown>) {
    return {
      id: ASSET_ID,
      userId: TEST_USER.userId,
      kind: 'image',
      mimeType: 'image/png',
      byteSize: 12,
      storageUrl: 'users/u/img.png',
      storagePathname: 'users/u/img.png',
      metadata,
      deletedAt: null,
    };
  }

  function fileRequest() {
    return [
      new NextRequest(`http://localhost/api/files/${ASSET_ID}`),
      { params: Promise.resolve({ id: ASSET_ID }) },
    ] as const;
  }

  it('re-emits the claim the generation route persisted', async () => {
    mockGetSubscription.mockResolvedValue(PRO_SUBSCRIPTION);
    rlsMocks.getUserScopedDb.mockResolvedValue({
      db: {},
      userId: TEST_USER.userId,
      organizationId: ORGANIZATION_ID,
    });
    managedUsageMocks.reserve.mockImplementation(async (input: Record<string, unknown>) => ({
      ...input,
      leaseToken: 'lease-image',
    }));
    storageMocks.store.mockResolvedValue({ pathname: 'users/u/img.png', byteSize: 12 });
    assetMocks.insert.mockResolvedValue(ASSET_ID);
    assetMocks.insertMany.mockResolvedValue([ASSET_ID]);
    process.env['OPENAI_API_KEY'] = 'sk-test-openai-key';
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ b64_json: PNG_B64 }] }),
    });

    await POST(authedRequest({ prompt: 'a cat' }));
    expect(assetMocks.insertMany.mock.calls[0]?.[0]?.[0]).toMatchObject({
      organizationId: ORGANIZATION_ID,
    });
    const persisted = assetMocks.insertMany.mock.calls[0]?.[0]?.[0]?.metadata as Record<
      string,
      unknown
    >;
    assetMocks.byId.mockResolvedValue(storedRow(persisted));

    const response = await GET_FILE(...fileRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get(AI_GENERATED_HEADER)).toBe('true');
    const header = response.headers.get(AI_GENERATED_PROVENANCE_HEADER);
    expect(header).toBeTruthy();
    expect(hasAiGeneratedProvenance(JSON.parse(header as string))).toBe(true);
  });

  it('serves no marker for an asset that carries no claim', async () => {
    assetMocks.byId.mockResolvedValue(storedRow({ filename: 'notes.png' }));

    const response = await GET_FILE(...fileRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get(AI_GENERATED_HEADER)).toBeNull();
    expect(response.headers.get(AI_GENERATED_PROVENANCE_HEADER)).toBeNull();
  });

  it('serves no marker when the stored claim is malformed', async () => {
    assetMocks.byId.mockResolvedValue(storedRow({ aiAct: { version: 1, model: 'x' } }));

    const response = await GET_FILE(...fileRequest());

    expect(response.headers.get(AI_GENERATED_HEADER)).toBeNull();
  });
});
