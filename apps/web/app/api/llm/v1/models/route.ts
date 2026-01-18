import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { getCorsHeaders } from '@/lib/cors';

/**
 * OpenAI-compatible Models List API
 * Endpoint: GET /v1/models (via api.agiworkforce.com)
 */

// Available models with their metadata
const MODELS = [
  // OpenAI Models
  {
    id: 'gpt-5.2',
    object: 'model',
    created: 1704067200,
    owned_by: 'openai',
    permission: [],
    root: 'gpt-5.2',
    parent: null,
    tier: 'hobby',
    context_window: 128000,
    max_output: 16384,
  },
  {
    id: 'gpt-5.2-pro',
    object: 'model',
    created: 1704067200,
    owned_by: 'openai',
    permission: [],
    root: 'gpt-5.2-pro',
    parent: null,
    tier: 'pro',
    context_window: 256000,
    max_output: 32768,
  },
  {
    id: 'gpt-5-nano',
    object: 'model',
    created: 1704067200,
    owned_by: 'openai',
    permission: [],
    root: 'gpt-5-nano',
    parent: null,
    tier: 'hobby',
    context_window: 128000,
    max_output: 16384,
  },
  {
    id: 'gpt-5',
    object: 'model',
    created: 1704067200,
    owned_by: 'openai',
    permission: [],
    root: 'gpt-5',
    parent: null,
    tier: 'max',
    context_window: 256000,
    max_output: 65536,
  },
  {
    id: 'o3',
    object: 'model',
    created: 1704067200,
    owned_by: 'openai',
    permission: [],
    root: 'o3',
    parent: null,
    tier: 'max',
    context_window: 200000,
    max_output: 100000,
  },
  {
    id: 'o3-mini',
    object: 'model',
    created: 1704067200,
    owned_by: 'openai',
    permission: [],
    root: 'o3-mini',
    parent: null,
    tier: 'max',
    context_window: 200000,
    max_output: 65536,
  },

  // Anthropic Models
  {
    id: 'claude-opus-4-5',
    object: 'model',
    created: 1704067200,
    owned_by: 'anthropic',
    permission: [],
    root: 'claude-opus-4-5',
    parent: null,
    tier: 'max',
    context_window: 200000,
    max_output: 32000,
  },
  {
    id: 'claude-sonnet-4-5',
    object: 'model',
    created: 1704067200,
    owned_by: 'anthropic',
    permission: [],
    root: 'claude-sonnet-4-5',
    parent: null,
    tier: 'hobby',
    context_window: 200000,
    max_output: 16000,
  },
  {
    id: 'claude-sonnet-4',
    object: 'model',
    created: 1704067200,
    owned_by: 'anthropic',
    permission: [],
    root: 'claude-sonnet-4',
    parent: null,
    tier: 'pro',
    context_window: 200000,
    max_output: 16000,
  },
  {
    id: 'claude-haiku-4-5',
    object: 'model',
    created: 1704067200,
    owned_by: 'anthropic',
    permission: [],
    root: 'claude-haiku-4-5',
    parent: null,
    tier: 'hobby',
    context_window: 200000,
    max_output: 8192,
  },

  // Google Models
  {
    id: 'gemini-3-pro',
    object: 'model',
    created: 1704067200,
    owned_by: 'google',
    permission: [],
    root: 'gemini-3-pro',
    parent: null,
    tier: 'hobby',
    context_window: 2000000,
    max_output: 8192,
  },
  {
    id: 'gemini-3-flash',
    object: 'model',
    created: 1704067200,
    owned_by: 'google',
    permission: [],
    root: 'gemini-3-flash',
    parent: null,
    tier: 'hobby',
    context_window: 1000000,
    max_output: 8192,
  },
  {
    id: 'gemini-2.5-pro',
    object: 'model',
    created: 1704067200,
    owned_by: 'google',
    permission: [],
    root: 'gemini-2.5-pro',
    parent: null,
    tier: 'max',
    context_window: 1000000,
    max_output: 65536,
  },
  {
    id: 'gemini-2.5-flash',
    object: 'model',
    created: 1704067200,
    owned_by: 'google',
    permission: [],
    root: 'gemini-2.5-flash',
    parent: null,
    tier: 'hobby',
    context_window: 1000000,
    max_output: 8192,
  },

  // DeepSeek Models
  {
    id: 'deepseek-chat',
    object: 'model',
    created: 1704067200,
    owned_by: 'deepseek',
    permission: [],
    root: 'deepseek-chat',
    parent: null,
    tier: 'hobby',
    context_window: 64000,
    max_output: 8192,
  },
  {
    id: 'deepseek-reasoner',
    object: 'model',
    created: 1704067200,
    owned_by: 'deepseek',
    permission: [],
    root: 'deepseek-reasoner',
    parent: null,
    tier: 'hobby',
    context_window: 64000,
    max_output: 8192,
  },

  // xAI/Grok Models
  {
    id: 'grok-4.1',
    object: 'model',
    created: 1704067200,
    owned_by: 'xai',
    permission: [],
    root: 'grok-4.1',
    parent: null,
    tier: 'hobby',
    context_window: 131072,
    max_output: 16384,
  },
  {
    id: 'grok-4.1-fast',
    object: 'model',
    created: 1704067200,
    owned_by: 'xai',
    permission: [],
    root: 'grok-4.1-fast',
    parent: null,
    tier: 'hobby',
    context_window: 131072,
    max_output: 16384,
  },

  // Qwen Models
  {
    id: 'qwen-max',
    object: 'model',
    created: 1704067200,
    owned_by: 'alibaba',
    permission: [],
    root: 'qwen-max',
    parent: null,
    tier: 'hobby',
    context_window: 32000,
    max_output: 8192,
  },
  {
    id: 'qwen-turbo',
    object: 'model',
    created: 1704067200,
    owned_by: 'alibaba',
    permission: [],
    root: 'qwen-turbo',
    parent: null,
    tier: 'hobby',
    context_window: 128000,
    max_output: 8192,
  },
  {
    id: 'qwen-flash',
    object: 'model',
    created: 1704067200,
    owned_by: 'alibaba',
    permission: [],
    root: 'qwen-flash',
    parent: null,
    tier: 'hobby',
    context_window: 128000,
    max_output: 8192,
  },

  // Moonshot/Kimi Models
  {
    id: 'kimi-k2',
    object: 'model',
    created: 1704067200,
    owned_by: 'moonshot',
    permission: [],
    root: 'kimi-k2',
    parent: null,
    tier: 'hobby',
    context_window: 128000,
    max_output: 8192,
  },

  // Perplexity Models
  {
    id: 'sonar-pro',
    object: 'model',
    created: 1704067200,
    owned_by: 'perplexity',
    permission: [],
    root: 'sonar-pro',
    parent: null,
    tier: 'hobby',
    context_window: 200000,
    max_output: 8192,
  },
  {
    id: 'sonar',
    object: 'model',
    created: 1704067200,
    owned_by: 'perplexity',
    permission: [],
    root: 'sonar',
    parent: null,
    tier: 'hobby',
    context_window: 128000,
    max_output: 8192,
  },
];

// Tier hierarchy
const TIER_LEVELS: Record<string, number> = {
  free: 0,
  hobby: 1,
  pro: 2,
  max: 3,
  enterprise: 4,
};

function filterModelsByTier(models: typeof MODELS, userTier: string) {
  const userLevel = TIER_LEVELS[userTier.toLowerCase()] || 0;

  return models.filter((model) => {
    const modelLevel = TIER_LEVELS[model.tier] || 0;
    return modelLevel <= userLevel;
  });
}

async function handleListModels(request: NextRequest) {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: getCorsHeaders(request),
    });
  }

  // Rate limiting
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  // Authentication
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Return all models without filtering for unauthenticated requests
    return NextResponse.json(
      {
        object: 'list',
        data: MODELS,
      },
      {
        headers: getCorsHeaders(request),
      },
    );
  }

  const token = authHeader.substring(7);

  // Verify user with Supabase
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseAnonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, flowType: 'pkce' },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    // Return all models for invalid tokens too
    return NextResponse.json(
      {
        object: 'list',
        data: MODELS,
      },
      {
        headers: getCorsHeaders(request),
      },
    );
  }

  // Get subscription to filter models by tier
  const subscription = await SubscriptionService.getSubscription(user.id);
  const userTier = subscription?.plan_tier || 'free';

  const filteredModels = filterModelsByTier(MODELS, userTier);

  return NextResponse.json(
    {
      object: 'list',
      data: filteredModels,
      x_agi_workforce: {
        user_tier: userTier,
        total_available: filteredModels.length,
      },
    },
    {
      headers: getCorsHeaders(request),
    },
  );
}

export const GET = withErrorHandler(handleListModels);
export const OPTIONS = handleListModels;
