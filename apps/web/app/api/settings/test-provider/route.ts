import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import {
  buildServerProviderAdapter,
  toApiModelId,
  toGenericUpstreamError,
} from '@/lib/services/provider-adapter-service';
import { drainToLlmResponse } from '@/app/api/llm/v1/chat/completions/lib/adapter-response';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { getClerkAuthUser } from '@/lib/api-auth';
import {
  buildManagedComputeGateResponse,
  buildOrganizationPolicyGateResponse,
} from '@/lib/managed-compute-gate';
import { resolveCloudChatSurface } from '@/lib/free-chat-surface-policy';
import { getProviderProbeModel, normalizeModelId, type Provider } from '@agiworkforce/types';
import { openAIWireRequestToChatRequest } from '@agiworkforce/provider-protocol';

const SETTINGS_PROVIDER_ALIASES: Record<string, Provider> = {
  anthropic: 'anthropic',
  claude: 'anthropic',
  deepseek: 'deepseek',
  gemini: 'google',
  glm: 'zhipu',
  google: 'google',
  grok: 'xai',
  kimi: 'moonshot',
  moonshot: 'moonshot',
  openai: 'openai',
  perplexity: 'perplexity',
  qwen: 'qwen',
  'x.ai': 'xai',
  xai: 'xai',
  zhipu: 'zhipu',
};

function normalizeSettingsProvider(input: string): Provider | null {
  const key = input
    .trim()
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9.]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

  return (
    SETTINGS_PROVIDER_ALIASES[key] ?? SETTINGS_PROVIDER_ALIASES[key.replace(/\s+/g, '')] ?? null
  );
}

async function handleTestProvider(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw createError.badRequest('Invalid JSON in request body');
  }

  const providerKey =
    typeof body === 'object' && body !== null
      ? (body as { provider?: unknown }).provider
      : undefined;

  if (!providerKey || typeof providerKey !== 'string') {
    throw createError.badRequest('provider is required');
  }

  const provider = normalizeSettingsProvider(providerKey);
  if (!provider) {
    throw createError.badRequest(`Unknown provider: ${providerKey}`);
  }
  const probeModel = normalizeModelId(getProviderProbeModel(provider));
  if (!probeModel) {
    throw createError.badRequest(`No probe model configured for provider: ${providerKey}`);
  }

  const managedGateResponse = buildManagedComputeGateResponse(request, {
    provider,
    model: probeModel,
    feature: 'provider_probe',
  });
  if (managedGateResponse) return managedGateResponse;

  const policyGateResponse = await buildOrganizationPolicyGateResponse(userId, request, {
    provider,
    model: probeModel,
    feature: 'provider_probe',
    surface: resolveCloudChatSurface(request),
  });
  if (policyGateResponse) return policyGateResponse;

  try {
    const adapter = buildServerProviderAdapter(provider);
    const chatRequest = openAIWireRequestToChatRequest({
      model: toApiModelId(probeModel),
      messages: [{ role: 'user', content: 'Reply with the single word: OK' }],
      max_tokens: 10,
      temperature: 0,
      stream: false,
    });
    await drainToLlmResponse(adapter.stream(chatRequest, request.signal), probeModel, (chunk) =>
      toGenericUpstreamError(provider, chunk),
    );

    logger.info({ provider, model: probeModel, userId }, 'Provider test succeeded');

    return NextResponse.json({
      success: true,
      provider,
      model: probeModel,
      message: 'Provider is reachable and responding correctly',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const lowered = message.toLowerCase();
    let clientError: string;
    if (lowered.includes('is not configured')) {
      clientError = `Provider "${providerKey}" is not configured - missing API key on server`;
    } else if (
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
      clientError = 'Provider unreachable · network timeout';
    } else if (lowered.includes('econnrefused')) {
      clientError = 'Provider unreachable · connection refused';
    } else if (lowered.includes('quota') || lowered.includes('insufficient')) {
      clientError = 'Provider quota exhausted on configured key';
    } else {
      clientError = 'Provider test failed · see server logs for details';
    }
    logger.warn(
      { provider: providerKey, model: probeModel, userId: userId, error: message },
      'Provider test failed',
    );

    return NextResponse.json(
      {
        success: false,
        provider,
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
