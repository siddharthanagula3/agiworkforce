import 'server-only';

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { LIVE_VOICE_CLIENT_HANDOFFS } from '@agiworkforce/cloud-contracts';
import { requireEnv } from '@shared/utils/env';
import { getClerkAuthUser } from '@/lib/api-auth';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import {
  buildManagedComputeGateResponse,
  buildOrganizationPolicyGateResponse,
  buildSpendLimitGateResponse,
  buildModelPolicyGateResponse,
} from '@/lib/managed-compute-gate';
import { resolveCloudChatSurface } from '@/lib/free-chat-surface-policy';
import { isAppError } from '@/lib/errors';
import { connectorsAllowedForTurn } from '@/lib/connectors/connector-capability';
import { assertCapabilityAvailable } from '@/lib/feature-flags/capability-gate';
import { buildFlagSubject } from '@/lib/feature-flags/flag-evaluation-service';
import {
  getModelMetadataById,
  getRoutingSlotModel,
  getTierPolicy,
  isModelLive,
} from '@agiworkforce/types';
import {
  GOOGLE_USER_DATA_VOICE_MESSAGE,
  storedConversationCarriesGoogleUserData,
} from '@/lib/connectors/google-user-data';
import { modelKeepsInputsOutOfTraining } from '@/lib/server/provider-training-opt-out';
import { isManagedProviderId, providerApiUrl } from '@/lib/server/provider-endpoints';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { resolveEntitlementBundle } from '@/lib/services/entitlement-resolution';
import { readWorkspaceWebDomainPolicy } from '@/lib/services/connector-policy-service';
import {
  ManagedUsageRequestError,
  fingerprintManagedUsageRequest,
  finalizeManagedUsageRequest,
  markManagedUsageProviderStarted,
  reserveManagedUsageRequest,
  type ManagedUsageRequestReservation,
} from '@/lib/services/managed-usage-request-service';
import { managedUsageIdempotencyKey } from '@/lib/services/managed-usage-idempotency';
import { assertTierUnitAllowance } from '@/lib/services/tier-unit-quota-service';
import {
  buildManagedComputeAccessGateResponse,
  evaluateManagedComputeSubscriptionAccess,
} from '@/lib/services/managed-compute-access';
import {
  LIVE_VOICE_BACKEND_INSTRUCTIONS,
  LIVE_VOICE_INSTRUCTIONS,
} from '@/lib/voice/live-voice-prompts';
import { isLiveVoice, LIVE_DEFAULT_VOICE } from '@features/chat/lib/live-voices';
import { loadToolApprovalPolicy } from '@/app/api/llm/v1/chat/completions/lib/tool-approval-policy';
import {
  describeDelegationTools,
  describeLiveVoiceTools,
  formatLiveVoiceApprovalNotice,
  formatWithheldLiveVoiceTools,
  LIVE_VOICE_SITE_RULES_NOTICE,
  resolveLiveVoiceDelegationTools,
  resolveLiveVoiceFunctionTools,
  type LiveVoiceFunctionTools,
} from '@/lib/voice/live-voice-tools';
import {
  describeLiveSessionFailure,
  LIVE_SESSION_CEILING_SECONDS,
  LIVE_SESSION_MIN_BLOCK_SECONDS,
  LIVE_VOICE_FEATURE,
  liveSessionChargeMicrousd,
  liveSessionMinutes,
} from '@/lib/voice/live-voice-billing';
import {
  planVoiceSessionBlock,
  voiceJsonError,
  voiceUsageErrorResponse,
  type VoiceLimitResets,
} from './lib/voice-session-budget';
import {
  buildLiveVoiceBackendInstructions,
  buildLiveVoiceInstructions,
  EMPTY_LIVE_VOICE_CONTEXT,
  loadLiveVoiceContext,
  type LiveVoiceContextBundle,
} from './lib/live-voice-context';
import {
  clampVoicePace,
  closeExpiredVoiceSessions,
  createVoiceSession,
  isVoiceSessionStoreReady,
  VOICE_PACE_DEFAULT,
  VOICE_PACE_MAX,
  VOICE_PACE_MIN,
  type VoiceSessionSurface,
} from './lib/voice-session-store';

const LIVE_SESSION_LEASE_SECONDS = 4 * 60 * 60;
const VOICE_LIVE_SESSION_NAMESPACE = 'agi.voice.live';
const SESSION_CREATE_TIMEOUT_MS = 20_000;
const OPENAI_KEY_ENV = 'OPENAI_API_KEY';
const MAX_SDP_LENGTH = 65_536;

const CreateLiveSessionSchema = z.object({
  sdp: z.string().min(1).max(MAX_SDP_LENGTH),
  voice: z.string().min(1).max(64).nullable().optional(),
  conversationId: z.string().min(1).max(128).nullable().optional(),
  language: z.string().min(2).max(32).nullable().optional(),
  pace: z.number().min(VOICE_PACE_MIN).max(VOICE_PACE_MAX).optional(),
  surface: z.enum(['web', 'mobile', 'desktop']).optional(),
  clientHandoffs: z
    .array(z.enum(LIVE_VOICE_CLIENT_HANDOFFS))
    .max(LIVE_VOICE_CLIENT_HANDOFFS.length)
    .optional(),
});

function upstreamErrorCode(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { code?: string; type?: string } };
    return parsed.error?.code ?? parsed.error?.type ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

async function handleCreateLiveSession(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  if (preflightResponse) return preflightResponse;
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;
  const rateLimitResponse = await withRateLimit(request, 'voice-live-session');
  if (rateLimitResponse) return rateLimitResponse;
  const { userId } = await getClerkAuthUser(request);

  const liveModel = getModelMetadataById(getRoutingSlotModel('voice_live'));
  const backendModel = getModelMetadataById(getRoutingSlotModel('voice_live_backend'));
  if (!liveModel || !isModelLive(liveModel) || !backendModel || !isModelLive(backendModel)) {
    throw new Error('The voice_live routing slots do not resolve to live models');
  }
  const provider = String(liveModel.provider);
  if (!isManagedProviderId(provider)) {
    throw new Error(`The voice_live slot resolves to an unmanaged provider: ${provider}`);
  }

  const gateHeaders = { ...getCorsHeaders(request), ...getSecurityHeaders() };
  const managedGateResponse = buildManagedComputeGateResponse(
    request,
    { provider, model: liveModel.id, feature: LIVE_VOICE_FEATURE },
    gateHeaders,
  );
  if (managedGateResponse) return managedGateResponse;
  const policyGateResponse = await buildOrganizationPolicyGateResponse(
    userId,
    request,
    {
      provider,
      model: liveModel.id,
      feature: LIVE_VOICE_FEATURE,
      surface: resolveCloudChatSurface(request),
    },
    gateHeaders,
  );
  if (policyGateResponse) return policyGateResponse;
  const spendGateResponse = await buildSpendLimitGateResponse(userId);
  if (spendGateResponse) return spendGateResponse;
  const modelPolicyResponse = await buildModelPolicyGateResponse(
    userId,
    request,
    { provider, modelId: liveModel.id },
    gateHeaders,
  );
  if (modelPolicyResponse) return modelPolicyResponse;
  let body: z.infer<typeof CreateLiveSessionSchema>;
  try {
    body = CreateLiveSessionSchema.parse(await request.json());
  } catch {
    return voiceJsonError(request, 400, 'invalid_request', 'A WebRTC offer is required.');
  }

  let apiKey: string;
  try {
    apiKey = requireEnv(OPENAI_KEY_ENV);
  } catch {
    logger.error({ event: 'live_voice_not_configured' }, `${OPENAI_KEY_ENV} is not set`);
    return voiceJsonError(
      request,
      503,
      'live_voice_not_configured',
      `${OPENAI_KEY_ENV} is not set on the server, so live voice cannot start.`,
    );
  }

  const scoped = await getUserScopedDb(request);
  if (scoped.userId !== userId) {
    return voiceUsageErrorResponse(
      request,
      new ManagedUsageRequestError('Managed usage tenant mismatch.', 403, 'tenant_mismatch'),
    );
  }

  const conversationId = body.conversationId;
  if (!conversationId) {
    return voiceJsonError(
      request,
      400,
      'voice_conversation_required',
      'Live voice needs a conversation to record the session in.',
    );
  }
  if (
    !(
      modelKeepsInputsOutOfTraining(liveModel.id) && modelKeepsInputsOutOfTraining(backendModel.id)
    ) &&
    (await storedConversationCarriesGoogleUserData(
      scoped.db,
      userId,
      scoped.organizationId,
      conversationId,
    ))
  ) {
    return voiceJsonError(request, 403, 'model_may_train', GOOGLE_USER_DATA_VOICE_MESSAGE);
  }
  let storeReady = false;
  try {
    storeReady = await isVoiceSessionStoreReady(scoped.db);
  } catch (error) {
    logger.error(
      { event: 'voice_session_store_unreadable', error, userId },
      'Voice session store readiness could not be determined',
    );
  }
  if (!storeReady) {
    return voiceJsonError(
      request,
      503,
      'voice_session_not_recorded',
      'The voice session could not be saved, so it was not started and nothing was charged. Try again.',
    );
  }

  const voice = isLiveVoice(body.voice) ? body.voice : LIVE_DEFAULT_VOICE;
  const language = body.language?.trim() ? body.language.trim() : null;
  const pace = clampVoicePace(body.pace ?? VOICE_PACE_DEFAULT);
  const surface: VoiceSessionSurface = body.surface ?? 'web';

  // One offer is one session attempt: a client retrying the same POST sends the
  // same SDP, and a user deliberately starting another session negotiates a
  // fresh peer connection and therefore a different one. The header outranks it
  // so a client that names its own retries is taken at its word.
  const sessionIdentity = {
    operation: 'voice_live_session',
    model: liveModel.id,
    conversationId,
    voice,
    language,
    pace,
    surface,
    offer: body.sdp,
  };

  if (liveSessionChargeMicrousd(LIVE_SESSION_CEILING_SECONDS, liveModel.id) === null) {
    logger.error(
      { event: 'live_voice_unpriced', model: liveModel.id },
      'The live voice model declares no session rate, so its minutes cannot be charged',
    );
    return voiceJsonError(
      request,
      503,
      'live_voice_unpriced',
      'Live voice is unavailable right now.',
    );
  }
  let reservation: ManagedUsageRequestReservation;
  let planTier: string | null = null;
  let limitResets: VoiceLimitResets | undefined;
  let ceilingSeconds = LIVE_SESSION_MIN_BLOCK_SECONDS;
  let estimatedCostMicrousd = 0;
  try {
    const entitlement = await resolveEntitlementBundle(scoped.db, userId);
    const subscriptionAccess = await evaluateManagedComputeSubscriptionAccess(
      scoped.db,
      userId,
      entitlement.subscription,
    );
    if (!subscriptionAccess.allowed) {
      const gateResponse = buildManagedComputeAccessGateResponse(subscriptionAccess, gateHeaders);
      if (gateResponse) return gateResponse;
    }
    planTier = entitlement.plan;
    await assertCapabilityAvailable(
      buildFlagSubject(request, {
        userId,
        workspaceId: scoped.organizationId,
        role: null,
        plan: planTier,
        surface: resolveCloudChatSurface(request),
      }),
      'canUseVoice',
      'Voice',
    );
    if (!getTierPolicy(planTier).allowVoice) {
      return voiceJsonError(
        request,
        403,
        'voice_not_in_plan',
        'Voice conversations are not included in your plan.',
      );
    }
    const block = await planVoiceSessionBlock({
      db: scoped.db,
      userId,
      planTier,
      catalogVersion: entitlement.catalogVersion,
      modelId: liveModel.id,
    });
    limitResets = block.resetsAt;
    ceilingSeconds = Math.max(block.blockSeconds, LIVE_SESSION_MIN_BLOCK_SECONDS);
    estimatedCostMicrousd = liveSessionChargeMicrousd(ceilingSeconds, liveModel.id) ?? 0;
    await assertTierUnitAllowance({
      db: scoped.db,
      userId,
      planTier,
      unit: 'voice_minutes',
      requestedUnits: liveSessionMinutes(ceilingSeconds),
    });
    reservation = await reserveManagedUsageRequest({
      db: scoped.db,
      userId,
      idempotencyKey: managedUsageIdempotencyKey({
        namespace: VOICE_LIVE_SESSION_NAMESPACE,
        suppliedKey: request.headers.get('idempotency-key'),
        identity: sessionIdentity,
      }),
      requestHash: fingerprintManagedUsageRequest(sessionIdentity),
      provider,
      model: liveModel.id,
      estimatedCostMicrousd,
      leaseSeconds: LIVE_SESSION_LEASE_SECONDS,
      planTier,
      isFlagship: false,
      quotaFeature: LIVE_VOICE_FEATURE,
    });
  } catch (error) {
    if (isAppError(error)) throw error;
    if (error instanceof ManagedUsageRequestError) {
      return voiceUsageErrorResponse(request, error, limitResets);
    }
    logger.error(
      { event: 'live_voice_reservation_failed', error, userId, model: liveModel.id },
      'Live voice reservation failed before any provider spend',
    );
    return voiceUsageErrorResponse(
      request,
      new ManagedUsageRequestError(
        'Managed usage billing is temporarily unavailable.',
        503,
        'billing_unavailable',
      ),
    );
  }

  const releaseReservation = async (reason: string): Promise<void> => {
    try {
      await finalizeManagedUsageRequest({
        ...reservation,
        outcome: 'failed',
        actualCostMicrousd: 0,
        usage: { operation: 'voice_live_session', provider, model: liveModel.id, reason },
      });
    } catch (settlementError) {
      logger.error(
        {
          event: 'live_voice_refund_settlement_unrecorded',
          error: settlementError,
          userId,
          idempotencyKey: reservation.idempotencyKey,
        },
        'Live voice failure settlement could not be persisted',
      );
    }
  };

  const functionToolsLoad = connectorsAllowedForTurn(request, userId, {
    organizationId: scoped.organizationId,
    subscriptionTier: planTier ?? undefined,
    chatSurface: resolveCloudChatSurface(request),
  })
    .then((connectorsAllowed) =>
      resolveLiveVoiceFunctionTools({
        db: scoped.db,
        userId,
        organizationId: scoped.organizationId,
        planTier,
        backendModel,
        connectorsAllowed,
        clientHandoffs: body.clientHandoffs ?? [],
      }),
    )
    .catch((error: unknown): LiveVoiceFunctionTools => {
      logger.error(
        { event: 'live_voice_function_tools_failed', error, userId },
        'Live voice function tools could not be loaded; starting with hosted tools only',
      );
      return { tools: [], names: [] };
    });

  let context: LiveVoiceContextBundle = EMPTY_LIVE_VOICE_CONTEXT;
  try {
    context = await loadLiveVoiceContext(scoped.db, {
      userId,
      conversationId,
      organizationId: scoped.organizationId,
      onSourceFailure: (source, error) => {
        logger.warn(
          { event: 'live_voice_context_source_failed', source, error, userId },
          'Live voice context source unavailable; continuing without it',
        );
      },
    });
  } catch (error) {
    logger.error(
      { event: 'live_voice_context_failed', error, userId, conversationId },
      'Live voice context load failed; starting the session without prior context',
    );
  }

  const [toolApprovalPolicy, webDomainPolicy] = await Promise.all([
    loadToolApprovalPolicy(scoped.db, userId),
    readWorkspaceWebDomainPolicy(scoped.db, scoped.organizationId),
  ]);
  const delegation = resolveLiveVoiceDelegationTools(backendModel, toolApprovalPolicy, {
    hostedSearch: webDomainPolicy === null,
  });
  const hostedToolIds = describeDelegationTools(delegation.tools);
  const withheldNotice = formatWithheldLiveVoiceTools(delegation.withheld, toolApprovalPolicy);
  let functionTools = await functionToolsLoad;

  const requestProviderSession = (offered: LiveVoiceFunctionTools): Promise<Response> => {
    const toolNotice =
      [
        withheldNotice,
        webDomainPolicy ? LIVE_VOICE_SITE_RULES_NOTICE : null,
        formatLiveVoiceApprovalNotice(offered.names),
      ]
        .filter((notice): notice is string => Boolean(notice))
        .join('\n\n') || null;
    return fetch(providerApiUrl(provider, 'live/sessions'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session: {
          model: liveModel.apiModelId ?? liveModel.id,
          instructions: buildLiveVoiceInstructions(LIVE_VOICE_INSTRUCTIONS, context, {
            language,
            toolNotice,
          }),
          audio: {
            output: { voice, speed: pace },
            ...(language ? { input: { transcription: { language } } } : {}),
          },
          delegation: {
            type: 'responses',
            responses: {
              model: backendModel.apiModelId ?? backendModel.id,
              instructions: buildLiveVoiceBackendInstructions(
                LIVE_VOICE_BACKEND_INSTRUCTIONS,
                context,
                { toolNotice },
              ),
              tools: [...delegation.tools, ...offered.tools],
              tool_choice: 'auto',
            },
          },
        },
        transport: { type: 'webrtc', sdp: body.sdp },
      }),
      signal: AbortSignal.timeout(SESSION_CREATE_TIMEOUT_MS),
    });
  };

  let response: Response;
  let responseText: string;
  try {
    await markManagedUsageProviderStarted(reservation);
    response = await requestProviderSession(functionTools);
    responseText = await response.text();
    if (response.status === 400 && functionTools.names.length > 0) {
      logger.warn(
        {
          event: 'live_voice_function_tools_rejected',
          upstreamCode: upstreamErrorCode(responseText),
          body: responseText,
          functionTools: functionTools.names.length,
        },
        'The live voice provider rejected the function tools; retrying with hosted tools only',
      );
      functionTools = { tools: [], names: [] };
      response = await requestProviderSession(functionTools);
      responseText = await response.text();
    }
  } catch (error) {
    await releaseReservation('provider_unreachable');
    throw error;
  }
  const offeredToolIds = [...hostedToolIds, ...functionTools.names];

  if (!response.ok) {
    const upstreamCode = upstreamErrorCode(responseText);
    logger.warn(
      {
        event: 'live_voice_session_rejected',
        status: response.status,
        upstreamCode,
        body: responseText,
      },
      'Live voice session creation failed',
    );
    await releaseReservation('provider_failed');
    const failure = describeLiveSessionFailure(response.status, upstreamCode);
    return voiceJsonError(request, failure.status, failure.code, failure.message, {
      upstreamStatus: response.status,
      upstreamCode,
    });
  }

  let created: { session?: { id?: string }; transport?: { sdp?: string } };
  try {
    created = JSON.parse(responseText) as typeof created;
  } catch {
    created = {};
  }
  const sessionId = created.session?.id;
  const answer = created.transport?.sdp;
  if (!sessionId || !answer) {
    await releaseReservation('provider_malformed');
    return voiceJsonError(
      request,
      502,
      'live_voice_malformed',
      'The live voice service answered without a session.',
    );
  }

  await closeExpiredVoiceSessions({
    db: scoped.db,
    userId,
    maxOpenSeconds: LIVE_SESSION_CEILING_SECONDS,
  }).catch((error: unknown) => {
    logger.warn(
      { event: 'voice_session_expiry_failed', error, userId },
      'Expired voice sessions could not be closed',
    );
    return 0;
  });
  let record: Awaited<ReturnType<typeof createVoiceSession>> = null;
  try {
    record = await createVoiceSession({
      db: scoped.db,
      userId,
      organizationId: scoped.organizationId,
      conversationId,
      provider,
      providerSessionId: sessionId,
      modelId: liveModel.id,
      surface,
      voice,
      language,
      pace,
      activeTools: offeredToolIds,
    });
  } catch (error) {
    logger.error(
      { event: 'voice_session_not_persisted', error, userId, sessionId },
      'Live voice session could not be recorded',
    );
  }
  if (!record) {
    await releaseReservation('voice_session_not_recorded');
    return voiceJsonError(
      request,
      503,
      'voice_session_not_recorded',
      'The voice session could not be saved, so it was not started and nothing was charged. Try again.',
    );
  }
  const voiceSessionId = record.id;

  logger.info(
    {
      userId,
      provider,
      model: liveModel.id,
      sessionId,
      voiceSessionId,
      estimatedCostMicrousd,
      contextTurns: context.turns.length,
      contextProject: context.projectPrompt !== null,
      contextMemory: context.memoryPrompt !== null,
      toolApprovalPolicy,
      withheldTools: delegation.withheld.map((tool) => tool.id),
      functionTools: functionTools.names.length,
    },
    'Live voice session created',
  );
  return NextResponse.json(
    {
      sessionId,
      sdp: answer,
      voiceSessionId,
      settings: { voice, language, pace },
      tools: describeLiveVoiceTools(offeredToolIds),
      settlement: {
        idempotencyKey: reservation.idempotencyKey,
        leaseToken: reservation.leaseToken,
        requestHash: reservation.requestHash,
        ceilingSeconds,
      },
    },
    { status: 201, headers: { ...getCorsHeaders(request), ...getSecurityHeaders() } },
  );
}

export const POST = withErrorHandler(handleCreateLiveSession);

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, {
      status: 204,
      headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
    })
  );
}
