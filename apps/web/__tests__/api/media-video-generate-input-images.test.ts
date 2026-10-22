import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
type ScanModule0 = typeof import('@agiworkforce/types');
type ScanModule1 = typeof import('@/lib/errors');
type ScanModule2 = typeof import('@/lib/error-handler');
type ScanModule3 = typeof import('@/lib/services/managed-usage-request-service');

vi.mock('server-only', () => ({}));

const modelCatalogMocks = vi.hoisted(() => ({
  runwayApiModelId: undefined as string | undefined,
  runwayAvailability: 'live' as 'live' | 'unavailable',
  unpricedResolution: null as '480p' | '720p' | '1080p' | '4k' | null,
  imageInputWithdrawn: false,
}));
const videoReleasePolicyMocks = vi.hoisted(() => ({ runwayEnabled: true }));
const trainingMocks = vi.hoisted(() => ({
  optedOut: false,
  videoSlot: null as string | null,
}));

vi.mock('@/lib/server/side-call-training-policy', async (importOriginal) => ({
  ...(await importOriginal<SideCallTrainingPolicyModule>()),
  sideCallTrainingOptOut: vi.fn(async () => trainingMocks.optedOut),
}));

vi.mock('@/lib/server/video-provider-release-policy', () => ({
  isVideoProviderReleaseEnabled: (provider: 'google' | 'runway' | 'openrouter') =>
    provider !== 'runway' || videoReleasePolicyMocks.runwayEnabled,
}));

vi.mock('@agiworkforce/types', async (importOriginal) => {
  const actual = await importOriginal<ScanModule0>();
  return {
    ...actual,
    getRoutingSlotModel: (slot: Parameters<typeof actual.getRoutingSlotModel>[0]) =>
      slot === 'video_generation' && trainingMocks.videoSlot
        ? trainingMocks.videoSlot
        : actual.getRoutingSlotModel(slot),
    getModelMetadataById: (id: string) => {
      const model = actual.getModelMetadataById(id);
      if (model?.imageInput && modelCatalogMocks.imageInputWithdrawn) {
        const { imageInput: _withdrawn, ...promptOnly } = model;
        return promptOnly;
      }
      if (model?.provider === 'runway') {
        return {
          ...model,
          apiModelId: modelCatalogMocks.runwayApiModelId ?? model.apiModelId,
          availability: modelCatalogMocks.runwayAvailability,
        };
      }
      const dropped = modelCatalogMocks.unpricedResolution;
      if (model && dropped && model.videoPerSecondCostByResolution) {
        const { [dropped]: _unpriced, ...priced } = model.videoPerSecondCostByResolution;
        return { ...model, videoPerSecondCostByResolution: priced };
      }
      return model;
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
  const actual = await vi.importActual<ScanModule1>('@/lib/errors');
  return {
    createError: actual.createError,
    AppError: actual.AppError,
    isAppError: actual.isAppError,
  };
});

vi.mock('@/lib/error-handler', async () => {
  const actual = await vi.importActual<ScanModule2>('@/lib/error-handler');
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
  MICROUSD_PER_LEDGER_CENT: 10_000,
  microusdFromLedgerCents: (cents: number) => Math.round(cents) * 10_000,
  ledgerCentsFromMicrousd: (microusd: number) => Math.floor((microusd + 5_000) / 10_000),

  CreditService: {
    checkAvailable: (...args: unknown[]) => mockCheckAvailable(...args),
    checkAvailableMicrousd: (...args: unknown[]) => mockCheckAvailable(...args),
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
  current: undefined as Record<string, unknown> | undefined,
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...args: unknown[]) => rlsMocks.getUserScopedDb(...args),
}));
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  reserveManagedUsageRequest: managedUsageMocks.reserve,
  markManagedUsageProviderStarted: managedUsageMocks.providerStarted,
  finalizeManagedUsageRequest: managedUsageMocks.finalize,
  markManagedUsageClientDelivered: managedUsageMocks.delivered,
}));

vi.mock('@/lib/server/media-storage', () => ({
  isVideoStorageConfigured: vi.fn(() => true),
  authenticatedMediaUrl: vi.fn(),
  deleteStoredMedia: vi.fn(),
  readStoredMedia: vi.fn(),
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

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { createHash } from 'node:crypto';
import { POST } from '@/app/api/media/video/generate/route';
import { getModels, isExecutableVideoModel, type ModelMetadata } from '@agiworkforce/types';
import { managedMediaVideoInputImageLimit } from '@agiworkforce/cloud-contracts';
import { MANAGED_COMPUTE_PRIVATE_BETA_ENV } from '@/lib/managed-compute-gate';

type SideCallTrainingPolicyModule = typeof import('@/lib/server/side-call-training-policy');

const BASE_URL = 'http://localhost/api/media/video/generate';
const ONE_PIXEL_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function wireProvider(model: ModelMetadata): string {
  return model.provider === 'open_router' ? 'openrouter' : model.provider;
}

const executableVideoModels = getModels({
  modelTypes: ['video'],
  requireCapabilities: { videoGen: true },
}).filter(isExecutableVideoModel);
const IMAGE_INPUT_MODEL = executableVideoModels.find(
  (model) => managedMediaVideoInputImageLimit(wireProvider(model), model) > 0,
);
if (!IMAGE_INPUT_MODEL)
  throw new Error('Catalog fixture is missing a video model that takes images.');
const IMAGE_INPUT_LIMIT = managedMediaVideoInputImageLimit(
  wireProvider(IMAGE_INPUT_MODEL),
  IMAGE_INPUT_MODEL,
);

function makeAuthedRequest(body: unknown): NextRequest {
  return new NextRequest(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer valid-test-token',
      'Idempotency-Key': 'agi.media.web.video.operation-123',
    },
    body: JSON.stringify(body),
  });
}

function imageInputRequest(extra: Record<string, unknown>) {
  return makeAuthedRequest({
    prompt: 'the four photos become one clip',
    model: IMAGE_INPUT_MODEL!.id,
    duration_secs: IMAGE_INPUT_MODEL!.videoGeneration!.durationSecs[0],
    resolution: '720p',
    aspect_ratio: '16:9',
    generate_audio: false,
    ...extra,
  });
}

function acceptSubmission() {
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
}

function submittedBody(): Record<string, unknown> {
  const [, request] = mockFetch.mock.calls[0] as [string, RequestInit];
  return JSON.parse(String(request.body)) as Record<string, unknown>;
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

describe('POST /api/media/video/generate input images', () => {
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
      estimatedCostMicrousd: input.estimatedCostMicrousd,
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

    modelCatalogMocks.unpricedResolution = null;
    modelCatalogMocks.imageInputWithdrawn = false;
    trainingMocks.optedOut = false;
    trainingMocks.videoSlot = null;
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
    delete process.env['MODERATION_HASH_DENYLIST'];
  });

  it('sends reference images to the provider as input references', async () => {
    process.env['OPENROUTER_API_KEY'] = 'openrouter-test-secret';
    acceptSubmission();
    const images = Array.from({ length: IMAGE_INPUT_LIMIT }, () => ({
      b64_json: ONE_PIXEL_PNG_B64,
    }));

    const response = await POST(imageInputRequest({ reference_images: images }));

    expect(response.status).toBe(200);
    expect(submittedBody()['input_references']).toEqual(
      images.map(() => ({
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${ONE_PIXEL_PNG_B64}` },
      })),
    );
    expect(submittedBody()).not.toHaveProperty('frame_images');
  });

  it('sends a first frame image as the opening frame of the clip', async () => {
    process.env['OPENROUTER_API_KEY'] = 'openrouter-test-secret';
    acceptSubmission();

    const response = await POST(
      imageInputRequest({
        first_frame_image: { b64_json: `data:image/png;base64,${ONE_PIXEL_PNG_B64}` },
      }),
    );

    expect(response.status).toBe(200);
    expect(submittedBody()['frame_images']).toEqual([
      {
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${ONE_PIXEL_PNG_B64}` },
        frame_type: 'first_frame',
      },
    ]);
    expect(submittedBody()).not.toHaveProperty('input_references');
  });

  it('refuses a first frame and reference images together before billing or egress', async () => {
    process.env['OPENROUTER_API_KEY'] = 'openrouter-test-secret';

    const response = await POST(
      imageInputRequest({
        first_frame_image: { b64_json: ONE_PIXEL_PNG_B64 },
        reference_images: [{ b64_json: ONE_PIXEL_PNG_B64 }],
      }),
    );

    expect(response.status).toBe(400);
    expect(managedUsageMocks.reserve).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('refuses images for a video model whose catalog entry does not take them', async () => {
    process.env['OPENROUTER_API_KEY'] = 'openrouter-test-secret';
    modelCatalogMocks.imageInputWithdrawn = true;

    const response = await POST(
      imageInputRequest({ reference_images: [{ b64_json: ONE_PIXEL_PNG_B64 }] }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: expect.stringContaining('cannot take input images') },
    });
    expect(managedUsageMocks.reserve).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('refuses an image that is not a readable picture before billing or egress', async () => {
    process.env['OPENROUTER_API_KEY'] = 'openrouter-test-secret';

    const response = await POST(
      imageInputRequest({
        reference_images: [{ b64_json: Buffer.from('<svg onload=alert(1)>').toString('base64') }],
      }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'invalid_input_image', param: 'reference_images.0' },
    });
    expect(managedUsageMocks.reserve).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('refuses a denylisted image before billing or egress', async () => {
    process.env['OPENROUTER_API_KEY'] = 'openrouter-test-secret';
    process.env['MODERATION_HASH_DENYLIST'] = createHash('sha256')
      .update(Buffer.from(ONE_PIXEL_PNG_B64, 'base64'))
      .digest('hex');

    const response = await POST(
      imageInputRequest({ first_frame_image: { b64_json: ONE_PIXEL_PNG_B64 } }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'content_policy_violation', param: 'first_frame_image' },
    });
    expect(managedUsageMocks.reserve).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('refuses more images than the contract carries', async () => {
    process.env['OPENROUTER_API_KEY'] = 'openrouter-test-secret';

    const response = await POST(
      imageInputRequest({
        reference_images: Array.from({ length: IMAGE_INPUT_LIMIT + 1 }, () => ({
          b64_json: ONE_PIXEL_PNG_B64,
        })),
      }),
    );

    expect(response.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
