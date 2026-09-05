import { NextRequest, NextResponse } from 'next/server';

import {
  ManagedEmbeddingsRequestSchema,
  toEmbeddingInputs,
  type ManagedEmbeddingsResponse,
} from '@agiworkforce/cloud-contracts';
import {
  getModels,
  getModelMetadataById,
  resolveEffectiveModelPricingForInputTokens,
  type ModelMetadata,
  type PricedModel,
} from '@agiworkforce/types';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import {
  buildManagedComputeGateResponse,
  buildOrganizationPolicyGateResponse,
  buildSpendLimitGateResponse,
  buildModelPolicyGateResponse,
} from '@/lib/managed-compute-gate';
import { resolveCloudChatSurface } from '@/lib/free-chat-surface-policy';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getCorsHeaders, getSecurityHeaders, handleCorsPreflightRequest } from '@/lib/cors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { requireCurrentUserId } from '@/lib/server/neon-chat';
import {
  ManagedUsageRequestError,
  createManagedUsageErrorBody,
  finalizeManagedUsageRequest,
  fingerprintManagedUsageRequest,
  parseManagedUsageIdempotencyKey,
  reserveManagedUsageRequest,
  type ManagedUsageRequestReservation,
} from '@/lib/services/managed-usage-request-service';
import { SubscriptionService } from '@/lib/services/subscription-service';

function managedUsageErrorResponse(
  request: NextRequest,
  error: ManagedUsageRequestError,
): NextResponse {
  return NextResponse.json(
    createManagedUsageErrorBody(
      error,
      error.status === 402 || error.status === 429 ? 'insufficient_quota' : 'invalid_request_error',
    ),
    {
      status: error.status,
      headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
    },
  );
}

export function estimateEmbeddingCostCents(
  model: PricedModel,
  estimatedTokens: number,
  pricedAt: Date = new Date(),
): number {
  const inputRate = resolveEffectiveModelPricingForInputTokens(
    model,
    pricedAt,
    estimatedTokens,
  ).inputCost;
  const costDollars = (inputRate * estimatedTokens) / 1_000_000;
  return costDollars > 0 ? Math.max(1, Math.ceil(costDollars * 100)) : 0;
}

function estimateTokens(inputs: readonly string[]): number {
  const characters = inputs.reduce((total, input) => total + input.length, 0);
  return Math.max(1, Math.ceil(characters / 4));
}

function resolveEmbeddingModel(requested: string | undefined): ModelMetadata {
  const embeddingModels = getModels({ modelTypes: ['embedding'] });
  if (embeddingModels.length === 0) {
    throw createError.serviceUnavailable('No embedding model is available.');
  }

  if (!requested) return embeddingModels[0]!;

  const model = getModelMetadataById(requested);
  if (!model || model.modelType !== 'embedding') {
    throw createError.validation(
      `Unknown embedding model. Available: ${embeddingModels.map((entry) => entry.id).join(', ')}.`,
    );
  }
  return model;
}

interface GoogleEmbeddingResponse {
  embeddings?: Array<{ values?: number[] }>;
}

async function embedWithGoogle(
  inputs: readonly string[],
  model: ModelMetadata,
): Promise<number[][]> {
  const apiKey =
    process.env['GOOGLE_API_KEY'] ??
    process.env['GOOGLE_AI_API_KEY'] ??
    process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    throw createError.serviceUnavailable('Embeddings are not configured on this deployment.');
  }

  const providerModelId = model.apiModelId ?? model.id;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${providerModelId}:batchEmbedContents`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        requests: inputs.map((text) => ({
          model: `models/${providerModelId}`,
          content: { parts: [{ text }] },
        })),
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    logger.error(
      { status: response.status, body: body.slice(0, 500), model: providerModelId },
      'Embedding provider call failed',
    );
    throw createError.serviceUnavailable('The embedding provider rejected the request.');
  }

  const payload = (await response.json()) as GoogleEmbeddingResponse;
  const vectors = payload.embeddings?.map((entry) => entry.values ?? []) ?? [];

  if (vectors.length !== inputs.length || vectors.some((vector) => vector.length === 0)) {
    throw createError.serviceUnavailable(
      'The embedding provider returned an incomplete result set.',
    );
  }
  return vectors;
}

async function handleEmbeddings(request: NextRequest): Promise<Response> {
  const userId = await requireCurrentUserId(request);

  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse)
    return NextResponse.json(await rateLimitResponse.json(), {
      status: rateLimitResponse.status,
      headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
    });

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Request body must be JSON.');
  }

  const parsed = ManagedEmbeddingsRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw createError.validation('Invalid embeddings request', parsed.error);
  }

  const inputs = toEmbeddingInputs(parsed.data.input);
  const model = resolveEmbeddingModel(parsed.data.model);
  const managedGateResponse = buildManagedComputeGateResponse(
    request,
    { provider: model.provider, model: model.id, feature: 'embeddings' },
    { ...getCorsHeaders(request), ...getSecurityHeaders() },
  );
  if (managedGateResponse) return managedGateResponse;

  const policyGateResponse = await buildOrganizationPolicyGateResponse(
    userId,
    request,
    {
      provider: model.provider,
      model: model.id,
      feature: 'embeddings',
      surface: resolveCloudChatSurface(request),
    },
    { ...getCorsHeaders(request), ...getSecurityHeaders() },
  );
  if (policyGateResponse) return policyGateResponse;

  // The workspace budget, checked before any credit is reserved so a turn
  // that a spend cap will refuse never spends anything first.
  const spendGateResponse = await buildSpendLimitGateResponse(userId, request);
  if (spendGateResponse) return spendGateResponse;

  const modelPolicyResponse = await buildModelPolicyGateResponse(
    userId,
    request,
    { provider: String(model.provider), modelId: model.id },
    { ...getCorsHeaders(request), ...getSecurityHeaders() },
  );
  if (modelPolicyResponse) return modelPolicyResponse;

  const estimatedTokens = estimateTokens(inputs);

  let reservation: ManagedUsageRequestReservation;
  try {
    const idempotencyKey = parseManagedUsageIdempotencyKey(request.headers.get('Idempotency-Key'));
    const scoped = await getUserScopedDb(request);
    if (scoped.userId !== userId) {
      throw new ManagedUsageRequestError('Managed usage tenant mismatch.', 403, 'tenant_mismatch');
    }
    const subscription = await SubscriptionService.getSubscription(scoped.db, userId);
    reservation = await reserveManagedUsageRequest({
      db: scoped.db,
      userId,
      idempotencyKey,
      requestHash: fingerprintManagedUsageRequest(parsed.data),
      provider: model.provider,
      model: model.id,
      estimatedCostCents: estimateEmbeddingCostCents(model, estimatedTokens),
      planTier: subscription?.plan_tier ?? 'free',
      isFlagship: false,
    });
  } catch (error) {
    const managedError =
      error instanceof ManagedUsageRequestError
        ? error
        : new ManagedUsageRequestError(
            'Managed usage billing is temporarily unavailable.',
            503,
            'billing_unavailable',
          );
    return managedUsageErrorResponse(request, managedError);
  }

  let vectors: number[][];
  try {
    vectors = await embedWithGoogle(inputs, model);
  } catch (error) {
    await finalizeManagedUsageRequest({
      ...reservation,
      outcome: 'failed',
      actualCostCents: 0,
      usage: { type: 'embeddings', model: model.id, inputs: inputs.length },
    }).catch((releaseError) => {
      logger.error({ releaseError, userId }, 'Failed to release embeddings reservation');
    });
    throw error;
  }

  const actualCostCents = estimateEmbeddingCostCents(model, estimatedTokens);
  await finalizeManagedUsageRequest({
    ...reservation,
    outcome: 'completed',
    actualCostCents,
    usage: {
      type: 'embeddings',
      model: model.id,
      inputs: inputs.length,
      promptTokens: estimatedTokens,
    },
  });

  const body: ManagedEmbeddingsResponse = {
    object: 'list',
    data: vectors.map((embedding, index) => ({
      object: 'embedding' as const,
      index,
      embedding,
    })),
    model: model.id,
    usage: { prompt_tokens: estimatedTokens, total_tokens: estimatedTokens },
  };

  return NextResponse.json(body, {
    headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
  });
}

export const POST = withErrorHandler(handleEmbeddings);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
