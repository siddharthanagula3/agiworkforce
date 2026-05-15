import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { LLMProviderFactory } from '@/lib/llm-providers/factory';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { getAuthenticatedUser } from '@/lib/api-auth';
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

  // Rate limiting - use the default bucket to avoid hammering providers
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  // Auth — getAuthenticatedUser handles Bearer + cookie flows and uses the
  // service-role client only for JWT verification (never for DB ops).
  const user = await getAuthenticatedUser(request);

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
          error: `Provider "${providerKey}" is not configured - missing API key on server`,
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
    // SECURITY (web subtle-issue #6, audit 2026-05-04): the previous
    // implementation echoed the full provider-SDK error message back to the
    // client. Provider errors frequently embed the raw HTTP response body,
    // which may contain internal endpoint URLs, model-specific quota text,
    // partial header values, or other operational detail that has no business
    // landing in a UI surface. We keep the full message in the server log
    // (useful for ops triage) but return only a coarse-grained classification
    // and a numeric status to the caller.
    const lowered = message.toLowerCase();
    let clientError: string;
    if (
      lowered.includes('401') ||
      lowered.includes('unauthorized') ||
      lowered.includes('invalid api key')
    ) {
      clientError = 'Provider rejected the configured API key (401)';
    } else if (lowered.includes('403') || lowered.includes('forbidden')) {
      clientError = 'Provider denied the request (403). Check tier or region access.';
    } else if (lowered.includes('429') || lowered.includes('rate limit')) {
      clientError = 'Provider rate limit reached (429). Try again shortly.';
    } else if (
      lowered.includes('timeout') ||
      lowered.includes('etimedout') ||
      lowered.includes('econnreset')
    ) {
      clientError = 'Provider unreachable — network timeout';
    } else if (lowered.includes('econnrefused')) {
      clientError = 'Provider unreachable — connection refused';
    } else if (lowered.includes('quota') || lowered.includes('insufficient')) {
      clientError = 'Provider quota exhausted on configured key';
    } else {
      clientError = 'Provider test failed — see server logs for details';
    }
    logger.warn(
      { provider: providerKey, model: probeModel, userId: user.id, error: message },
      'Provider test failed',
    );

    return NextResponse.json(
      {
        success: false,
        provider: providerKey,
        error: clientError,
      },
      { status: 502 },
    );
  }
}

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

export const POST = withErrorHandler(handleTestProvider);
