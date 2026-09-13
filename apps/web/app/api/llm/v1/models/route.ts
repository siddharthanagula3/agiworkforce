import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb, type UserScopedDb } from '@/lib/server/rls-db';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { getCorsHeaders } from '@/lib/cors';
import { getAllowedAutoModesForTier } from '@shared/config/llm';
import {
  ANONYMOUS_PLAN_TIER,
  buildCatalogueEntries,
  type CatalogueEntry,
} from '@/lib/server/model-catalogue';
import {
  effectivePlanTier,
  getMinimumRequiredTier,
  getPickerModelsForRuntimeProfile,
  normalizeSubscriptionAccessTier,
  resolveMaxOutputTokens,
} from '@agiworkforce/types';
import { isApiKeyScopeError } from '@/lib/api-key-scope-error';
import { isMfaRequiredError } from '@/lib/mfa-policy-gate';
import { isIpNotAllowedError } from '@/lib/ip-allow-list-gate';

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
};

const CREATED_AT_TIMESTAMP = 1_704_067_200;
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
  };
}

async function getVisibleModelsForTier(userTier: string): Promise<OpenAiCompatibleModel[]> {
  const surfaceModelIds = new Set(
    getPickerModelsForRuntimeProfile(SURFACE_RUNTIME_PROFILE, {
      modelTypes: [...MODEL_TYPES],
    }).map((model) => model.id),
  );
  const entries = await buildCatalogueEntries(userTier);

  return entries
    .filter((entry) => entry.admitted && surfaceModelIds.has(entry.id))
    .map(toModelRecord)
    .filter((model): model is OpenAiCompatibleModel => Boolean(model));
}

async function listModelsForRequest(request: NextRequest, userTier: string) {
  const visibleModels = await getVisibleModelsForTier(userTier);

  return NextResponse.json(
    {
      object: 'list',
      data: visibleModels,
      x_agi_workforce: {
        user_tier: normalizeSubscriptionAccessTier(userTier),
        total_available: visibleModels.length,
        allowed_auto_modes: getAllowedAutoModesForTier(userTier),
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
    return listModelsForRequest(request, ANONYMOUS_PLAN_TIER);
  }

  const subscription = await SubscriptionService.getSubscription(scoped.db, scoped.userId);
  return listModelsForRequest(
    request,
    effectivePlanTier(subscription?.plan_tier, subscription?.status),
  );
}

export const GET = withErrorHandler(handleListModels);

export function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}
