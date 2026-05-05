import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireEnv } from '@/utils/env';
import { getUserClient } from '@/lib/supabase-server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { getCorsHeaders } from '@/lib/cors';
import {
  getAllowedAutoModesForTier,
  getAllowedModelsForTier,
  normalizeSubscriptionTier,
} from '@/constants/llm';
import { listCanonicalModels, type ModelMetadata } from '@agiworkforce/types';

type OpenAiCompatibleModel = {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
  permission: [];
  root: string;
  parent: null;
  tier: 'hobby' | 'pro' | 'max';
  context_window: number;
  max_output: number;
};

const VISIBLE_MODEL_TYPES = new Set(['chat', 'code', 'reasoning', 'multimodal', 'search']);
const CREATED_AT_TIMESTAMP = 1_704_067_200;

const ECONOMY_MODELS = new Set(getAllowedModelsForTier('hobby'));
const PRO_MODELS = new Set(getAllowedModelsForTier('pro'));
const MAX_MODELS = new Set(getAllowedModelsForTier('max'));

function getTierForModel(modelId: string): OpenAiCompatibleModel['tier'] | null {
  if (ECONOMY_MODELS.has(modelId)) {
    return 'hobby';
  }
  if (MAX_MODELS.has(modelId) && !PRO_MODELS.has(modelId)) {
    return 'max';
  }
  if (PRO_MODELS.has(modelId)) {
    return 'pro';
  }
  return null;
}

function toModelRecord(model: ModelMetadata): OpenAiCompatibleModel | null {
  if (model.status === 'deprecated' || !VISIBLE_MODEL_TYPES.has(model.modelType)) {
    return null;
  }

  const tier = getTierForModel(model.id);
  if (!tier) {
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
    context_window: model.contextWindow,
    max_output: model.maxOutputTokens ?? 8192,
  };
}

const MODELS: OpenAiCompatibleModel[] = listCanonicalModels()
  .map(toModelRecord)
  .filter((model): model is OpenAiCompatibleModel => Boolean(model));

function getVisibleModelsForTier(userTier: string): OpenAiCompatibleModel[] {
  const normalizedTier = normalizeSubscriptionTier(userTier);
  const allowedModels = new Set(getAllowedModelsForTier(normalizedTier));
  return MODELS.filter((model) => allowedModels.has(model.id));
}

async function listModelsForRequest(request: NextRequest, userTier: string) {
  const visibleModels = getVisibleModelsForTier(userTier);

  return NextResponse.json(
    {
      object: 'list',
      data: visibleModels,
      x_agi_workforce: {
        user_tier: normalizeSubscriptionTier(userTier),
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

  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return listModelsForRequest(request, 'free');
  }

  const token = authHeader.substring(7);
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabase = createClient(supabaseUrl, requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return listModelsForRequest(request, 'free');
  }

  const subscription = await SubscriptionService.getSubscription(getUserClient(token), user.id);
  return listModelsForRequest(request, subscription?.plan_tier || 'free');
}

export const GET = withErrorHandler(handleListModels);

export function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}
