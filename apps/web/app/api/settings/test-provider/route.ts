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

/**
 * Maps provider names from the settings UI to internal provider IDs
 * and a lightweight probe model for each.
 */
const PROVIDER_PROBE: Record<string, { provider: string; model: string }> = {
  OpenAI: { provider: 'openai', model: 'gpt-5.4-nano' },
  Anthropic: { provider: 'anthropic', model: 'claude-haiku-4-5' },
  Google: { provider: 'google', model: 'gemini-2.0-flash' },
  Perplexity: { provider: 'perplexity', model: 'sonar' },
  Grok: { provider: 'xai', model: 'grok-4' },
  DeepSeek: { provider: 'deepseek', model: 'deepseek-chat' },
  Qwen: { provider: 'qwen', model: 'qwen-flash' },
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

  const probe = PROVIDER_PROBE[providerKey];
  if (!probe) {
    throw createError.badRequest(`Unknown provider: ${providerKey}`);
  }

  // Send a minimal test completion to verify the provider is reachable
  try {
    const llmProvider = LLMProviderFactory.createProvider(probe.provider);

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
      model: probe.model,
      messages: [{ role: 'user', content: 'Reply with the single word: OK' }],
      max_tokens: 10,
      temperature: 0,
      stream: false,
    });

    logger.info(
      { provider: providerKey, model: probe.model, userId: user.id },
      'Provider test succeeded',
    );

    return NextResponse.json({
      success: true,
      provider: providerKey,
      model: probe.model,
      message: 'Provider is reachable and responding correctly',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(
      { provider: providerKey, model: probe.model, userId: user.id, error: message },
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
