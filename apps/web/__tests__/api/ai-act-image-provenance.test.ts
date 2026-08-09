import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';

/**
 * EU AI Act Article 50(2) — synthetic image output must be "marked in a
 * machine-readable format and detectable as artificially generated".
 *
 * The mark has to be produced by the route, not by the client: the bytes leave
 * the product through the Library, a download or a share link, none of which
 * replays client-side React state. So these tests assert on the HTTP response
 * and on what is written to `media_assets`.
 */

vi.mock('server-only', () => ({}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn().mockReturnValue(null),
  getCorsHeaders: vi.fn().mockReturnValue({}),
  getSecurityHeaders: vi.fn().mockReturnValue({}),
  // `/api/files/[id]` wraps its handler in this; the real one only copies CORS
  // headers onto the response, which the two mocks above already stub out.
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
  storeMedia: storageMocks.store,
  deleteStoredMedia: storageMocks.del,
  authenticatedMediaUrl: storageMocks.url,
  readStoredMedia: storageMocks.read,
}));

const assetMocks = vi.hoisted(() => ({
  insert: vi.fn(async (_params: { metadata?: { aiAct?: unknown } }) => 'asset-1'),
  byId: vi.fn(),
}));
vi.mock('@/lib/server/media-assets', () => ({
  insertMediaAsset: assetMocks.insert,
  getMediaAssetById: assetMocks.byId,
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

import { POST } from '@/app/api/media/image/generate/route';
import { GET as GET_FILE } from '@/app/api/files/[id]/route';
import {
  AI_GENERATED_HEADER,
  AI_GENERATED_PROVENANCE_HEADER,
  hasAiGeneratedProvenance,
} from '@/lib/compliance/ai-act';

const BASE_URL = 'http://localhost/api/media/image/generate';
const TEST_USER = { userId: 'user-test-id', email: 'test@example.com' };
const PRO_SUBSCRIPTION = { status: 'active', plan_tier: 'pro' };

/** 1x1 transparent PNG, so the hash assertion is over real image bytes. */
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function authedRequest(body: unknown): NextRequest {
  return new NextRequest(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer valid-test-token',
      'Idempotency-Key': 'agi.media.web.image.operation-123',
    },
    body: JSON.stringify(body),
  });
}

describe('Article 50(2) — generated image provenance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClerkAuthUser.mockResolvedValue(TEST_USER);
    mockGetSubscription.mockResolvedValue(PRO_SUBSCRIPTION);
    rlsMocks.getUserScopedDb.mockResolvedValue({ db: {}, userId: TEST_USER.userId });
    managedUsageMocks.reserve.mockImplementation(async (input: Record<string, unknown>) => ({
      ...input,
      leaseToken: 'lease-image',
    }));
    storageMocks.configured.mockReturnValue(true);
    storageMocks.store.mockResolvedValue({ pathname: 'users/u/img.png', byteSize: 12 });
    assetMocks.insert.mockResolvedValue('asset-1');

    process.env['OPENAI_API_KEY'] = 'sk-test-openai-key';
    delete process.env['GOOGLE_API_KEY'];
    delete process.env['STABILITY_API_KEY'];

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ b64_json: PNG_B64 }] }),
    });
  });

  it('returns a machine-readable claim for every generated image', async () => {
    const response = await POST(authedRequest({ prompt: 'a cat' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.provenance).toHaveLength(body.images.length);
    expect(hasAiGeneratedProvenance(body.provenance[0])).toBe(true);
    expect(body.provenance[0].kind).toBe('image');
    expect(body.provenance[0].provider).toBe('openai');
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
    await POST(authedRequest({ prompt: 'a cat' }));

    expect(assetMocks.insert).toHaveBeenCalledTimes(1);
    const written = assetMocks.insert.mock.calls[0]?.[0];
    expect(hasAiGeneratedProvenance(written?.metadata?.aiAct)).toBe(true);
  });

  it('binds the claim to the bytes when the provider returns a URL instead of base64', async () => {
    // OpenAI's response shape is either `b64_json` or `url`; the url shape only
    // materialises its bytes inside the persistence branch, and an empty
    // content hash there would leave the artefact marked but unbound.
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
    const written = assetMocks.insert.mock.calls[0]?.[0];
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

/**
 * The generation response is ephemeral. `/api/files/[id]` is how the bytes
 * actually leave the product — it is the URL the generation route hands back
 * (`authenticatedMediaUrl`), what the chat image renderer loads, and what a
 * download hits — so the mark is only real if it survives the round trip
 * through `media_assets.metadata` and comes back out on that response.
 */
describe('Article 50(2) — the mark survives to the download', () => {
  const ASSET_ID = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClerkAuthUser.mockResolvedValue(TEST_USER);
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
    // Round trip: generate, take the exact metadata blob handed to
    // insertMediaAsset, hand it back as the stored row.
    mockGetSubscription.mockResolvedValue(PRO_SUBSCRIPTION);
    rlsMocks.getUserScopedDb.mockResolvedValue({ db: {}, userId: TEST_USER.userId });
    managedUsageMocks.reserve.mockImplementation(async (input: Record<string, unknown>) => ({
      ...input,
      leaseToken: 'lease-image',
    }));
    storageMocks.store.mockResolvedValue({ pathname: 'users/u/img.png', byteSize: 12 });
    assetMocks.insert.mockResolvedValue(ASSET_ID);
    process.env['OPENAI_API_KEY'] = 'sk-test-openai-key';
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ b64_json: PNG_B64 }] }),
    });

    await POST(authedRequest({ prompt: 'a cat' }));
    const persisted = assetMocks.insert.mock.calls[0]?.[0]?.metadata as Record<string, unknown>;
    assetMocks.byId.mockResolvedValue(storedRow(persisted));

    const response = await GET_FILE(...fileRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get(AI_GENERATED_HEADER)).toBe('true');
    const header = response.headers.get(AI_GENERATED_PROVENANCE_HEADER);
    expect(header).toBeTruthy();
    expect(hasAiGeneratedProvenance(JSON.parse(header as string))).toBe(true);
  });

  it('serves no marker for an asset that carries no claim', async () => {
    // Uploads share this route. Marking them would be a false claim, so the
    // absent-claim path must stay silent rather than default to "true".
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
