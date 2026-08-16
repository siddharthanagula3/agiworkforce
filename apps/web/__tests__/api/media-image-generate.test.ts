import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const imageRouteFixtures = vi.hoisted(() => ({
  liveGeminiModelId: '',
  liveGeminiApiModelId: '',
  liveGeminiCostCents: 0,
  openAiModelId: '',
  openAiApiModelId: '',
  imagenModelId: 'fixture-image-model-standard',
  imagenApiModelId: 'fixture-image-wire-standard',
  fastImagenModelId: 'fixture-image-model-economy',
  fastImagenApiModelId: 'fixture-image-wire-economy',
  unavailableModelId: 'fixture-image-model-unavailable',
  deprecatedModelId: 'fixture-image-model-deprecated',
}));
const VALID_JPEG_BASE64 =
  '/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKpAB//Z';

vi.mock('server-only', () => ({}));

const mediaPersistenceMocks = vi.hoisted(() => ({
  storageConfigured: vi.fn(() => false),
  storeMedia: vi.fn(),
  deleteStoredMedia: vi.fn(async () => undefined),
}));

vi.mock('@/lib/server/media-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/media-storage')>()),
  isImageStorageConfigured: mediaPersistenceMocks.storageConfigured,
  storeMedia: mediaPersistenceMocks.storeMedia,
  deleteStoredMedia: mediaPersistenceMocks.deleteStoredMedia,
}));

vi.mock('@agiworkforce/types', async () => {
  const actual = await vi.importActual<typeof import('@agiworkforce/types')>('@agiworkforce/types');
  const liveGeminiImageModel = actual
    .getModels({ modelTypes: ['image'], requireCapabilities: { imageGen: true } })
    .find(
      (model) =>
        model.provider === 'google' && model.imageApi === 'gemini' && actual.isModelLive(model),
    );
  if (!liveGeminiImageModel) throw new Error('Canonical Gemini image model fixture is missing');
  const liveOpenAiImageModel = actual
    .getModels({ modelTypes: ['image'], requireCapabilities: { imageGen: true } })
    .find((model) => model.provider === 'openai' && actual.isExecutableImageModel(model));
  if (!liveOpenAiImageModel) throw new Error('Canonical OpenAI image model fixture is missing');
  imageRouteFixtures.liveGeminiModelId = liveGeminiImageModel.id;
  imageRouteFixtures.liveGeminiApiModelId =
    liveGeminiImageModel.apiModelId ?? liveGeminiImageModel.id;
  imageRouteFixtures.liveGeminiCostCents = Math.ceil(
    (liveGeminiImageModel.imagePerImageCost ?? 0) * 100,
  );
  imageRouteFixtures.openAiModelId = liveOpenAiImageModel.id;
  imageRouteFixtures.openAiApiModelId = liveOpenAiImageModel.apiModelId ?? liveOpenAiImageModel.id;
  const syntheticGoogleImageModels = [
    liveGeminiImageModel,
    {
      id: imageRouteFixtures.imagenModelId,
      apiModelId: imageRouteFixtures.imagenApiModelId,
      imageApi: 'imagen',
      name: 'Synthetic standard image fixture',
      provider: 'google',
      modelType: 'image',
      imagePerImageCost: 0.04,
      capabilities: { imageGen: true },
    },
    {
      id: imageRouteFixtures.fastImagenModelId,
      apiModelId: imageRouteFixtures.fastImagenApiModelId,
      imageApi: 'imagen',
      name: 'Synthetic economy image fixture',
      provider: 'google',
      modelType: 'image',
      imagePerImageCost: 0.02,
      capabilities: { imageGen: true },
    },
    {
      id: imageRouteFixtures.unavailableModelId,
      apiModelId: 'fixture-image-wire-unavailable',
      imageApi: 'gemini',
      name: 'Synthetic unavailable image fixture',
      provider: 'google',
      modelType: 'image',
      imagePerImageCost: 0.03,
      capabilities: { imageGen: true },
      availability: 'unavailable',
    },
    {
      id: imageRouteFixtures.deprecatedModelId,
      apiModelId: 'fixture-image-wire-deprecated',
      imageApi: 'imagen',
      name: 'Synthetic deprecated image fixture',
      provider: 'google',
      modelType: 'image',
      imagePerImageCost: 0.03,
      capabilities: { imageGen: true },
      deprecated: true,
      status: 'deprecated',
    },
  ];
  return {
    ...actual,
    getRoutingSlotModel: vi.fn((slot: any) => {
      if (slot === 'image_generation') return imageRouteFixtures.openAiModelId;
      return actual.getRoutingSlotModel(slot);
    }),
    getModelsForProvider: vi.fn((provider: any, options?: any) => {
      if (provider === 'google') {
        return syntheticGoogleImageModels;
      }
      return actual.getModelsForProvider(provider, options);
    }),
    getModelMetadataById: vi.fn((id: string) => {
      const synthetic = syntheticGoogleImageModels.find(
        (model) => model.id === id || model.apiModelId === id,
      );
      if (synthetic) return synthetic;
      return actual.getModelMetadataById(id);
    }),
  };
});

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn().mockReturnValue(null),
  getCorsHeaders: vi.fn().mockReturnValue({}),
  getSecurityHeaders: vi.fn().mockReturnValue({}),
}));

const mockGetClerkAuthUser = vi.fn();

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: (...args: unknown[]) => mockGetClerkAuthUser(...args),
}));

vi.mock('@/lib/neon-db', () => ({
  getServiceClient: vi.fn(() => ({})),
}));

const mockGetSubscription = vi.fn();

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    getSubscription: (...args: unknown[]) => mockGetSubscription(...args),
  },
}));

vi.mock('@/lib/errors', async () => {
  const actual = await vi.importActual<typeof import('@/lib/errors')>('@/lib/errors');
  return {
    createError: actual.createError,
    AppError: actual.AppError,
    isAppError: actual.isAppError,
  };
});

vi.mock('@/lib/error-handler', async () => {
  const actual = await vi.importActual<typeof import('@/lib/error-handler')>('@/lib/error-handler');
  return { withErrorHandler: actual.withErrorHandler, handleError: actual.handleError };
});

const mockCheckAvailable = vi.fn();
const mockGetBalance = vi.fn();
const mockDeductCredits = vi.fn();
const mockSettleCreditsDurably = vi.fn();
const mockGenerateIdempotencyKey = vi.fn();

vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    checkAvailable: (...args: unknown[]) => mockCheckAvailable(...args),
    getBalance: (...args: unknown[]) => mockGetBalance(...args),
    deductCredits: (...args: unknown[]) => mockDeductCredits(...args),
    settleCreditsDurably: (...args: unknown[]) => mockSettleCreditsDurably(...args),
    generateIdempotencyKey: (...args: unknown[]) => mockGenerateIdempotencyKey(...args),
  },
}));

const managedUsageMocks = vi.hoisted(() => ({
  reserve: vi.fn(),
  providerStarted: vi.fn(async () => undefined),
  finalize: vi.fn(async () => ({
    requestStatus: 'completed',
    operationResult: 'finalized',
    settlementStatus: 'succeeded',
    actualCostCents: 5,
  })),
  delivered: vi.fn(async () => undefined),
}));
const rlsMocks = vi.hoisted(() => ({ getUserScopedDb: vi.fn() }));
const mediaAssetReadinessMocks = vi.hoisted(() => ({
  ready: vi.fn(async () => true),
  insertAtomically: vi.fn(),
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...args: unknown[]) => rlsMocks.getUserScopedDb(...args),
}));
vi.mock('@/lib/server/media-assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/media-assets')>()),
  isMediaAssetStoreReady: mediaAssetReadinessMocks.ready,
  insertMediaAssetsAtomically: mediaAssetReadinessMocks.insertAtomically,
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

import { POST, OPTIONS } from '@/app/api/media/image/generate/route';
import { ManagedUsageRequestError } from '@/lib/services/managed-usage-request-service';

const BASE_URL = 'http://localhost/api/media/image/generate';

function makeRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function makeAuthedRequest(body: unknown, extraHeaders: Record<string, string> = {}): NextRequest {
  return makeRequest(body, {
    Authorization: 'Bearer valid-test-token',
    'Idempotency-Key': 'agi.media.web.image.operation-123',
    ...extraHeaders,
  });
}

const PRO_SUBSCRIPTION = {
  id: 'sub_test_123',
  user_id: 'user-test-id',
  status: 'active',
  plan_tier: 'pro',
  current_period_start: new Date('2026-01-01'),
  current_period_end: new Date('2026-02-01'),
  stripe_subscription_id: 'stripe_sub_test',
};

const TEST_USER = { userId: 'user-test-id', email: 'test@example.com' };

describe('POST /api/media/image/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetClerkAuthUser.mockResolvedValue(TEST_USER);
    mockGetSubscription.mockResolvedValue(PRO_SUBSCRIPTION);

    mockCheckAvailable.mockResolvedValue(true);
    mockGetBalance.mockResolvedValue({ credits_remaining_cents: 10000 });
    mockDeductCredits.mockResolvedValue({ success: true });
    mockSettleCreditsDurably.mockResolvedValue({
      status: 'succeeded',
      success: true,
      attempt_count: 1,
    });
    mockGenerateIdempotencyKey.mockReturnValue('test-idempotency-key');
    rlsMocks.getUserScopedDb.mockResolvedValue({
      db: {},
      userId: TEST_USER.userId,
      organizationId: null,
    });
    mediaAssetReadinessMocks.ready.mockResolvedValue(true);
    mediaAssetReadinessMocks.insertAtomically.mockResolvedValue([]);
    mediaPersistenceMocks.storageConfigured.mockReturnValue(false);
    mediaPersistenceMocks.storeMedia.mockResolvedValue({
      url: 'https://media.example.com/generated.png',
      pathname: 'media/image/user-test-id/generated.png',
      byteSize: 1,
      contentType: 'image/jpeg',
    });
    managedUsageMocks.reserve.mockImplementation(async (input) => ({
      db: input.db,
      userId: input.userId,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      leaseToken: 'lease-image',
      estimatedCostCents: input.estimatedCostCents,
    }));

    process.env['OPENAI_API_KEY'] = 'sk-test-openai-key';
    delete process.env['GOOGLE_API_KEY'];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('OPTIONS', () => {
    it('should return 204 for preflight when no CORS handler intercepts', async () => {
      const { handleCorsPreflightRequest } = await import('@/lib/cors');
      vi.mocked(handleCorsPreflightRequest).mockReturnValueOnce(null);

      const request = new NextRequest(BASE_URL, { method: 'OPTIONS' });
      const response = await OPTIONS(request);

      expect(response.status).toBe(204);
    });
  });

  describe('Authentication', () => {
    it('should return 401 when authorization header is missing', async () => {
      const { createError } = await import('@/lib/errors');
      mockGetClerkAuthUser.mockRejectedValueOnce(createError.unauthorized());

      const request = makeRequest({ prompt: 'a cat' });

      const response = await POST(request);

      expect(response.status).toBe(401);
    });

    it('should return 401 when authorization header is malformed (no Bearer prefix)', async () => {
      const { createError } = await import('@/lib/errors');
      mockGetClerkAuthUser.mockRejectedValueOnce(createError.unauthorized());

      const request = makeRequest({ prompt: 'a cat' }, { Authorization: 'Token abc123' });

      const response = await POST(request);

      expect(response.status).toBe(401);
    });

    it('should return 401 when Clerk token is invalid', async () => {
      const { createError } = await import('@/lib/errors');
      mockGetClerkAuthUser.mockRejectedValueOnce(createError.unauthorized('Invalid token'));

      const response = await POST(makeAuthedRequest({ prompt: 'a cat' }));

      expect(response.status).toBe(401);
    });

    it('should return 401 when Clerk returns no userId', async () => {
      const { createError } = await import('@/lib/errors');
      mockGetClerkAuthUser.mockRejectedValueOnce(createError.unauthorized());

      const response = await POST(makeAuthedRequest({ prompt: 'a cat' }));

      expect(response.status).toBe(401);
    });
  });

  describe('CSRF protection', () => {
    it('should return 403 when CSRF token is missing or invalid', async () => {
      const { requireCsrfToken } = await import('@/lib/csrf');
      vi.mocked(requireCsrfToken).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: 'Invalid or missing CSRF token',
            code: 'CSRF_VALIDATION_FAILED',
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const response = await POST(makeAuthedRequest({ prompt: 'a cat' }));

      expect(response.status).toBe(403);
    });
  });

  describe('Rate limiting', () => {
    it('should return 429 when rate limited', async () => {
      const { withRateLimit } = await import('@/lib/rate-limit');
      const { NextResponse } = await import('next/server');

      vi.mocked(withRateLimit).mockResolvedValueOnce(
        NextResponse.json(
          { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded' } },
          { status: 429 },
        ),
      );

      const response = await POST(makeAuthedRequest({ prompt: 'a cat' }));
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should pass rate limit key "image-generation" to withRateLimit', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ url: 'https://example.com/image.png' }] }),
      });

      const { withRateLimit } = await import('@/lib/rate-limit');
      await POST(makeAuthedRequest({ prompt: 'a cat' }));

      expect(withRateLimit).toHaveBeenCalledWith(expect.any(NextRequest), 'image-generation');
    });
  });

  describe('Durable media catalog admission', () => {
    it('fails before reservation or provider work when the deployed media schema is partial', async () => {
      mediaAssetReadinessMocks.ready.mockResolvedValueOnce(false);

      const response = await POST(makeAuthedRequest({ prompt: 'a catalog-safe image' }));
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toMatchObject({ code: 'media_catalog_unavailable' });
      expect(managedUsageMocks.reserve).not.toHaveBeenCalled();
      expect(managedUsageMocks.providerStarted).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects unowned conversation provenance before reservation or provider work', async () => {
      const conversationId = '0190a000-0000-7000-8000-000000000091';
      const scopedQuery = vi.fn().mockResolvedValue([]);
      rlsMocks.getUserScopedDb.mockResolvedValueOnce({
        db: { query: scopedQuery },
        userId: TEST_USER.userId,
        organizationId: null,
      });

      const response = await POST(
        makeAuthedRequest({ prompt: 'an owner-scoped image', conversation_id: conversationId }),
      );
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toMatchObject({ code: 'conversation_not_found' });
      expect(scopedQuery).toHaveBeenCalledWith(
        expect.stringContaining('from public.web_conversations'),
        [conversationId, TEST_USER.userId],
      );
      expect(managedUsageMocks.reserve).not.toHaveBeenCalled();
      expect(managedUsageMocks.providerStarted).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Subscription checks', () => {
    it('should return 403 when user has no subscription', async () => {
      mockGetSubscription.mockResolvedValue(null);

      const response = await POST(makeAuthedRequest({ prompt: 'a cat' }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error.code).toBe('subscription_required');
    });

    it('should return 403 when subscription status is past_due', async () => {
      mockGetSubscription.mockResolvedValue({ ...PRO_SUBSCRIPTION, status: 'past_due' });

      const response = await POST(makeAuthedRequest({ prompt: 'a cat' }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error.code).toBe('subscription_inactive');
    });

    it('should return 403 when subscription status is canceled', async () => {
      mockGetSubscription.mockResolvedValue({ ...PRO_SUBSCRIPTION, status: 'canceled' });

      const response = await POST(makeAuthedRequest({ prompt: 'a cat' }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error.code).toBe('subscription_inactive');
    });

    it('should return 403 when plan tier is free (below pro)', async () => {
      mockGetSubscription.mockResolvedValue({ ...PRO_SUBSCRIPTION, plan_tier: 'free' });

      const response = await POST(makeAuthedRequest({ prompt: 'a cat' }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error.code).toBe('plan_upgrade_required');
      expect(data.error.required_plans).toContain('pro');
    });

    it('should return 403 when plan tier is hobby', async () => {
      mockGetSubscription.mockResolvedValue({ ...PRO_SUBSCRIPTION, plan_tier: 'hobby' });

      const response = await POST(makeAuthedRequest({ prompt: 'a cat' }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error.code).toBe('plan_upgrade_required');
    });

    it('should allow trialing subscription status', async () => {
      mockGetSubscription.mockResolvedValue({ ...PRO_SUBSCRIPTION, status: 'trialing' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ url: 'https://example.com/image.png' }] }),
      });

      const response = await POST(makeAuthedRequest({ prompt: 'a cat' }));

      expect(response.status).toBe(200);
    });

    it('should allow max tier subscription', async () => {
      mockGetSubscription.mockResolvedValue({ ...PRO_SUBSCRIPTION, plan_tier: 'max' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ url: 'https://example.com/image.png' }] }),
      });

      const response = await POST(makeAuthedRequest({ prompt: 'a cat' }));

      expect(response.status).toBe(200);
    });

    it('should allow max 15x tier subscription', async () => {
      mockGetSubscription.mockResolvedValue({ ...PRO_SUBSCRIPTION, plan_tier: 'max_15x' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ url: 'https://example.com/image.png' }] }),
      });

      const response = await POST(makeAuthedRequest({ prompt: 'a cat' }));

      expect(response.status).toBe(200);
    });
  });

  describe('Request validation', () => {
    it('should return 400 for invalid JSON body', async () => {
      const request = new NextRequest(BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-test-token',
        },
        body: 'not json {{',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.message).toContain('JSON');
    });

    it('should return 400 when prompt is missing', async () => {
      const response = await POST(makeAuthedRequest({ size: '1024x1024' }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.type).toBe('invalid_request_error');
    });

    it('should return 400 when prompt is empty string', async () => {
      const response = await POST(makeAuthedRequest({ prompt: '' }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.type).toBe('invalid_request_error');
    });

    it('should return 400 when prompt exceeds 4000 characters', async () => {
      const response = await POST(makeAuthedRequest({ prompt: 'x'.repeat(4001) }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.type).toBe('invalid_request_error');
    });

    it('should return 400 when n is greater than 4', async () => {
      const response = await POST(makeAuthedRequest({ prompt: 'a cat', n: 5 }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.type).toBe('invalid_request_error');
    });

    it('should return 400 when provider is unavailable', async () => {
      const response = await POST(makeAuthedRequest({ prompt: 'a cat', provider: 'google' }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('provider_unavailable');
    });

    it('accepts free-form style direction used by cross-surface clients', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ url: 'https://example.com/styled.png' }] }),
      });

      const response = await POST(
        makeAuthedRequest({
          prompt: 'a product photo',
          provider: 'openai',
          style: 'photorealistic',
        }),
      );

      expect(response.status).toBe(200);
    });

    it('rejects unknown client fields instead of silently stripping contract drift', async () => {
      const response = await POST(
        makeAuthedRequest({ prompt: 'a cat', provider: 'openai', plan: 'enterprise' }),
      );

      expect(response.status).toBe(400);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it.each([imageRouteFixtures.unavailableModelId, imageRouteFixtures.deprecatedModelId])(
      'rejects non-live catalog image model %s before billing or provider work',
      async (model) => {
        process.env['GOOGLE_API_KEY'] = 'test-google-key';

        const response = await POST(makeAuthedRequest({ prompt: 'a cat', model }));
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error.code).toBe('model_unavailable');
        expect(managedUsageMocks.reserve).not.toHaveBeenCalled();
        expect(mockFetch).not.toHaveBeenCalled();
      },
    );
  });

  describe('Managed usage lifecycle', () => {
    it('requires a stable idempotency identity before provider work', async () => {
      const response = await POST(
        makeRequest(
          { prompt: 'a cat', provider: 'openai' },
          { Authorization: 'Bearer valid-test-token' },
        ),
      );

      expect(response.status).toBe(400);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(managedUsageMocks.reserve).not.toHaveBeenCalled();
    });

    it('rejects a video operation identity before reserving or calling the image provider', async () => {
      const response = await POST(
        makeAuthedRequest(
          { prompt: 'a cat', provider: 'openai' },
          { 'Idempotency-Key': 'agi.media.web.video.operation-123' },
        ),
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toMatchObject({
        type: 'invalid_request_error',
        code: 'invalid_media_idempotency_key',
      });
      expect(managedUsageMocks.reserve).not.toHaveBeenCalled();
      expect(managedUsageMocks.providerStarted).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('uses the canonical reservation lifecycle and settles returned images at actual cost', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ url: 'https://example.com/image.png' }] }),
      });

      const response = await POST(makeAuthedRequest({ prompt: 'a cat', provider: 'openai', n: 1 }));

      expect(response.status).toBe(200);
      expect(managedUsageMocks.reserve).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: TEST_USER.userId,
          idempotencyKey: 'agi.media.web.image.operation-123',
          provider: 'openai',
          estimatedCostCents: 5,
          planTier: 'pro',
          isFlagship: false,
        }),
      );
      expect(managedUsageMocks.providerStarted).toHaveBeenCalledTimes(1);
      expect(managedUsageMocks.finalize).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'completed',
          actualCostCents: 5,
          usage: expect.objectContaining({ operation: 'image', outputCount: 1 }),
        }),
      );
      expect(managedUsageMocks.delivered).toHaveBeenCalledTimes(1);
      expect(mockCheckAvailable).not.toHaveBeenCalled();
      expect(mockDeductCredits).not.toHaveBeenCalled();
      expect(mockSettleCreditsDurably).not.toHaveBeenCalled();
      expect(managedUsageMocks.reserve.mock.invocationCallOrder[0]).toBeLessThan(
        managedUsageMocks.providerStarted.mock.invocationCallOrder[0]!,
      );
      expect(managedUsageMocks.providerStarted.mock.invocationCallOrder[0]).toBeLessThan(
        mockFetch.mock.invocationCallOrder[0]!,
      );
    });

    it('returns a safe quota error when the atomic reservation is declined', async () => {
      managedUsageMocks.reserve.mockRejectedValueOnce(
        new ManagedUsageRequestError(
          'Usage budget exhausted for this billing period.',
          402,
          'insufficient_credits',
        ),
      );

      const response = await POST(makeAuthedRequest({ prompt: 'a cat', provider: 'openai' }));
      const data = await response.json();

      expect(response.status).toBe(402);
      expect(data.error).toMatchObject({
        type: 'insufficient_quota',
        code: 'insufficient_credits',
      });
      expect(mockFetch).not.toHaveBeenCalled();
      expect(data.error).not.toHaveProperty('remaining_cents');
    });

    it('settles failed provider work at zero actual cost', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Provider connection refused'));

      const response = await POST(makeAuthedRequest({ prompt: 'a storm', provider: 'openai' }));

      expect(response.status).toBe(422);
      expect(managedUsageMocks.finalize).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'failed', actualCostCents: 0 }),
      );
      expect(managedUsageMocks.delivered).not.toHaveBeenCalled();
    });

    it('treats a provider response with zero usable images as failed work', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

      const response = await POST(
        makeAuthedRequest({ prompt: 'an empty provider response', provider: 'openai' }),
      );
      const data = await response.json();

      expect(response.status).toBe(422);
      expect(data).toMatchObject({ success: false, images: [] });
      expect(managedUsageMocks.finalize).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'failed', actualCostCents: 0 }),
      );
      expect(managedUsageMocks.delivered).not.toHaveBeenCalled();
    });
  });

  describe('Provider configuration', () => {
    it('should return 500 when no provider API keys are set', async () => {
      delete process.env['OPENAI_API_KEY'];
      delete process.env['GOOGLE_API_KEY'];

      const response = await POST(makeAuthedRequest({ prompt: 'a cat' }));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error.code).toBe('no_providers');
    });
  });

  describe('Success — OpenAI provider', () => {
    it('persists with the admitted organization after an async workspace switch', async () => {
      const admittedOrganizationId = '11111111-1111-4111-8111-111111111111';
      const laterOrganizationId = '22222222-2222-4222-8222-222222222222';
      const assetId = '33333333-3333-4333-8333-333333333333';
      rlsMocks.getUserScopedDb.mockResolvedValueOnce({
        db: {},
        userId: TEST_USER.userId,
        organizationId: admittedOrganizationId,
      });
      mediaPersistenceMocks.storageConfigured.mockReturnValue(true);
      mediaPersistenceMocks.storeMedia.mockResolvedValue({
        url: 'https://media.example.com/generated.jpg',
        pathname: 'media/image/user-test-id/generated.jpg',
        byteSize: Buffer.from(VALID_JPEG_BASE64, 'base64').byteLength,
        contentType: 'image/jpeg',
      });
      mediaAssetReadinessMocks.insertAtomically.mockResolvedValue([assetId]);
      mockFetch.mockImplementationOnce(async () => {
        rlsMocks.getUserScopedDb.mockResolvedValue({
          db: {},
          userId: TEST_USER.userId,
          organizationId: laterOrganizationId,
        });
        return {
          ok: true,
          json: async () => ({ data: [{ b64_json: VALID_JPEG_BASE64 }] }),
        };
      });

      const response = await POST(
        makeAuthedRequest({ prompt: 'an admitted workspace image', provider: 'openai' }),
      );

      expect(response.status).toBe(200);
      expect(rlsMocks.getUserScopedDb).toHaveBeenCalledOnce();
      expect(mediaAssetReadinessMocks.insertAtomically).toHaveBeenCalledWith([
        expect.objectContaining({
          userId: TEST_USER.userId,
          organizationId: admittedOrganizationId,
        }),
      ]);
      expect(await response.json()).toMatchObject({
        images: [{ url: `/api/files/${assetId}` }],
      });
    });

    it('should return 200 with generated image url', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ url: 'https://example.com/generated-image.png' }],
        }),
      });

      const response = await POST(
        makeAuthedRequest({ prompt: 'a cat sitting on a throne', provider: 'openai' }),
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.provider).toBe('openai');
      expect(data.images).toHaveLength(1);
      expect(data.images[0].url).toBe('https://example.com/generated-image.png');
      expect(data.model).toBe(`${imageRouteFixtures.openAiApiModelId}-medium`);
      expect(data.catalog_model).toBe(imageRouteFixtures.openAiModelId);
      expect(data).not.toHaveProperty('cost_estimate');
      expect(typeof data.latency_ms).toBe('number');
    });

    it('should return 200 with hd quality model', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ url: 'https://example.com/hd-image.png' }],
        }),
      });

      const response = await POST(
        makeAuthedRequest({ prompt: 'landscape', provider: 'openai', quality: 'hd' }),
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.model).toBe(`${imageRouteFixtures.openAiApiModelId}-high`);
    });

    it('rejects explicit OpenAI 3:4 before reservation, provider-start, or fetch', async () => {
      const response = await POST(
        makeAuthedRequest({
          prompt: 'a portrait',
          provider: 'openai',
          model: imageRouteFixtures.openAiModelId,
          aspect_ratio: '3:4',
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toMatchObject({
        code: 'unsupported_aspect_ratio',
        param: 'aspect_ratio',
      });
      expect(managedUsageMocks.reserve).not.toHaveBeenCalled();
      expect(managedUsageMocks.providerStarted).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('keeps a legacy portrait size request accepted and maps it to OpenAI native dimensions', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ url: 'https://example.com/legacy-portrait.png' }] }),
      });

      const response = await POST(
        makeAuthedRequest({
          prompt: 'a legacy mobile portrait',
          provider: 'openai',
          size: '1024x1792',
        }),
      );

      expect(response.status).toBe(200);
      const providerRequest = JSON.parse(String(mockFetch.mock.calls[0]?.[1]?.body));
      expect(providerRequest.size).toBe('1024x1536');
      expect(providerRequest).not.toHaveProperty('aspect_ratio');
    });
  });

  describe('Success — Google Imagen provider', () => {
    beforeEach(() => {
      process.env['GOOGLE_API_KEY'] = 'test-google-key';
      delete process.env['OPENAI_API_KEY'];
    });

    it('should return 200 with base64 image from Google Imagen', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          predictions: [{ bytesBase64Encoded: 'base64imagedata==' }],
        }),
      });

      const response = await POST(
        makeAuthedRequest({
          prompt: 'a mountain landscape',
          provider: 'google',
          model: imageRouteFixtures.imagenModelId,
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.provider).toBe('google');
      expect(data.catalog_model).toBe(imageRouteFixtures.imagenModelId);
      expect(data.images[0].b64_json).toBe('base64imagedata==');
    });

    it.each(['1:1', '3:4', '4:3'] as const)(
      'sends Google the exact %s aspect ratio through the current Interactions API',
      async (aspectRatio) => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            status: 'completed',
            steps: [
              {
                type: 'model_output',
                content: [
                  { type: 'text', text: 'Generated the requested image.' },
                  { type: 'image', mime_type: 'image/jpeg', data: VALID_JPEG_BASE64 },
                ],
              },
            ],
          }),
        });

        const response = await POST(
          makeAuthedRequest({
            prompt: 'an exact composition',
            provider: 'google',
            model: imageRouteFixtures.liveGeminiModelId,
            aspect_ratio: aspectRatio,
          }),
        );

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.images).toEqual([{ b64_json: VALID_JPEG_BASE64 }]);
        expect(String(mockFetch.mock.calls[0]?.[0])).toContain('/v1beta/interactions');
        const providerRequest = JSON.parse(String(mockFetch.mock.calls[0]?.[1]?.body));
        expect(providerRequest).toEqual({
          model: imageRouteFixtures.liveGeminiApiModelId,
          input: 'an exact composition',
          response_format: {
            type: 'image',
            mime_type: 'image/jpeg',
            aspect_ratio: aspectRatio,
            image_size: '1K',
          },
        });
      },
    );

    it('rejects multiple Gemini images before reservation or provider work', async () => {
      const response = await POST(
        makeAuthedRequest({
          prompt: 'four alternate compositions',
          provider: 'google',
          model: imageRouteFixtures.liveGeminiModelId,
          n: 4,
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toMatchObject({
        code: 'unsupported_image_count',
        param: 'n',
        max_images: 1,
      });
      expect(managedUsageMocks.reserve).not.toHaveBeenCalled();
      expect(managedUsageMocks.providerStarted).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('fails and refunds when Google returns bytes under a different MIME contract', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          output_image: { mime_type: 'image/png', data: 'mislabeled==' },
        }),
      });

      const response = await POST(
        makeAuthedRequest({
          prompt: 'a correctly labeled output',
          provider: 'google',
          model: imageRouteFixtures.liveGeminiModelId,
        }),
      );

      expect(response.status).toBe(422);
      expect(managedUsageMocks.finalize).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'failed', actualCostCents: 0 }),
      );
    });

    it('deduplicates the SDK convenience image from the canonical REST step', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          output_image: { mime_type: 'image/jpeg', data: VALID_JPEG_BASE64 },
          steps: [
            {
              type: 'model_output',
              content: [{ type: 'image', mime_type: 'image/jpeg', data: VALID_JPEG_BASE64 }],
            },
          ],
        }),
      });

      const response = await POST(
        makeAuthedRequest({
          prompt: 'one exact output',
          provider: 'google',
          model: imageRouteFixtures.liveGeminiModelId,
        }),
      );

      expect(response.status).toBe(200);
      expect((await response.json()).images).toHaveLength(1);
      expect(managedUsageMocks.finalize).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'completed',
          actualCostCents: imageRouteFixtures.liveGeminiCostCents,
        }),
      );
    });

    it.each(['%%not-base64%%', 'Z2VtaW5pYmFzZTY0PT0=', '/9j/4A=='])(
      'fails and refunds malformed or non-image Google bytes: %s',
      async (data) => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            output_image: { mime_type: 'image/jpeg', data },
          }),
        });

        const response = await POST(
          makeAuthedRequest({
            prompt: 'strictly validated output',
            provider: 'google',
            model: imageRouteFixtures.liveGeminiModelId,
          }),
        );

        expect(response.status).toBe(422);
        expect(managedUsageMocks.finalize).toHaveBeenCalledWith(
          expect.objectContaining({ outcome: 'failed', actualCostCents: 0 }),
        );
      },
    );

    it('fails and refunds two distinct image blocks instead of double-charging one request', async () => {
      const secondImageBytes = Buffer.from(VALID_JPEG_BASE64, 'base64');
      const lastEntropyByte = secondImageBytes.length - 3;
      secondImageBytes[lastEntropyByte] = (secondImageBytes[lastEntropyByte] ?? 0) ^ 1;
      const secondImage = secondImageBytes.toString('base64');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          steps: [
            {
              type: 'model_output',
              content: [
                { type: 'image', mime_type: 'image/jpeg', data: VALID_JPEG_BASE64 },
                { type: 'image', mime_type: 'image/jpeg', data: secondImage },
              ],
            },
          ],
        }),
      });

      const response = await POST(
        makeAuthedRequest({
          prompt: 'one requested output',
          provider: 'google',
          model: imageRouteFixtures.liveGeminiModelId,
        }),
      );

      expect(response.status).toBe(422);
      expect(managedUsageMocks.finalize).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'failed', actualCostCents: 0 }),
      );
    });

    it('accepts a provider API model id but prices and dispatches through its catalog model', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          predictions: [{ bytesBase64Encoded: 'fastbase64==' }],
        }),
      });

      const response = await POST(
        makeAuthedRequest({
          prompt: 'a fast concept sketch',
          provider: 'google',
          model: imageRouteFixtures.fastImagenApiModelId,
        }),
      );

      expect(response.status).toBe(200);
      expect(String(mockFetch.mock.calls[0]?.[0])).toContain(
        `/models/${imageRouteFixtures.fastImagenApiModelId}:predict`,
      );
      expect(managedUsageMocks.reserve).toHaveBeenCalledWith(
        expect.objectContaining({
          model: imageRouteFixtures.fastImagenModelId,
          estimatedCostCents: 2,
        }),
      );
    });
  });

  describe('removed image provider adapter', () => {
    beforeEach(() => {
      delete process.env['OPENAI_API_KEY'];
      delete process.env['GOOGLE_API_KEY'];
    });

    it('fails before reservation or provider egress', async () => {
      const response = await POST(
        makeAuthedRequest({ prompt: 'futuristic cityscape', provider: 'stability' }),
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toMatchObject({
        type: 'invalid_request_error',
        code: 'provider_unavailable',
      });
      expect(managedUsageMocks.reserve).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Provider errors', () => {
    it('does not replay an ambiguous 5xx response even when provider selection is automatic', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: async () => ({ error: { message: 'Provider internal error' } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [{ url: 'https://img.example.com/must-not-run.png' }] }),
        });

      const response = await POST(makeAuthedRequest({ prompt: 'a cat' }));
      const data = await response.json();

      expect(response.status).toBe(422);
      expect(data.success).toBe(false);
      expect(data.images).toHaveLength(0);
      expect(mockFetch).toHaveBeenCalledOnce();
      expect(managedUsageMocks.finalize).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'failed', actualCostCents: 0 }),
      );
    });

    it('should return 422 with content policy friendly message when prompt is flagged', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({
          error: { message: 'Your prompt violates content policy guidelines' },
        }),
      });

      const response = await POST(
        makeAuthedRequest({ prompt: 'violating prompt', provider: 'openai' }),
      );
      const data = await response.json();

      expect(response.status).toBe(422);
      expect(data.success).toBe(false);
      expect(data.error).toContain('content safety');
    });

    it('never replays a direct provider 429 and preserves bounded Retry-After structurally', async () => {
      process.env['GOOGLE_API_KEY'] = 'test-google-key';
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: new Headers({ 'Retry-After': '12' }),
          json: async () => ({ error: { message: 'model capacity is temporarily busy' } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            output_image: { mime_type: 'image/jpeg', data: VALID_JPEG_BASE64 },
          }),
        });

      const response = await POST(
        makeAuthedRequest({
          prompt: 'a stylist character',
          provider: 'google',
          model: imageRouteFixtures.liveGeminiModelId,
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data).toMatchObject({
        success: false,
        provider: 'google',
        retry_after_seconds: 12,
      });
      expect(response.headers.get('Retry-After')).toBe('12');
      expect(mockFetch).toHaveBeenCalledOnce();
      expect(managedUsageMocks.finalize).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'failed', actualCostCents: 0 }),
      );
    });

    it('never replays a gateway-originated 429 and caps an excessive Retry-After', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: new Headers({ 'Retry-After': '3600' }),
          json: async () => ({ error: { message: 'gateway capacity refusal' } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [{ url: 'https://img.example.com/retried.png' }] }),
        });

      const response = await POST(makeAuthedRequest({ prompt: 'a cat' }));
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data).toMatchObject({
        success: false,
        provider: 'openai',
        retry_after_seconds: 300,
      });
      expect(response.headers.get('Retry-After')).toBe('300');
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('does not replay an ambiguous timeout even when provider selection is automatic', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('TimeoutError: The operation was aborted'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [{ url: 'https://img.example.com/must-not-run.png' }] }),
        });

      const response = await POST(makeAuthedRequest({ prompt: 'a cat' }));
      const data = await response.json();

      expect(response.status).toBe(422);
      expect(data.error).toBe(
        'The image provider did not respond before the request deadline. Please try again.',
      );
      expect(mockFetch).toHaveBeenCalledOnce();
    });
  });

  describe('Default provider selection', () => {
    it('should prefer Google when GOOGLE_API_KEY is set', async () => {
      process.env['GOOGLE_API_KEY'] = 'test-google-key';
      delete process.env['OPENAI_API_KEY'];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          output_image: { mime_type: 'image/jpeg', data: VALID_JPEG_BASE64 },
        }),
      });

      const response = await POST(makeAuthedRequest({ prompt: 'a cat' }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.provider).toBe('google');
    });

    it('should fall back to OpenAI when only OPENAI_API_KEY is set', async () => {
      delete process.env['GOOGLE_API_KEY'];
      process.env['OPENAI_API_KEY'] = 'sk-test';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ url: 'https://img.example.com/1.png' }] }),
      });

      const response = await POST(makeAuthedRequest({ prompt: 'a cat' }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.provider).toBe('openai');
    });

    it('derives OpenAI from a model-only request even when Google is the configured default', async () => {
      process.env['GOOGLE_API_KEY'] = 'test-google-key';
      process.env['OPENAI_API_KEY'] = 'sk-test';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ url: 'https://img.example.com/openai.png' }] }),
      });

      const response = await POST(
        makeAuthedRequest({ prompt: 'a cat', model: imageRouteFixtures.openAiModelId }),
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.provider).toBe('openai');
      expect(String(mockFetch.mock.calls[0]?.[0])).toContain('api.openai.com');
    });

    it('fails closed when an explicit provider conflicts with the catalog model provider', async () => {
      const response = await POST(
        makeAuthedRequest({
          prompt: 'a cat',
          provider: 'openai',
          model: imageRouteFixtures.imagenModelId,
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toMatchObject({
        type: 'invalid_request_error',
        code: 'provider_model_mismatch',
      });
      expect(managedUsageMocks.reserve).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
