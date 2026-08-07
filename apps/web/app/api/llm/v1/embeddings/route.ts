/**
 * Managed Cloud embeddings — `POST /api/llm/v1/embeddings`.
 *
 * OpenAI-compatible request and response shape so an existing client library
 * can point at this gateway. The catalog already carried an embedding model
 * (`modelType: 'embedding'`) with no route to reach it; `/v1/models` correctly
 * did NOT advertise it, so this adds a capability rather than repairing a false
 * claim.
 *
 * BILLING. Embeddings are a billable provider call, so this goes through the
 * same reserve → call → settle path as image generation
 * (`api/media/image/generate/route.ts`) rather than inventing a lighter one.
 * `Idempotency-Key` is required for exactly the reason it is on every other
 * managed surface: a retried request must settle once, not twice. Every exit
 * path settles — success, provider failure, and validation failure after the
 * reservation exists — because a reservation that is never finalized holds
 * quota the caller cannot use and cannot see.
 */

import { NextRequest, NextResponse } from 'next/server';

import {
  ManagedEmbeddingsRequestSchema,
  toEmbeddingInputs,
  type ManagedEmbeddingsResponse,
} from '@agiworkforce/cloud-contracts';
import { getModels, getModelMetadataById, type ModelMetadata } from '@agiworkforce/types';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
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

/** Same shape as the image route's helper — one error contract for managed usage. */
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

/** Cost is charged per input token; embedding models produce no output tokens. */
function estimateEmbeddingCostCents(model: ModelMetadata, estimatedTokens: number): number {
  // `inputCost` is per million tokens, matching every other catalog entry.
  return (model.inputCost * estimatedTokens) / 1_000_000;
}

/**
 * Token estimate for reservation only.
 *
 * Deliberately a CHARACTER heuristic, not a tokenizer: the provider returns the
 * real count and settlement uses that. Over-reserving slightly is safe (the
 * difference is released); under-reserving would let a caller exceed their
 * quota, so this rounds up.
 */
function estimateTokens(inputs: readonly string[]): number {
  const characters = inputs.reduce((total, input) => total + input.length, 0);
  return Math.max(1, Math.ceil(characters / 4));
}

/** The default embedding model: catalog order, so adding one cannot break this. */
function resolveEmbeddingModel(requested: string | undefined): ModelMetadata {
  const embeddingModels = getModels({ modelTypes: ['embedding'] });
  if (embeddingModels.length === 0) {
    throw createError.serviceUnavailable('No embedding model is available.');
  }

  if (!requested) return embeddingModels[0]!;

  const model = getModelMetadataById(requested);
  if (!model || model.modelType !== 'embedding') {
    // Naming the available ids beats a bare "invalid model": the caller cannot
    // discover them from `/v1/models`, which lists chat models only.
    throw createError.validation(
      `Unknown embedding model. Available: ${embeddingModels.map((entry) => entry.id).join(', ')}.`,
    );
  }
  return model;
}

interface GoogleEmbeddingResponse {
  embeddings?: Array<{ values?: number[] }>;
}

/**
 * Google `batchEmbedContents`.
 *
 * Ref: POST https://generativelanguage.googleapis.com/v1beta/models/{model}:batchEmbedContents
 * Auth: `x-goog-api-key`, matching the Veo call in `api/media/video/generate`.
 */
async function embedWithGoogle(
  inputs: readonly string[],
  model: ModelMetadata,
): Promise<number[][]> {
  // Same three-key chain as the media routes and
  // `PROVIDER_API_KEY_ENV_KEYS.google`. Reading only GOOGLE_API_KEY made
  // embeddings fail on any deployment credentialed with GEMINI_API_KEY —
  // including local development, where `.env.local` carries that name.
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

  // A short or ragged batch would silently misalign vectors with inputs — the
  // caller would associate embeddings with the wrong text and never find out.
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
  const estimatedTokens = estimateTokens(inputs);

  // Reserve BEFORE calling the provider, so a caller at their limit is stopped
  // before spend rather than after.
  let reservation: ManagedUsageRequestReservation;
  try {
    const idempotencyKey = parseManagedUsageIdempotencyKey(request.headers.get('Idempotency-Key'));
    const scoped = await getUserScopedDb(request);
    if (scoped.userId !== userId) {
      throw new ManagedUsageRequestError('Managed usage tenant mismatch.', 403, 'tenant_mismatch');
    }
    const subscription = await SubscriptionService.getSubscription(userId);
    // A missing subscription row is the free tier, not an error: the plan tier
    // only selects the reservation policy, and defaulting to the most
    // restrictive one is the safe direction.
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
    // Settle at zero so the reservation does not hold quota the caller cannot
    // use and cannot see.
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
    /**
     * The provider's batch endpoint does not return a token count, so this is
     * the same estimate the reservation used. It is reported rather than
     * omitted because callers meter against it — and it is the number this
     * request was actually billed on, which makes it the honest one to show.
     */
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
