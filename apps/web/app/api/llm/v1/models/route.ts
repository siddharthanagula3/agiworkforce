import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb, type UserScopedDb } from '@/lib/server/rls-db';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { getCorsHeaders } from '@/lib/cors';
import { getAllowedAutoModesForTier } from '@shared/config/llm';
import { FREE_TRIAL_MODELS } from '@/lib/free-trial-config';
import {
  effectivePlanTier,
  getMinimumRequiredTier,
  getModelsForTierAndSurface,
  getPickerModelsForRuntimeProfile,
  normalizeSubscriptionAccessTier,
  type PickerModelView,
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
  tier: 'basic' | 'pro' | 'max';
  context_window: number;
  max_output: number;
};

const CREATED_AT_TIMESTAMP = 1_704_067_200;
const MODEL_TYPES = ['chat', 'code', 'reasoning', 'multimodal', 'search'] as const;
const FREE_MODEL_IDS = new Set(FREE_TRIAL_MODELS);

function toModelRecord(model: PickerModelView): OpenAiCompatibleModel | null {
  const tier = getMinimumRequiredTier(model.id);
  const contextWindow = model.contextWindow;
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
    max_output: model.maxOutput,
  };
}

function getVisibleModelsForTier(userTier: string): OpenAiCompatibleModel[] {
  const normalizedTier = normalizeSubscriptionAccessTier(userTier);
  const pickerOptions = { modelTypes: [...MODEL_TYPES] };
  const models =
    normalizedTier === 'free'
      ? getPickerModelsForRuntimeProfile('web/cloud-chat', pickerOptions).filter((model) =>
          FREE_MODEL_IDS.has(model.id),
        )
      : getModelsForTierAndSurface(normalizedTier, 'web/cloud-chat', pickerOptions);

  return models
    .map(toModelRecord)
    .filter((model): model is OpenAiCompatibleModel => Boolean(model));
}

async function listModelsForRequest(request: NextRequest, userTier: string) {
  const visibleModels = getVisibleModelsForTier(userTier);

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
    return listModelsForRequest(request, 'free');
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
