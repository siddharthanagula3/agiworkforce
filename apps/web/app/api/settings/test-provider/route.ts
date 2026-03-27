import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { LLMProviderFactory } from '@/lib/llm-providers/factory';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { getProviderProbeModel, normalizeModelId, type Provider } from '@agiworkforce/types';

/**
 * Maps provider names from the settings UI to internal provider IDs.
 */
const SETTINGS_PROVIDER_MAP: Record<string, Provider> = {
  OpenAI: 'openai',
  Anthropic: 'anthropic',
  Google: 'google',
  Perplexity: 'perplexity',
  Grok: 'xai',
  DeepSeek: 'deepseek',
  Qwen: 'qwen',
};

async function handleTestProvider(request: NextRequest) {
  // CSRF protection
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  // Rate limiting — use the default bucket to avoid hammering providers
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  // Auth
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw createError.unauthorized('Missing or invalid authorization header');
  }
  const token = authHeader.substring(7);

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabase = createClient(supabaseUrl, requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    throw createError.unauthorized('Invalid authentication token');
  }

  // Parse body
  const body = (await request.json()) as { provider?: string };
  const providerKey = body.provider;

  if (!providerKey || typeof providerKey !== 'string') {
    throw createError.badRequest('provider is required');
  }

  const provider = SETTINGS_PROVIDER_MAP[providerKey];
  if (!provider) {
    throw createError.badRequest(`Unknown provider: ${providerKey}`);
  }
  const probeModel = normalizeModelId(getProviderProbeModel(provider));
  if (!probeModel) {
    throw createError.badRequest(`No probe model configured for provider: ${providerKey}`);
  }

  // Send a minimal test completion to verify the provider is reachable
  try {
    const llmProvider = LLMProviderFactory.createProvider(provider);

    if (!llmProvider) {
      return NextResponse.json(
        {
          success: false,
          provider: providerKey,
          error: `Provider "${providerKey}" is not configured — missing API key on server`,
        },
        { status: 502 },
      );
    }

    await llmProvider.sendRequest({
      model: probeModel,
      messages: [{ role: 'user', content: 'Reply with the single word: OK' }],
      max_tokens: 10,
      temperature: 0,
      stream: false,
    });

    logger.info(
      { provider: providerKey, model: probeModel, userId: user.id },
      'Provider test succeeded',
    );

    return NextResponse.json({
      success: true,
      provider: providerKey,
      model: probeModel,
      message: 'Provider is reachable and responding correctly',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(
      { provider: providerKey, model: probeModel, userId: user.id, error: message },
      'Provider test failed',
    );

    return NextResponse.json(
      {
        success: false,
        provider: providerKey,
        error: message,
      },
      { status: 502 },
    );
  }
}

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

export const POST = withErrorHandler(handleTestProvider);
