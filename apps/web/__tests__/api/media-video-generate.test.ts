import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const modelCatalogMocks = vi.hoisted(() => ({
  runwayApiModelId: undefined as string | undefined,
  runwayAvailability: 'live' as 'live' | 'unavailable',
}));
const videoReleasePolicyMocks = vi.hoisted(() => ({ runwayEnabled: true }));

vi.mock('@/lib/server/video-provider-release-policy', () => ({
  isVideoProviderReleaseEnabled: (provider: 'google' | 'runway' | 'openrouter') =>
    provider !== 'runway' || videoReleasePolicyMocks.runwayEnabled,
}));

vi.mock('@agiworkforce/types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/types')>();
  return {
    ...actual,
    getModelMetadataById: (id: string) => {
      const model = actual.getModelMetadataById(id);
      return model?.provider === 'runway'
        ? {
            ...model,
            apiModelId: modelCatalogMocks.runwayApiModelId ?? model.apiModelId,
            availability: modelCatalogMocks.runwayAvailability,
          }
        : model;
    },
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

vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn().mockReturnValue(null),
  getCorsHeaders: vi.fn().mockReturnValue({}),
  getSecurityHeaders: vi.fn().mockReturnValue({}),
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

const mockGetClerkAuthUser = vi.fn();

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: (...args: unknown[]) => mockGetClerkAuthUser(...args),
}));

vi.mock('@/lib/neon-db', () => ({
  getServiceClient: vi.fn(() => ({})),
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: vi.fn(async () => []),
    execute: vi.fn(async () => undefined),
    transaction: vi.fn(),
    withUser: vi.fn(),
    dispose: vi.fn(),
  })),
}));

const mockGetSubscription = vi.fn();

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    getSubscription: (...args: unknown[]) => mockGetSubscription(...args),
  },
}));

const mockCheckAvailable = vi.fn();
const mockCreditGetBalance = vi.fn();
const mockDeductCredits = vi.fn();
const mockSettleCreditsDurably = vi.fn();
const mockGenerateIdempotencyKey = vi.fn();

vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    checkAvailable: (...args: unknown[]) => mockCheckAvailable(...args),
    getBalance: (...args: unknown[]) => mockCreditGetBalance(...args),
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
    actualCostCents: 0,
  })),
  delivered: vi.fn(async () => undefined),
}));
const rlsMocks = vi.hoisted(() => ({ getUserScopedDb: vi.fn() }));
const durableJobMocks = vi.hoisted(() => ({
  admit: vi.fn(),
  releaseAdmission: vi.fn(),
  create: vi.fn(),
  beginSubmission: vi.fn(),
  getByIdempotencyKey: vi.fn(),
  recordProviderTask: vi.fn(),
  failBeforeProviderStart: vi.fn(),
  failClaimed: vi.fn(),
  markUnknown: vi.fn(),
  workflowStart: vi.fn(),
  workflowOwnerStart: vi.fn(),
  workflowOwnerCancel: vi.fn(),
  attachmentWorkflowStart: vi.fn(),
  incidentAlert: vi.fn(),
  orphanSettlementAlert: vi.fn(),
  transcriptSync: vi.fn(),
  storeReady: vi.fn(),
  current: undefined as Record<string, unknown> | undefined,
}));

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

vi.mock('@/lib/server/media-storage', () => ({
  isVideoStorageConfigured: vi.fn(() => true),
  authenticatedMediaUrl: vi.fn(),
  deleteStoredMedia: vi.fn(),
  storeMediaFile: vi.fn(),
  videoStoragePathname: vi.fn(),
}));

vi.mock('@/lib/services/tier-unit-quota-service', () => ({
  assertTierUnitAllowance: vi.fn(async () => ({ allowed: true })),
}));

vi.mock('@/lib/server/video-generation-jobs', () => ({
  acquireVideoGenerationAdmission: (...args: unknown[]) => durableJobMocks.admit(...args),
  beginVideoProviderSubmission: (...args: unknown[]) => durableJobMocks.beginSubmission(...args),
  createVideoGenerationJob: (...args: unknown[]) => durableJobMocks.create(...args),
  getVideoGenerationJobByIdempotencyKey: (...args: unknown[]) =>
    durableJobMocks.getByIdempotencyKey(...args),
  recordVideoProviderTask: (...args: unknown[]) => durableJobMocks.recordProviderTask(...args),
  failVideoGenerationBeforeProviderStart: (...args: unknown[]) =>
    durableJobMocks.failBeforeProviderStart(...args),
  releaseVideoGenerationAdmission: (...args: unknown[]) =>
    durableJobMocks.releaseAdmission(...args),
  attachVideoGenerationWorkflow: vi.fn(),
  beginVideoProviderCancellationAttempt: vi.fn(),
  claimVideoGenerationJob: vi.fn(),
  claimVideoIncidentAlert: vi.fn(),
  claimVideoSettlementIncidentById: vi.fn(),
  claimVideoSettlementIncidentByReservation: vi.fn(),
  completeVideoIncidentAlert: vi.fn(),
  completeVideoSettlementIncident: vi.fn(),
  countExhaustedVideoIncidentAlerts: vi.fn(),
  countExhaustedVideoSettlementIncidentAlerts: vi.fn(),
  deferVideoGenerationJob: vi.fn(),
  deferVideoGenerationJobFailure: vi.fn(),
  finalizeVideoGenerationJob: vi.fn(),
  getVideoGenerationJob: vi.fn(),
  getVideoGenerationJobForSystem: vi.fn(),
  getVideoSettlementIncident: vi.fn(),
  listDueVideoGenerationJobIds: vi.fn(),
  listPendingVideoIncidentAlertIds: vi.fn(),
  listPendingVideoSettlementIncidentIds: vi.fn(),
  markVideoGenerationOutcomeUnknown: vi.fn(),
  recordVideoProviderCancellationAttempt: vi.fn(),
}));
vi.mock('@/lib/server/video-job-store-readiness', () => ({
  isVideoJobStoreReady: (...args: unknown[]) => durableJobMocks.storeReady(...args),
}));
vi.mock('@/lib/server/video-generation-transcript', () => ({
  syncVideoGenerationTranscript: (...args: unknown[]) => durableJobMocks.transcriptSync(...args),
}));
vi.mock('@/lib/workflows/start-video-generation-workflow', () => ({
  startVideoGenerationWorkflowExecution: (...args: unknown[]) =>
    durableJobMocks.workflowStart(...args),
  startVideoGenerationWorkflowOwner: (...args: unknown[]) =>
    durableJobMocks.workflowOwnerStart(...args),
  startVideoProviderTaskAttachmentRecovery: (...args: unknown[]) =>
    durableJobMocks.attachmentWorkflowStart(...args),
}));
vi.mock('@/lib/services/video-incident-alert-service', () => ({
  deliverPendingVideoIncidentAlert: (...args: unknown[]) => durableJobMocks.incidentAlert(...args),
  deliverVideoSettlementIncidentByReservation: (...args: unknown[]) =>
    durableJobMocks.orphanSettlementAlert(...args),
}));

vi.mock('@/lib/services/video-job-reconciliation-service', () => ({
  failClaimedVideoGenerationJob: (...args: unknown[]) => durableJobMocks.failClaimed(...args),
  markClaimedVideoGenerationOutcomeUnknown: (...args: unknown[]) =>
    durableJobMocks.markUnknown(...args),
  publicVideoJobStatus: (job: Record<string, unknown>) => ({
    success: true,
    task_id: job['id'],
    status:
      job['status'] === 'submitting'
        ? 'queued'
        : job['status'] === 'outcome_unknown'
          ? 'failed'
          : job['status'],
    ...(job['assetId'] ? { video_url: `/api/files/${String(job['assetId'])}` } : {}),
    ...(job['publicError'] ? { error: job['publicError'] } : {}),
  }),
}));

vi.mock('@/lib/video-task-store', () => ({
  storeVideoTask: vi.fn(),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { POST, OPTIONS } from '@/app/api/media/video/generate/route';
import {
  getModelMetadataById,
  getRoutingSlotModel,
  isExecutableVideoModel,
  isModelLive,
  modelsCatalog,
  resolveVideoGenerationOutputSize,
  type ModelMetadata,
} from '@agiworkforce/types';
import { MANAGED_COMPUTE_PRIVATE_BETA_ENV } from '@/lib/managed-compute-gate';

const BASE_URL = 'http://localhost/api/media/video/generate';

function requireCatalogVideoModel(
  predicate: (model: ModelMetadata) => boolean,
  description: string,
  executable = true,
): ModelMetadata {
  const model = Object.values(modelsCatalog.models).find(
    (candidate) =>
      candidate.modelType === 'video' &&
      candidate.capabilities.videoGen &&
      (!executable || isExecutableVideoModel(candidate)) &&
      predicate(candidate),
  );
  if (!model) throw new Error('Catalog fixture is missing ' + description + '.');
  return model;
}

const RUNWAY_MODEL = requireCatalogVideoModel(
  (model) => model.provider === 'runway',
  'the curated Runway video model',
  false,
);
if (!RUNWAY_MODEL.apiModelId) {
  throw new Error('Catalog fixture is missing the Runway provider mapping.');
}
const RUNWAY_MODEL_ID = RUNWAY_MODEL.id;
const RUNWAY_API_MODEL_ID = RUNWAY_MODEL.apiModelId;

const googleDefaultId = getRoutingSlotModel('video_generation');
const GOOGLE_DEFAULT_MODEL = requireCatalogVideoModel(
  (model) => model.id === googleDefaultId,
  'the Google video default',
);
const GOOGLE_DEFAULT_MODEL_ID = GOOGLE_DEFAULT_MODEL.id;
const GOOGLE_ECONOMY_MODEL = requireCatalogVideoModel(
  (model) =>
    model.provider === 'google' &&
    model.id !== GOOGLE_DEFAULT_MODEL_ID &&
    !resolveVideoGenerationOutputSize(model, '4k', '16:9') &&
    (model.videoPerSecondCostByResolution?.['720p'] ?? Number.POSITIVE_INFINITY) <
      (GOOGLE_DEFAULT_MODEL.videoPerSecondCostByResolution?.['720p'] ?? Number.POSITIVE_INFINITY),
  'a lower-cost Google video model without 4k output',
);
const GOOGLE_ECONOMY_MODEL_ID = GOOGLE_ECONOMY_MODEL.id;
const googleEconomyPricePerSecond =
  GOOGLE_ECONOMY_MODEL.videoPerSecondCostByResolution?.['720p'] ??
  GOOGLE_ECONOMY_MODEL.videoPerSecondCost;
if (googleEconomyPricePerSecond == null) {
  throw new Error('Catalog fixture is missing economy Google video pricing.');
}
const GOOGLE_ECONOMY_DEFAULT_COST_CENTS = Math.ceil(
  Number((googleEconomyPricePerSecond * 4 * 100).toFixed(8)),
);

const NON_VIDEO_MODEL_ID = Object.values(modelsCatalog.models).find(
  (model) => model.modelType !== 'video' && isModelLive(model),
)?.id;
if (!NON_VIDEO_MODEL_ID || !getModelMetadataById(NON_VIDEO_MODEL_ID)) {
  throw new Error('Catalog fixture is missing a live non-video model.');
}

function makeAuthedRequest(body: unknown, extraHeaders: Record<string, string> = {}): NextRequest {
  return new NextRequest(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer valid-test-token',
      'Idempotency-Key': 'agi.media.web.video.operation-123',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

const VIDEO_SUBSCRIPTION = {
  id: 'sub_test_123',
  user_id: 'user-test-id',
  status: 'active',
  plan_tier: 'max_15x',
  current_period_start: new Date('2026-01-01'),
  current_period_end: new Date('2026-02-01'),
  stripe_subscription_id: 'stripe_sub_test',
};

const TEST_USER = { userId: 'user-test-id', email: 'test@example.com' };

describe('POST /api/media/video/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetClerkAuthUser.mockResolvedValue(TEST_USER);
    mockGetSubscription.mockResolvedValue(VIDEO_SUBSCRIPTION);

    mockCheckAvailable.mockResolvedValue(true);
    mockCreditGetBalance.mockResolvedValue({ credits_remaining_cents: 10000 });
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
    managedUsageMocks.reserve.mockImplementation(async (input) => ({
      db: input.db,
      userId: input.userId,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      leaseToken: 'lease-video',
      estimatedCostCents: input.estimatedCostCents,
    }));
    modelCatalogMocks.runwayApiModelId = undefined;
    modelCatalogMocks.runwayAvailability = 'live';
    videoReleasePolicyMocks.runwayEnabled = true;
    durableJobMocks.create.mockImplementation(async (input) => {
      const now = new Date().toISOString();
      const job = {
        ...input,
        id: '11111111-1111-4111-8111-111111111111',
        workflowRunId: input.workflowRunId,
        providerTaskId: null,
        status: 'submitting',
        providerStartedAt: null,
        cancelRequestedAt: null,
        providerCancelAttemptedAt: null,
        providerCancelAcknowledgedAt: null,
        cancelAttempts: 0,
        cancelLastError: null,
        progress: null,
        assetId: null,
        publicError: null,
        billingOutcome: null,
        reconcileFailures: 0,
        nextAttemptAt: now,
        reconcileClaimToken: null,
        reconcileClaimExpiresAt: null,
        createdAt: now,
        updatedAt: now,
        terminalAt: null,
      };
      durableJobMocks.current = job;
      return job;
    });
    durableJobMocks.beginSubmission.mockImplementation(async () => {
      const job = {
        ...durableJobMocks.current,
        providerStartedAt: new Date().toISOString(),
        reconcileClaimToken: 'submission-claim',
        reconcileClaimExpiresAt: new Date(Date.now() + 120_000).toISOString(),
      };
      durableJobMocks.current = job;
      return job;
    });
    durableJobMocks.getByIdempotencyKey.mockResolvedValue(null);
    durableJobMocks.admit.mockResolvedValue(true);
    durableJobMocks.releaseAdmission.mockResolvedValue(undefined);
    durableJobMocks.storeReady.mockResolvedValue(true);
    durableJobMocks.workflowStart.mockImplementation(async () => {
      durableJobMocks.current = {
        ...durableJobMocks.current,
        workflowRunId: 'wrun-video-1',
      };
      return { workflowRunId: 'wrun-video-1' };
    });
    durableJobMocks.workflowOwnerCancel.mockResolvedValue(undefined);
    durableJobMocks.workflowOwnerStart.mockResolvedValue({
      workflowRunId: 'wrun-video-1',
      cancel: durableJobMocks.workflowOwnerCancel,
    });
    durableJobMocks.attachmentWorkflowStart.mockResolvedValue({
      workflowRunId: 'wrun-attachment-1',
    });
    durableJobMocks.failBeforeProviderStart.mockResolvedValue({ status: 'failed' });
    durableJobMocks.incidentAlert.mockResolvedValue(true);
    durableJobMocks.orphanSettlementAlert.mockResolvedValue(true);
    durableJobMocks.transcriptSync.mockResolvedValue('updated');
    durableJobMocks.recordProviderTask.mockImplementation(async (input) => {
      const job = {
        ...durableJobMocks.current,
        providerTaskId: input.providerTaskId,
        status: 'queued',
      };
      durableJobMocks.current = job;
      return job;
    });
    durableJobMocks.failClaimed.mockResolvedValue({ status: 'failed' });
    durableJobMocks.markUnknown.mockResolvedValue({ status: 'outcome_unknown' });

    process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV] = '1';
    process.env['RUNWAY_API_KEY'] = 'test-runway-key';
    process.env['GOOGLE_API_KEY'] = 'test-google-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env['RUNWAY_API_KEY'];
    delete process.env['GOOGLE_API_KEY'];
    delete process.env['GOOGLE_BASE_URL'];
    delete process.env['OPENROUTER_API_KEY'];
    delete process.env['OPENROUTER_BASE_URL'];
    delete process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV];
  });

  describe('Success, OpenRouter video provider', () => {
    it('submits the exact catalog tuple and reserves the catalog formula cost', async () => {
      const { calculateCatalogVideoCostCents, getModels, resolveVideoGenerationOutputSize } =
        await import('@agiworkforce/types');
      const candidates = getModels({
        modelTypes: ['video'],
        requireCapabilities: { videoGen: true },
      }).filter(
        (model) =>
          model.provider === 'open_router' &&
          model.videoGeneration?.pricing?.unit === 'video_tokens',
      );
      expect(candidates).toHaveLength(1);
      const model = candidates[0]!;
      const output = resolveVideoGenerationOutputSize(model, '480p', '21:9');
      const estimatedCostCents = calculateCatalogVideoCostCents({
        model,
        resolution: '480p',
        aspectRatio: '21:9',
        durationSecs: 30,
        generateAudio: false,
      });
      expect(output).toBeTruthy();
      expect(estimatedCostCents).toBeGreaterThan(0);
      process.env['OPENROUTER_API_KEY'] = 'openrouter-test-secret';
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'synthetic-provider-task',
            polling_url: 'https://provider.invalid/task',
            status: 'pending',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

      const response = await POST(
        makeAuthedRequest({
          prompt: 'a snowy mountain',
          provider: 'openrouter',
          model: model.id,
          duration_secs: 30,
          resolution: '480p',
          aspect_ratio: '21:9',
          generate_audio: false,
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        success: true,
        provider: 'openrouter',
        status: 'queued',
      });
      expect(managedUsageMocks.reserve).toHaveBeenCalledWith(
        expect.objectContaining({ model: model.id, estimatedCostCents }),
      );
      const [url, request] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://openrouter.ai/api/v1/videos');
      expect(request.headers).toMatchObject({
        Authorization: 'Bearer openrouter-test-secret',
      });
      expect(JSON.parse(String(request.body))).toEqual({
        model: model.apiModelId,
        prompt: 'a snowy mountain',
        duration: 30,
        size: `${output!.width}x${output!.height}`,
        generate_audio: false,
      });
    });

    it('rejects a tuple absent from the selected catalog model before billing or egress', async () => {
      const { getModels } = await import('@agiworkforce/types');
      const model = getModels({
        modelTypes: ['video'],
        requireCapabilities: { videoGen: true },
      }).find((candidate) => candidate.provider === 'open_router');
      expect(model).toBeTruthy();
      process.env['OPENROUTER_API_KEY'] = 'openrouter-test-secret';

      const response = await POST(
        makeAuthedRequest({
          prompt: 'a snowy mountain',
          provider: 'openrouter',
          model: model!.id,
          duration_secs: 30,
          resolution: '4k',
          aspect_ratio: '16:9',
        }),
      );

      expect(response.status).toBe(400);
      expect(managedUsageMocks.reserve).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });
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

      const request = new NextRequest(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'a sunset' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when authorization does not start with Bearer', async () => {
      const { createError } = await import('@/lib/errors');
      mockGetClerkAuthUser.mockRejectedValueOnce(createError.unauthorized());

      const request = new NextRequest(BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Token abc123',
        },
        body: JSON.stringify({ prompt: 'a sunset' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when Clerk token is invalid', async () => {
      const { createError } = await import('@/lib/errors');
      mockGetClerkAuthUser.mockRejectedValueOnce(createError.unauthorized('Invalid token'));

      const response = await POST(makeAuthedRequest({ prompt: 'a sunset' }));
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when Clerk returns no userId', async () => {
      const { createError } = await import('@/lib/errors');
      mockGetClerkAuthUser.mockRejectedValueOnce(createError.unauthorized());

      const response = await POST(makeAuthedRequest({ prompt: 'a sunset' }));

      expect(response.status).toBe(401);
    });
  });

  describe('Platform moderation floor', () => {
    it('blocks prohibited video prompts before admission, reservation, or provider egress', async () => {
      const response = await POST(
        makeAuthedRequest({
          prompt: 'generate a sexually explicit video of a 12 year old',
          provider: 'google',
        }),
      );

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'content_policy_violation' },
      });
      expect(durableJobMocks.admit).not.toHaveBeenCalled();
      expect(managedUsageMocks.reserve).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Web chat transcript ownership', () => {
    it('denies a cross-tenant assistant placeholder before reservation or provider egress', async () => {
      const query = vi.fn().mockResolvedValue([]);
      rlsMocks.getUserScopedDb.mockResolvedValueOnce({
        db: { query },
        userId: TEST_USER.userId,
        organizationId: null,
      });

      const response = await POST(
        makeAuthedRequest({
          prompt: 'fixture video prompt',
          conversation_id: '22222222-2222-4222-8222-222222222222',
          assistant_message_id: '33333333-3333-4333-8333-333333333333',
        }),
      );

      expect(response.status).toBe(403);
      expect(query).toHaveBeenCalledWith(expect.stringMatching(/conversation\.user_id = \$2/i), [
        '22222222-2222-4222-8222-222222222222',
        TEST_USER.userId,
        '33333333-3333-4333-8333-333333333333',
      ]);
      expect(managedUsageMocks.reserve).not.toHaveBeenCalled();
      expect(durableJobMocks.admit).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
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

      const response = await POST(makeAuthedRequest({ prompt: 'a sunset' }));
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should pass rate limit key "video-generation" to withRateLimit', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'task-abc123', name: 'operations/task-abc123' }),
      });

      const { withRateLimit } = await import('@/lib/rate-limit');
      await POST(makeAuthedRequest({ prompt: 'a sunset' }));

      expect(withRateLimit).toHaveBeenCalledWith(expect.any(NextRequest), 'video-generation');
    });
  });

  describe('Subscription checks', () => {
    it('should return 403 when user has no subscription', async () => {
      mockGetSubscription.mockResolvedValue(null);

      const response = await POST(makeAuthedRequest({ prompt: 'a sunset' }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toMatchObject({
        code: 'subscription_required',
        required_plans: ['max_15x', 'enterprise'],
      });
    });

    it('should return 403 when subscription status is past_due', async () => {
      mockGetSubscription.mockResolvedValue({ ...VIDEO_SUBSCRIPTION, status: 'past_due' });

      const response = await POST(makeAuthedRequest({ prompt: 'a sunset' }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toMatchObject({
        code: 'subscription_inactive',
        current_plan: 'max_15x',
        required_plans: ['max_15x', 'enterprise'],
      });
    });

    it('should return 403 when plan tier is free', async () => {
      mockGetSubscription.mockResolvedValue({ ...VIDEO_SUBSCRIPTION, plan_tier: 'free' });

      const response = await POST(makeAuthedRequest({ prompt: 'a sunset' }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error.code).toBe('plan_upgrade_required');
      expect(data.error.required_plans).toEqual(['max_15x', 'enterprise']);
    });

    it('should return 403 when plan tier is hobby', async () => {
      mockGetSubscription.mockResolvedValue({ ...VIDEO_SUBSCRIPTION, plan_tier: 'hobby' });

      const response = await POST(makeAuthedRequest({ prompt: 'a sunset' }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error.code).toBe('plan_upgrade_required');
    });

    it('should reject Pro even when the subscription is active', async () => {
      mockGetSubscription.mockResolvedValue({
        ...VIDEO_SUBSCRIPTION,
        plan_tier: 'pro',
        status: 'active',
      });

      const response = await POST(makeAuthedRequest({ prompt: 'a sunset' }));

      expect(response.status).toBe(403);
    });

    it('should allow a trialing Max 15x subscription', async () => {
      mockGetSubscription.mockResolvedValue({
        ...VIDEO_SUBSCRIPTION,
        plan_tier: 'max_15x',
        status: 'trialing',
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'task-xyz', name: 'operations/task-xyz' }),
      });

      const response = await POST(makeAuthedRequest({ prompt: 'a sunset' }));

      expect(response.status).toBe(200);
    });

    it('should keep Max 5x below the video tier', async () => {
      mockGetSubscription.mockResolvedValue({ ...VIDEO_SUBSCRIPTION, plan_tier: 'max' });

      const response = await POST(makeAuthedRequest({ prompt: 'a sunset' }));

      expect(response.status).toBe(403);
    });

    it('should allow Max 15x tier subscription', async () => {
      mockGetSubscription.mockResolvedValue({ ...VIDEO_SUBSCRIPTION, plan_tier: 'max_15x' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'task-xyz', name: 'operations/task-xyz' }),
      });

      const response = await POST(makeAuthedRequest({ prompt: 'a sunset' }));

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
        body: 'not valid json {{',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when prompt is missing', async () => {
      const response = await POST(makeAuthedRequest({ duration_secs: 5 }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when prompt is empty string', async () => {
      const response = await POST(makeAuthedRequest({ prompt: '' }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when prompt exceeds 2000 characters', async () => {
      const response = await POST(makeAuthedRequest({ prompt: 'x'.repeat(2001) }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when duration_secs is less than 2', async () => {
      const response = await POST(makeAuthedRequest({ prompt: 'a sunset', duration_secs: 1 }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when duration_secs is greater than 10', async () => {
      const response = await POST(makeAuthedRequest({ prompt: 'a sunset', duration_secs: 11 }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when resolution is invalid', async () => {
      const response = await POST(makeAuthedRequest({ prompt: 'a sunset', resolution: '480p' }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects unknown client fields instead of silently stripping contract drift', async () => {
      const response = await POST(
        makeAuthedRequest({ prompt: 'a sunset', provider: 'runway', style: 'cinematic' }),
      );

      expect(response.status).toBe(400);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Provider configuration', () => {
    it('should return 503 when neither RUNWAY_API_KEY nor GOOGLE_API_KEY is set', async () => {
      delete process.env['RUNWAY_API_KEY'];
      delete process.env['GOOGLE_API_KEY'];

      const response = await POST(makeAuthedRequest({ prompt: 'a sunset' }));
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error.message).toContain('Service temporarily unavailable');
    });

    it('does not reroute an explicit Runway request to configured Google', async () => {
      delete process.env['RUNWAY_API_KEY'];
      process.env['GOOGLE_API_KEY'] = 'test-google-key';

      const response = await POST(makeAuthedRequest({ prompt: 'a sunset', provider: 'runway' }));

      expect(response.status).toBe(503);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(managedUsageMocks.reserve).not.toHaveBeenCalled();
    });

    it('fails the stale Runway catalog model closed before reservation or egress', async () => {
      modelCatalogMocks.runwayApiModelId = 'synthetic-retired-provider-model';
      videoReleasePolicyMocks.runwayEnabled = false;
      process.env['GOOGLE_API_KEY'] = 'test-google-key';

      const response = await POST(
        makeAuthedRequest({
          prompt: 'a sunset',
          provider: 'runway',
          model: RUNWAY_MODEL_ID,
        }),
      );

      expect(response.status).toBe(503);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(managedUsageMocks.reserve).not.toHaveBeenCalled();
    });

    it('does not execute a non-live Runway model even when Google is configured', async () => {
      modelCatalogMocks.runwayAvailability = 'unavailable';

      const response = await POST(
        makeAuthedRequest({
          prompt: 'a sunset',
          provider: 'runway',
          model: RUNWAY_MODEL_ID,
        }),
      );

      expect(response.status).toBe(400);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(managedUsageMocks.reserve).not.toHaveBeenCalled();
    });

    it('rejects a live non-video catalog model before reservation or egress', async () => {
      const response = await POST(
        makeAuthedRequest({ prompt: 'a sunset', model: NON_VIDEO_MODEL_ID }),
      );

      expect(response.status).toBe(400);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(managedUsageMocks.reserve).not.toHaveBeenCalled();
    });
  });

  describe('Usage admission', () => {
    it('requires a stable idempotency identity before provider work', async () => {
      const response = await POST(
        makeAuthedRequest(
          { prompt: 'a sunset', provider: 'runway', model: RUNWAY_MODEL_ID },
          { 'Idempotency-Key': '' },
        ),
      );

      expect(response.status).toBe(400);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(managedUsageMocks.reserve).not.toHaveBeenCalled();
    });

    it('rejects an image operation identity before reserving or calling the video provider', async () => {
      const response = await POST(
        makeAuthedRequest(
          { prompt: 'a sunset', provider: 'runway', model: RUNWAY_MODEL_ID },
          { 'Idempotency-Key': 'agi.media.web.image.operation-123' },
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

    it('persists and starts the accepted video task without settling before delivery', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'task-xyz' }) });

      const response = await POST(
        makeAuthedRequest({
          prompt: 'a sunset',
          provider: 'runway',
          model: RUNWAY_MODEL_ID,
        }),
      );

      expect(response.status).toBe(200);
      expect(managedUsageMocks.reserve).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: TEST_USER.userId,
          idempotencyKey: 'agi.media.web.video.operation-123',
          provider: 'runway',
          planTier: 'max_15x',
          isFlagship: false,
        }),
      );
      expect(durableJobMocks.beginSubmission).toHaveBeenCalledTimes(1);
      expect(durableJobMocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: TEST_USER.userId,
          provider: 'runway',
          sourceSurface: 'web',
        }),
      );
      expect(durableJobMocks.recordProviderTask).toHaveBeenCalledWith(
        expect.objectContaining({ providerTaskId: 'task-xyz' }),
      );
      expect(managedUsageMocks.finalize).not.toHaveBeenCalled();
      expect(managedUsageMocks.delivered).not.toHaveBeenCalled();
      expect(mockCheckAvailable).not.toHaveBeenCalled();
      expect(mockDeductCredits).not.toHaveBeenCalled();
      expect(mockSettleCreditsDurably).not.toHaveBeenCalled();
      expect(managedUsageMocks.reserve.mock.invocationCallOrder[0]).toBeLessThan(
        durableJobMocks.create.mock.invocationCallOrder[0]!,
      );
      expect(durableJobMocks.admit.mock.invocationCallOrder[0]).toBeLessThan(
        managedUsageMocks.reserve.mock.invocationCallOrder[0]!,
      );
      expect(durableJobMocks.workflowOwnerStart.mock.invocationCallOrder[0]).toBeLessThan(
        durableJobMocks.create.mock.invocationCallOrder[0]!,
      );
      expect(durableJobMocks.create.mock.invocationCallOrder[0]).toBeLessThan(
        durableJobMocks.beginSubmission.mock.invocationCallOrder[0]!,
      );
      expect(durableJobMocks.beginSubmission.mock.invocationCallOrder[0]).toBeLessThan(
        mockFetch.mock.invocationCallOrder[0]!,
      );
    });

    it('replays the same active durable job without a second reservation or provider start', async () => {
      const body = {
        prompt: 'a sunset',
        provider: 'runway' as const,
        model: RUNWAY_MODEL_ID,
      };
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'task-once' }) });

      const first = await POST(makeAuthedRequest(body));
      const active = durableJobMocks.current;
      durableJobMocks.getByIdempotencyKey.mockResolvedValue(active);
      const replay = await POST(makeAuthedRequest(body));

      expect(first.status).toBe(200);
      expect(replay.status).toBe(200);
      expect((await replay.json()).task_id).toBe('11111111-1111-4111-8111-111111111111');
      expect(managedUsageMocks.reserve).toHaveBeenCalledTimes(1);
      expect(durableJobMocks.create).toHaveBeenCalledTimes(1);
      expect(durableJobMocks.workflowOwnerStart).toHaveBeenCalledTimes(1);
      expect(durableJobMocks.beginSubmission).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('fails before reservation and provider egress when the durable job schema is unavailable', async () => {
      durableJobMocks.storeReady.mockResolvedValue(false);

      const response = await POST(
        makeAuthedRequest({
          prompt: 'a sunset',
          provider: 'runway',
          model: RUNWAY_MODEL_ID,
        }),
      );

      expect(response.status).toBe(503);
      expect(managedUsageMocks.reserve).not.toHaveBeenCalled();
      expect(durableJobMocks.create).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('scopes admission to job setup rather than the whole invocation budget', async () => {
      const { maxDuration } = await import('@/app/api/media/video/generate/route');
      const { VIDEO_GENERATION_ADMISSION_SECONDS } =
        await import('@/lib/workflows/video-generation-timing');

      await POST(
        makeAuthedRequest({
          prompt: 'a sunset',
          provider: 'runway',
          model: RUNWAY_MODEL_ID,
        }),
      );

      expect(durableJobMocks.admit).toHaveBeenCalledWith(
        expect.objectContaining({ admissionSeconds: VIDEO_GENERATION_ADMISSION_SECONDS }),
      );
      expect(VIDEO_GENERATION_ADMISSION_SECONDS).toBeLessThan(maxDuration);
    });

    it('does not reserve credits when a data/account erasure fence owns admission', async () => {
      durableJobMocks.admit.mockResolvedValueOnce(false);

      const response = await POST(
        makeAuthedRequest({
          prompt: 'a sunset',
          provider: 'runway',
          model: RUNWAY_MODEL_ID,
        }),
      );

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'video_generation_admission_busy' },
      });
      expect(managedUsageMocks.reserve).not.toHaveBeenCalled();
      expect(durableJobMocks.create).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('refunds and never contacts the provider when Workflow cannot be attached', async () => {
      durableJobMocks.workflowOwnerStart.mockRejectedValueOnce(new Error('Workflow unavailable'));
      managedUsageMocks.finalize.mockResolvedValueOnce({
        requestStatus: 'released',
        operationResult: 'finalized',
        settlementStatus: 'succeeded',
        actualCostCents: 0,
      });

      const response = await POST(
        makeAuthedRequest({
          prompt: 'a sunset',
          provider: 'runway',
          model: RUNWAY_MODEL_ID,
        }),
      );

      expect(response.status).toBe(503);
      expect(managedUsageMocks.finalize).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'failed', actualCostCents: 0 }),
      );
      expect(durableJobMocks.create).not.toHaveBeenCalled();
      expect(durableJobMocks.failBeforeProviderStart).not.toHaveBeenCalled();
      expect(durableJobMocks.beginSubmission).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('attempts the owed human alert when a pre-egress refund is immediately terminal', async () => {
      durableJobMocks.workflowOwnerStart.mockRejectedValueOnce(new Error('Workflow unavailable'));
      managedUsageMocks.finalize.mockResolvedValueOnce({
        requestStatus: 'released',
        operationResult: 'finalized',
        settlementStatus: 'terminal',
        actualCostCents: 0,
      });

      const response = await POST(
        makeAuthedRequest({
          prompt: 'a sunset',
          provider: 'runway',
          model: RUNWAY_MODEL_ID,
        }),
      );

      expect(response.status).toBe(503);
      expect(durableJobMocks.orphanSettlementAlert).toHaveBeenCalledOnce();
      expect(durableJobMocks.incidentAlert).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('retains and alerts an immediate-terminal refund when job persistence fails', async () => {
      durableJobMocks.create.mockRejectedValueOnce(new Error('profile erasure fence won'));
      managedUsageMocks.finalize.mockResolvedValueOnce({
        requestStatus: 'released',
        operationResult: 'finalized',
        settlementStatus: 'terminal',
        actualCostCents: 0,
      });

      const response = await POST(
        makeAuthedRequest({
          prompt: 'a sunset',
          provider: 'runway',
          model: RUNWAY_MODEL_ID,
        }),
      );

      expect(response.status).toBe(503);
      expect(managedUsageMocks.finalize).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'failed', actualCostCents: 0 }),
      );
      expect(durableJobMocks.orphanSettlementAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: TEST_USER.userId,
          idempotencyKey: 'agi.media.web.video.operation-123',
        }),
      );
      expect(durableJobMocks.workflowOwnerStart).toHaveBeenCalledOnce();
      expect(durableJobMocks.workflowOwnerCancel).toHaveBeenCalledOnce();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('keeps the prestarted Workflow when INSERT commit and recovery read are ambiguous', async () => {
      durableJobMocks.create.mockRejectedValueOnce(new Error('connection lost after insert'));
      durableJobMocks.getByIdempotencyKey
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('Neon unavailable'));

      const response = await POST(
        makeAuthedRequest({
          prompt: 'a sunset',
          provider: 'runway',
          model: RUNWAY_MODEL_ID,
        }),
      );

      expect(response.status).toBe(503);
      expect(durableJobMocks.workflowOwnerStart).toHaveBeenCalledOnce();
      expect(durableJobMocks.workflowOwnerCancel).not.toHaveBeenCalled();
      expect(managedUsageMocks.finalize).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('never starts provider work when cancellation wins the atomic begin boundary', async () => {
      durableJobMocks.beginSubmission.mockRejectedValueOnce(
        new Error('video provider submission already claimed'),
      );
      durableJobMocks.getByIdempotencyKey
        .mockResolvedValueOnce(null)
        .mockImplementation(async () => ({
          ...durableJobMocks.current,
          cancelRequestedAt: new Date().toISOString(),
        }));

      const response = await POST(
        makeAuthedRequest({
          prompt: 'a sunset',
          provider: 'runway',
          model: RUNWAY_MODEL_ID,
        }),
      );

      expect(response.status).toBe(200);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(durableJobMocks.recordProviderTask).not.toHaveBeenCalled();
    });

    it('replays a completed durable job without charging or starting the provider again', async () => {
      const body = {
        prompt: 'a sunset',
        provider: 'runway' as const,
        model: RUNWAY_MODEL_ID,
      };
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'task-once' }) });
      await POST(makeAuthedRequest(body));
      durableJobMocks.getByIdempotencyKey.mockResolvedValue({
        ...durableJobMocks.current,
        status: 'completed',
        assetId: '11111111-1111-4111-8111-111111111111',
        billingOutcome: 'completed',
        terminalAt: new Date().toISOString(),
      });

      const replay = await POST(makeAuthedRequest(body));

      expect(replay.status).toBe(200);
      expect(await replay.json()).toMatchObject({
        task_id: '11111111-1111-4111-8111-111111111111',
        status: 'completed',
        video_url: '/api/files/11111111-1111-4111-8111-111111111111',
      });
      expect(managedUsageMocks.reserve).toHaveBeenCalledTimes(1);
      expect(durableJobMocks.create).toHaveBeenCalledTimes(1);
      expect(durableJobMocks.beginSubmission).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it.each(['failed', 'outcome_unknown'] as const)(
      'replays a terminal %s durable job as failed instead of lying that it is queued',
      async (status) => {
        const body = {
          prompt: 'a sunset',
          provider: 'runway' as const,
          model: RUNWAY_MODEL_ID,
        };
        mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'task-once' }) });
        await POST(makeAuthedRequest(body));
        durableJobMocks.getByIdempotencyKey.mockResolvedValue({
          ...durableJobMocks.current,
          status,
          publicError: 'The provider result could not be delivered.',
          billingOutcome: status === 'failed' ? 'released' : 'outcome_unknown',
          terminalAt: new Date().toISOString(),
        });

        const replay = await POST(makeAuthedRequest(body));

        expect(replay.status).toBe(200);
        expect(await replay.json()).toMatchObject({
          task_id: '11111111-1111-4111-8111-111111111111',
          status: 'failed',
          error: 'The provider result could not be delivered.',
        });
        expect(managedUsageMocks.reserve).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledTimes(1);
      },
    );

    it('rejects a changed body under the same video idempotency key before billing or egress', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'task-once' }) });
      await POST(
        makeAuthedRequest({
          prompt: 'a sunset',
          provider: 'runway',
          model: RUNWAY_MODEL_ID,
        }),
      );
      durableJobMocks.getByIdempotencyKey.mockResolvedValue(durableJobMocks.current);

      const response = await POST(
        makeAuthedRequest({
          prompt: 'a different request',
          provider: 'runway',
          model: RUNWAY_MODEL_ID,
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error.code).toBe('idempotency_conflict');
      expect(managedUsageMocks.reserve).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('recovers the winning durable job when reservation reports an in-progress race', async () => {
      const body = {
        prompt: 'a sunset',
        provider: 'runway' as const,
        model: RUNWAY_MODEL_ID,
      };
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'winning-task' }) });
      await POST(makeAuthedRequest(body));
      const winner = durableJobMocks.current;

      vi.clearAllMocks();
      durableJobMocks.getByIdempotencyKey.mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
      const { ManagedUsageRequestError } =
        await import('@/lib/services/managed-usage-request-service');
      managedUsageMocks.reserve.mockRejectedValueOnce(
        new ManagedUsageRequestError(
          'An identical request is already in progress.',
          409,
          'idempotency_in_progress',
        ),
      );

      const response = await POST(makeAuthedRequest(body));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.task_id).toBe('11111111-1111-4111-8111-111111111111');
      expect(durableJobMocks.create).not.toHaveBeenCalled();
      expect(durableJobMocks.beginSubmission).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Success, Runway provider', () => {
    it('fails closed in the release policy before reservation or provider egress', async () => {
      videoReleasePolicyMocks.runwayEnabled = false;

      const response = await POST(
        makeAuthedRequest({
          prompt: 'a cinematic sunset',
          provider: 'runway',
          model: RUNWAY_MODEL_ID,
        }),
      );

      expect(response.status).toBe(503);
      expect(managedUsageMocks.reserve).not.toHaveBeenCalled();
      expect(durableJobMocks.admit).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return 200 with task_id when Runway task is created', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'runway-task-abc123', status: 'PENDING' }),
      });

      const response = await POST(
        makeAuthedRequest({
          prompt: 'a cinematic sunset',
          provider: 'runway',
          model: RUNWAY_MODEL_ID,
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.task_id).toBe('11111111-1111-4111-8111-111111111111');
      expect(data.status).toBe('queued');
      expect(data.provider).toBe('runway');
      expect(typeof data.estimated_duration_secs).toBe('number');
      expect(managedUsageMocks.reserve).toHaveBeenCalledWith(
        expect.objectContaining({ model: RUNWAY_MODEL_ID, estimatedCostCents: 48 }),
      );
      const [, runwayRequest] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(String(runwayRequest.body))).toMatchObject({
        model: RUNWAY_API_MODEL_ID,
        ratio: '1280:720',
      });
    });

    it('should include estimated_duration_secs based on video duration', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'runway-task-xyz', status: 'PENDING' }),
      });

      const response = await POST(
        makeAuthedRequest({
          prompt: 'a sunset',
          provider: 'runway',
          model: RUNWAY_MODEL_ID,
          duration_secs: 8,
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.estimated_duration_secs).toBe(140);
    });

    it('uses the canonical Google slot rather than silently falling back to Runway', async () => {
      process.env['GOOGLE_API_KEY'] = 'test-google-key';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'operations/google-default-task', done: false }),
      });

      const response = await POST(makeAuthedRequest({ prompt: 'a sunset' }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.provider).toBe('google');
    });
  });

  describe('Success, Google Veo provider', () => {
    beforeEach(() => {
      delete process.env['RUNWAY_API_KEY'];
      process.env['GOOGLE_API_KEY'] = 'test-google-key';
    });

    it('should return 200 with task_id when Google Veo operation is created', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'operations/12345678', done: false }),
      });

      const response = await POST(
        makeAuthedRequest({ prompt: 'a snowy mountain', provider: 'google' }),
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.task_id).toBe('11111111-1111-4111-8111-111111111111');
      expect(data.status).toBe('queued');
      expect(data.provider).toBe('google');
      expect(managedUsageMocks.reserve).toHaveBeenCalledWith(
        expect.objectContaining({ model: GOOGLE_DEFAULT_MODEL_ID, estimatedCostCents: 160 }),
      );
      const [, googleRequest] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(String(googleRequest.body))).toMatchObject({
        parameters: { durationSeconds: 4, resolution: '720p' },
      });
    });

    it('submits through the canonical validated Google API root override', async () => {
      process.env['GOOGLE_BASE_URL'] = 'https://generativelanguage.googleapis.com/regional/v1beta';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'operations/override-task', done: false }),
      });

      const response = await POST(
        makeAuthedRequest({ prompt: 'a snowy mountain', provider: 'google' }),
      );

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(
          /^https:\/\/generativelanguage\.googleapis\.com\/regional\/v1beta\/models\/[^/]+:predictLongRunning$/u,
        ),
        expect.any(Object),
      );
    });

    it('rejects a higher-resolution Google tuple instead of silently extending its duration', async () => {
      const response = await POST(
        makeAuthedRequest({
          prompt: 'a cinematic mountain',
          provider: 'google',
          duration_secs: 4,
          resolution: '4k',
        }),
      );

      expect(response.status).toBe(400);
      expect(managedUsageMocks.reserve).not.toHaveBeenCalled();
      expect(durableJobMocks.create).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('reserves catalog pricing for an explicit valid 8-second 4k Veo request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'operations/4k-task', done: false }),
      });

      const response = await POST(
        makeAuthedRequest({
          prompt: 'a cinematic mountain',
          provider: 'google',
          duration_secs: 8,
          resolution: '4k',
        }),
      );

      expect(response.status).toBe(200);
      expect(managedUsageMocks.reserve).toHaveBeenCalledWith(
        expect.objectContaining({ model: GOOGLE_DEFAULT_MODEL_ID, estimatedCostCents: 480 }),
      );
      const [, googleRequest] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(String(googleRequest.body))).toMatchObject({
        parameters: { durationSeconds: 8, resolution: '4k' },
      });
    });

    it('rejects a non-native Google duration before reservation or provider egress', async () => {
      const response = await POST(
        makeAuthedRequest({ prompt: 'a snowy mountain', provider: 'google', duration_secs: 5 }),
      );

      expect(response.status).toBe(400);
      expect(managedUsageMocks.reserve).not.toHaveBeenCalled();
      expect(durableJobMocks.create).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects 4k on Veo Lite using the selected model pricing capabilities', async () => {
      const response = await POST(
        makeAuthedRequest({
          prompt: 'a snowy mountain',
          provider: 'google',
          model: GOOGLE_ECONOMY_MODEL_ID,
          duration_secs: 8,
          resolution: '4k',
        }),
      );

      expect(response.status).toBe(400);
      expect(managedUsageMocks.reserve).not.toHaveBeenCalled();
      expect(durableJobMocks.create).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('uses the valid four-second default and Lite catalog price without mutation', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'operations/lite-task', done: false }),
      });

      const response = await POST(
        makeAuthedRequest({
          prompt: 'a snowy mountain',
          provider: 'google',
          model: GOOGLE_ECONOMY_MODEL_ID,
        }),
      );

      expect(response.status).toBe(200);
      expect(managedUsageMocks.reserve).toHaveBeenCalledWith(
        expect.objectContaining({
          model: GOOGLE_ECONOMY_MODEL_ID,
          estimatedCostCents: GOOGLE_ECONOMY_DEFAULT_COST_CENTS,
        }),
      );
      const [, googleRequest] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(String(googleRequest.body))).toMatchObject({
        parameters: { durationSeconds: 4, resolution: '720p' },
      });
    });

    it('rejects a requested model whose catalog provider contradicts the provider field', async () => {
      process.env['RUNWAY_API_KEY'] = 'test-runway-key';

      const response = await POST(
        makeAuthedRequest({
          prompt: 'a snowy mountain',
          provider: 'runway',
          model: GOOGLE_DEFAULT_MODEL_ID,
        }),
      );

      expect(response.status).toBe(400);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Provider errors', () => {
    it('should return 401/503 when Runway returns 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Unauthorized',
      });

      const response = await POST(
        makeAuthedRequest({
          prompt: 'a sunset',
          provider: 'runway',
          model: RUNWAY_MODEL_ID,
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error.message).toContain('Service temporarily unavailable');
    });

    it('should return 429 when Runway returns 429', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: async () => 'Too Many Requests',
      });

      const response = await POST(
        makeAuthedRequest({
          prompt: 'a sunset',
          provider: 'runway',
          model: RUNWAY_MODEL_ID,
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.error.message).toContain('Too many requests');
    });

    it('marks a Runway 5xx outcome unknown because the provider may have accepted it', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Internal Server Error',
      });

      const response = await POST(
        makeAuthedRequest({
          prompt: 'a sunset',
          provider: 'runway',
          model: RUNWAY_MODEL_ID,
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(durableJobMocks.markUnknown).toHaveBeenCalledTimes(1);
      expect(durableJobMocks.failClaimed).not.toHaveBeenCalled();
    });

    it('marks an accepted Runway response without a task ID outcome unknown', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'PENDING' }), // missing id
      });

      const response = await POST(
        makeAuthedRequest({
          prompt: 'a sunset',
          provider: 'runway',
          model: RUNWAY_MODEL_ID,
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(durableJobMocks.markUnknown).toHaveBeenCalledTimes(1);
    });

    it('should return 503 when Google Veo returns 401', async () => {
      process.env['GOOGLE_API_KEY'] = 'test-google-key';
      delete process.env['RUNWAY_API_KEY'];

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Unauthorized',
      });

      const response = await POST(makeAuthedRequest({ prompt: 'a sunset', provider: 'google' }));
      await response.json();

      expect(response.status).toBe(503);
    });

    it('should return 400 when Google Veo flags prompt as unsafe', async () => {
      process.env['GOOGLE_API_KEY'] = 'test-google-key';
      delete process.env['RUNWAY_API_KEY'];

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () =>
          JSON.stringify({ error: { message: 'Content safety filters triggered' } }),
      });

      const response = await POST(makeAuthedRequest({ prompt: 'a sunset', provider: 'google' }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('records a network-lost provider start as outcome unknown without replay', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const response = await POST(
        makeAuthedRequest({
          prompt: 'a sunset',
          provider: 'runway',
          model: RUNWAY_MODEL_ID,
        }),
      );
      await response.json();

      expect(response.status).toBe(503);
      expect(durableJobMocks.markUnknown).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: '11111111-1111-4111-8111-111111111111' }),
        expect.any(String),
        undefined,
      );
      expect(durableJobMocks.failClaimed).not.toHaveBeenCalled();
      expect(managedUsageMocks.finalize).not.toHaveBeenCalled();
      expect(mockSettleCreditsDurably).not.toHaveBeenCalled();
    });

    it('recovers a transient task-attachment failure without abandoning the known provider task', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'provider-task-started' }),
      });
      durableJobMocks.recordProviderTask.mockRejectedValueOnce(new Error('database unavailable'));

      const response = await POST(
        makeAuthedRequest({
          prompt: 'a sunset',
          provider: 'runway',
          model: RUNWAY_MODEL_ID,
        }),
      );

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      await expect(response.json()).resolves.toMatchObject({
        task_id: '11111111-1111-4111-8111-111111111111',
        status: 'queued',
      });
      expect(durableJobMocks.recordProviderTask).toHaveBeenCalledTimes(2);
      expect(durableJobMocks.markUnknown).not.toHaveBeenCalled();
      expect(durableJobMocks.failClaimed).not.toHaveBeenCalled();
      expect(managedUsageMocks.finalize).not.toHaveBeenCalled();
    });

    it('copies a known provider id into durable recovery when every direct DB attach fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'provider-task-started' }),
      });
      durableJobMocks.recordProviderTask.mockRejectedValue(new Error('database unavailable'));

      const response = await POST(
        makeAuthedRequest({
          prompt: 'a sunset',
          provider: 'runway',
          model: RUNWAY_MODEL_ID,
        }),
      );

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(durableJobMocks.attachmentWorkflowStart).toHaveBeenCalledWith({
        jobId: '11111111-1111-4111-8111-111111111111',
        providerTaskId: 'provider-task-started',
      });
      expect(durableJobMocks.markUnknown).not.toHaveBeenCalled();
    });

    it('records outcome_unknown when neither DB nor Workflow can retain a known provider id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'provider-task-started' }),
      });
      durableJobMocks.recordProviderTask.mockRejectedValue(new Error('database unavailable'));
      durableJobMocks.attachmentWorkflowStart.mockRejectedValueOnce(
        new Error('Workflow unavailable'),
      );

      const response = await POST(
        makeAuthedRequest({
          prompt: 'a sunset',
          provider: 'runway',
          model: RUNWAY_MODEL_ID,
        }),
      );

      expect(response.status).toBe(503);
      expect(durableJobMocks.markUnknown).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: '11111111-1111-4111-8111-111111111111' }),
        expect.any(String),
        'provider-task-started',
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
