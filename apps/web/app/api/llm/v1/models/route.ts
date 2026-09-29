import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withAdmittedRateLimitHeaders } from '@/lib/rate-limit-headers';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb, type UserScopedDb } from '@/lib/server/rls-db';
import { resolveEntitledPlanTier } from '@/lib/services/entitlement-resolution';
import { getCorsHeaders } from '@/lib/cors';
import { getAllowedAutoModesForTier } from '@shared/config/llm';
import { modelRegistry } from '@agiworkforce/model-registry';
import { ROUTING_PROFILE_CHOICE_OPTIONS } from '@agiworkforce/types';
import {
  ANONYMOUS_PLAN_TIER,
  buildCatalogueEntries,
  type CatalogueEntry,
} from '@/lib/server/model-catalogue';
import {
  getMinimumRequiredTier,
  getModelMetadataById,
  getPickerModelsForRuntimeProfile,
  getRegistryRoute,
  normalizeSubscriptionAccessTier,
  resolveMaxOutputTokens,
} from '@agiworkforce/types';
import { readKillSwitchGate, type KillSwitchGate } from '@/lib/feature-flags/capability-gate';
import { buildFlagSubject } from '@/lib/feature-flags/flag-evaluation-service';
import { isApiKeyScopeError } from '@/lib/api-key-scope-error';
import { isMfaRequiredError } from '@/lib/mfa-policy-gate';
import { isIpNotAllowedError } from '@/lib/ip-allow-list-gate';
import { isAccountUnavailableError } from '@/lib/api-auth';
import { isPasskeyRequiredError } from '@/lib/server/account-security/gate';
import { acceptedRequestParameters } from '../chat/completions/lib/request-parameters';

type OpenAiCompatibleModel = {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
  permission: [];
  root: string;
  parent: null;
  /**
   * The lowest plan that can actually run this model. `'free'` is reported for
   * the models a free account may run; before, every economy model reported
   * `'basic'`, so a caller on the free plan was told that a model it could run
   * right now required an upgrade.
   */
  tier: 'free' | 'basic' | 'pro' | 'max';
  context_window: number;
  max_output: number;
  capabilities: Record<string, boolean | null>;
  deprecation_date: string | null;
  image_detail?: string[];
  request_parameters: string[];
};

const PUBLISHED_CAPABILITIES = {
  image_input: 'imageInput',
  audio_input: 'audioInput',
  video_input: 'videoInput',
  structured_output: 'structuredOutput',
  function_calling: 'functionCalling',
  reasoning: 'reasoning',
} as const;

function publishedCapabilities(modelId: string): Record<string, boolean | null> {
  const record = (
    modelRegistry.capabilities as Readonly<Record<string, Readonly<Record<string, boolean | null>>>>
  )[modelId];
  return Object.fromEntries(
    Object.entries(PUBLISHED_CAPABILITIES).map(([name, source]) => [
      name,
      record?.[source] ?? null,
    ]),
  );
}

const CREATED_AT_TIMESTAMP = 1_704_067_200;
const ANONYMOUS_FLAG_SUBJECT_ID = 'anonymous';
const MODEL_TYPES = ['chat', 'code', 'reasoning', 'multimodal', 'search'] as const;
const SURFACE_RUNTIME_PROFILE = 'web/cloud-chat';

function toModelRecord(model: CatalogueEntry): OpenAiCompatibleModel | null {
  const tier = getMinimumRequiredTier(model.id);
  const contextWindow = model.contextTokens;
  if (
    !tier ||
    typeof contextWindow !== 'number' ||
    !Number.isFinite(contextWindow) ||
    contextWindow <= 0
  ) {
    return null;
  }

  const imageDetail = getModelMetadataById(model.id)?.imageInput?.detailValues;
  const servingRoute = model.routes.find((route) => route.isDefault) ?? model.routes[0];
  const servingHarnessId = servingRoute ? getRegistryRoute(servingRoute.routeId)?.harnessId : null;
  return {
    id: model.id,
    object: 'model',
    created: CREATED_AT_TIMESTAMP,
    owned_by: model.provider,
    permission: [],
    root: model.id,
    parent: null,
    tier,
    context_window: contextWindow,
    max_output: resolveMaxOutputTokens(model.id),
    capabilities: publishedCapabilities(model.id),
    deprecation_date: model.deprecatedOn,
    ...(imageDetail ? { image_detail: [...imageDetail] } : {}),
    request_parameters: servingHarnessId
      ? acceptedRequestParameters(model.id, servingHarnessId)
      : [],
  };
}

interface VisibleModels {
  available: OpenAiCompatibleModel[];
  temporarilyUnavailable: string[];
}

/**
 * A model is served only while its own switch and at least one of its routes'
 * provider switches are open. Both are flags, so taking a model or a whole
 * provider out of every client's picker is a flip an operator makes here, not a
 * catalogue edit followed by a release of six surfaces.
 */
function killSwitchClosedFor(entry: CatalogueEntry, gate: KillSwitchGate): boolean {
  if (!gate.modelAllowed(entry.id)) return true;
  return entry.routes.every((route) => !gate.providerAllowed(route.provider));
}

async function getVisibleModelsForTier(
  userTier: string,
  gate: KillSwitchGate,
): Promise<VisibleModels> {
  const surfaceModelIds = new Set(
    getPickerModelsForRuntimeProfile(SURFACE_RUNTIME_PROFILE, {
      modelTypes: [...MODEL_TYPES],
    }).map((model) => model.id),
  );
  const entries = await buildCatalogueEntries(userTier);
  const available: OpenAiCompatibleModel[] = [];
  const temporarilyUnavailable: string[] = [];
  for (const entry of entries) {
    if (!entry.admitted || !surfaceModelIds.has(entry.id)) continue;
    if (killSwitchClosedFor(entry, gate)) continue;
    const record = toModelRecord(entry);
    if (!record) continue;
    if (entry.temporarilyUnavailable) temporarilyUnavailable.push(record.id);
    else available.push(record);
  }
  return { available, temporarilyUnavailable };
}

async function listModelsForRequest(request: NextRequest, userTier: string, userId: string) {
  const gate = await readKillSwitchGate(
    buildFlagSubject(request, {
      userId,
      workspaceId: null,
      role: null,
      plan: normalizeSubscriptionAccessTier(userTier),
      surface: null,
    }),
  );
  const { available, temporarilyUnavailable } = await getVisibleModelsForTier(userTier, gate);

  return NextResponse.json(
    {
      object: 'list',
      data: available,
      x_agi_workforce: {
        user_tier: normalizeSubscriptionAccessTier(userTier),
        total_available: available.length,
        allowed_auto_modes: getAllowedAutoModesForTier(userTier),
        routing_profiles: ROUTING_PROFILE_CHOICE_OPTIONS.map(({ choice, label, description }) => ({
          id: choice,
          label,
          description,
        })),
        temporarily_unavailable: temporarilyUnavailable,
      },
    },
    {
      headers: getCorsHeaders(request),
    },
  );
}

async function handleListModels(request: NextRequest) {
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: getCorsHeaders(request),
    });
  }

  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  const presentedAuthorization = request.headers.has('authorization');
  let scoped: UserScopedDb;
  try {
    scoped = await getUserScopedDb(request, { apiKeyScope: 'models:read' });
  } catch (error) {
    if (isMfaRequiredError(error)) {
      return NextResponse.json(
        { error: { message: error.message, type: 'invalid_request_error', code: 'mfa_required' } },
        { status: 403, headers: getCorsHeaders(request) },
      );
    }
    if (isIpNotAllowedError(error)) {
      return NextResponse.json(
        {
          error: { message: error.message, type: 'invalid_request_error', code: 'ip_not_allowed' },
        },
        { status: 403, headers: getCorsHeaders(request) },
      );
    }
    if (isPasskeyRequiredError(error)) {
      return NextResponse.json(
        {
          error: {
            message: error.message,
            type: 'invalid_request_error',
            code: 'passkey_required',
            // The step-up and recovery link read these, as they do from the
            // chat gateway's refusal.
            ...(error.details ? { details: error.details } : {}),
          },
        },
        { status: 403, headers: getCorsHeaders(request) },
      );
    }
    if (isAccountUnavailableError(error)) {
      return NextResponse.json(
        {
          error: {
            message: error.message,
            type: 'invalid_request_error',
            code: 'account_unavailable',
            // The step-up and recovery link read these, as they do from the
            // chat gateway's refusal.
            ...(error.details ? { details: error.details } : {}),
          },
        },
        { status: 403, headers: getCorsHeaders(request) },
      );
    }
    if (presentedAuthorization) {
      const insufficientScope = isApiKeyScopeError(error);
      return NextResponse.json(
        {
          error: {
            message: insufficientScope
              ? 'API key does not have the required scope'
              : 'Invalid authentication token',
            type: 'invalid_request_error',
            code: insufficientScope ? 'insufficient_scope' : 'invalid_api_key',
          },
        },
        { status: insufficientScope ? 403 : 401, headers: getCorsHeaders(request) },
      );
    }
    return listModelsForRequest(request, ANONYMOUS_PLAN_TIER, ANONYMOUS_FLAG_SUBJECT_ID);
  }

  return listModelsForRequest(
    request,
    await resolveEntitledPlanTier(scoped.db, scoped.userId),
    scoped.userId,
  );
}

export const GET = withAdmittedRateLimitHeaders(withErrorHandler(handleListModels));

export function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}
