import 'server-only';

import { createHash, randomUUID } from 'node:crypto';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  RETRIEVAL_EMBEDDING_DIMENSIONS,
  type EmbeddingPurpose,
} from '@agiworkforce/data-layer/search';
import { MAX_EMBEDDING_INPUTS, MAX_EMBEDDING_INPUT_CHARS } from '@agiworkforce/cloud-contracts';
import {
  createVercelGatewayEmbeddings,
  VercelGatewayEmbeddingError,
} from '@agiworkforce/providers-factory';
import {
  getModelMetadataById,
  getRegistryRoute,
  getRoutingSlotModel,
  listManagedRoutesForModel,
  resolveEffectiveModelPricingForInputTokens,
  type ModelMetadata,
  type PricedModel,
} from '@agiworkforce/types';

import type { UsageAttribution } from '@/lib/billing/usage-attribution';
import { logger } from '@/lib/logger';
import { embedTextsWithGoogle, GoogleEmbeddingError } from '@/lib/server/google-embeddings';
import { evaluateManagedComputeAccess } from '@/lib/services/managed-compute-access';
import {
  finalizeManagedUsageRequest,
  fingerprintManagedUsageRequest,
  markManagedUsageProviderStarted,
  reserveManagedUsageRequest,
} from '@/lib/services/managed-usage-request-service';
import {
  listAvailableManagedProviderIds,
  resolveServerProviderCredentials,
} from '@/lib/services/provider-adapter-service';
import { SubscriptionService } from '@/lib/services/subscription-service';

const EMBEDDING_SLOT = 'embedding_default';
const EMBEDDING_LEASE_SECONDS = 120;
const MICROUSD_PER_USD = 1_000_000;
const CHARS_PER_TOKEN_ESTIMATE = 4;
const MICROUSD_PER_LEDGER_CENT = 10_000;

function operationDigest(operationKey: string): string {
  return createHash('sha256').update(operationKey).digest('hex').slice(0, 32);
}

/**
 * What was sent to the provider, not how much of it. A count and a character
 * total call two different queries of the same length one request, so a key
 * that arrived twice for genuinely different text would be reused rather than
 * refused as a conflict.
 */
function inputDigest(texts: readonly string[]): string {
  const hash = createHash('sha256');
  for (const text of texts) hash.update(String(text.length)).update(':').update(text);
  return hash.digest('hex');
}

type EmbeddingHarness = 'vercel_gateway/embeddings' | 'google/embeddings';

const EMBEDDING_HARNESSES: ReadonlySet<string> = new Set<EmbeddingHarness>([
  'vercel_gateway/embeddings',
  'google/embeddings',
]);

export interface RetrievalEmbeddingRoute {
  routeId: string;
  provider: string;
  harnessId: EmbeddingHarness;
  providerModelId: string;
  model: ModelMetadata;
}

export type RetrievalEmbeddingFailureCode =
  'no_route' | 'not_entitled' | 'billing_refused' | 'provider_failed';

export class RetrievalEmbeddingError extends Error {
  constructor(
    message: string,
    readonly code: RetrievalEmbeddingFailureCode,
  ) {
    super(message);
    this.name = 'RetrievalEmbeddingError';
  }
}

export function resolveRetrievalEmbeddingRoute(
  availableProviders: ReadonlySet<string> = listAvailableManagedProviderIds(),
): RetrievalEmbeddingRoute | null {
  const modelId = getRoutingSlotModel(EMBEDDING_SLOT);
  const model = getModelMetadataById(modelId);
  if (!model || model.modelType !== 'embedding') return null;
  for (const route of listManagedRoutesForModel(modelId)) {
    const registryRoute = getRegistryRoute(route.routeId);
    if (!registryRoute || !EMBEDDING_HARNESSES.has(registryRoute.harnessId)) continue;
    if (!availableProviders.has(route.provider)) continue;
    return {
      routeId: route.routeId,
      provider: route.provider,
      harnessId: registryRoute.harnessId as EmbeddingHarness,
      providerModelId: route.providerModelId,
      model,
    };
  }
  return null;
}

export function estimateEmbeddingTokens(texts: readonly string[]): number {
  const characters = texts.reduce((total, text) => total + text.length, 0);
  return Math.max(1, Math.ceil(characters / CHARS_PER_TOKEN_ESTIMATE));
}

export function estimateEmbeddingCostMicrousd(
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
  return costDollars > 0 ? Math.max(1, Math.ceil(costDollars * MICROUSD_PER_USD)) : 0;
}

export function estimateEmbeddingCostCents(
  model: PricedModel,
  estimatedTokens: number,
  pricedAt: Date = new Date(),
): number {
  return Math.ceil(
    estimateEmbeddingCostMicrousd(model, estimatedTokens, pricedAt) / MICROUSD_PER_LEDGER_CENT,
  );
}

async function callEmbeddingRoute(
  route: RetrievalEmbeddingRoute,
  texts: readonly string[],
): Promise<{ vectors: number[][]; promptTokens: number | null }> {
  const credentials = resolveServerProviderCredentials(route.provider);
  if (!credentials) {
    throw new RetrievalEmbeddingError('The embedding route has no credentials.', 'no_route');
  }
  if (route.harnessId === 'vercel_gateway/embeddings') {
    return createVercelGatewayEmbeddings(credentials).embed({
      model: route.providerModelId,
      input: texts,
      dimensions: RETRIEVAL_EMBEDDING_DIMENSIONS,
    });
  }
  const vectors = await embedTextsWithGoogle({
    apiKey: credentials.apiKey,
    providerModelId: route.providerModelId,
    inputs: texts,
    dimensions: RETRIEVAL_EMBEDDING_DIMENSIONS,
  });
  return { vectors, promptTokens: null };
}

export interface MeteredEmbeddingInput {
  db: DatabaseAdapter;
  userId: string;
  organizationId: string | null;
  texts: readonly string[];
  purpose: EmbeddingPurpose;
  /**
   * What names one embedding operation. The reservation's idempotency key is
   * derived from it, so a caller that repeats an operation deliberately must
   * supply a different one, and a caller retrying the same operation must
   * supply the one it used before. Today's callers name a scope rather than an
   * operation, which is why the key still carries a per-call suffix.
   */
  operationKey: string;
  attribution?: UsageAttribution;
}

export interface MeteredEmbeddingResult {
  vectors: number[][];
  model: string;
  routeId: string;
}

/**
 * One billed embedding call: entitlement, reservation, provider call and
 * settlement, so an index write or a search query costs the user exactly what
 * the ledger records and the provider cost lands in the COGS ledger.
 */
export async function embedTextsMetered(
  input: MeteredEmbeddingInput,
): Promise<MeteredEmbeddingResult> {
  if (input.texts.length === 0) {
    throw new RetrievalEmbeddingError('Nothing to embed.', 'provider_failed');
  }
  if (input.texts.length > MAX_EMBEDDING_INPUTS) {
    throw new RetrievalEmbeddingError('Too many inputs for one embedding call.', 'provider_failed');
  }
  const texts = input.texts.map((text) => text.slice(0, MAX_EMBEDDING_INPUT_CHARS));

  const route = resolveRetrievalEmbeddingRoute();
  if (!route) {
    throw new RetrievalEmbeddingError('No embedding route is configured.', 'no_route');
  }

  const subscription = await SubscriptionService.getSubscription(input.db, input.userId);
  const access = await evaluateManagedComputeAccess(input.db, input.userId, subscription, 'web', {
    organizationId: input.organizationId,
  });
  if (!access.allowed) {
    throw new RetrievalEmbeddingError(access.reason, 'not_entitled');
  }

  const estimatedTokens = estimateEmbeddingTokens(texts);
  let reservation: Awaited<ReturnType<typeof reserveManagedUsageRequest>>;
  try {
    reservation = await reserveManagedUsageRequest({
      db: input.db,
      userId: input.userId,
      organizationId: input.organizationId,
      idempotencyKey: `retrieval-${input.purpose}:${operationDigest(input.operationKey)}:${randomUUID()}`,
      requestHash: fingerprintManagedUsageRequest({
        kind: 'retrieval_embedding',
        purpose: input.purpose,
        operationKey: input.operationKey,
        inputs: texts.length,
        content: inputDigest(texts),
        route: route.routeId,
      }),
      provider: route.provider,
      model: route.model.id,
      estimatedCostMicrousd: estimateEmbeddingCostMicrousd(route.model, estimatedTokens),
      leaseSeconds: EMBEDDING_LEASE_SECONDS,
      planTier: subscription?.plan_tier ?? 'free',
      isFlagship: false,
      ...(input.attribution ? { attribution: input.attribution } : {}),
    });
  } catch (error) {
    throw new RetrievalEmbeddingError(
      error instanceof Error ? error.message : 'Embedding billing refused the call.',
      'billing_refused',
    );
  }

  let result: { vectors: number[][]; promptTokens: number | null };
  try {
    await markManagedUsageProviderStarted(reservation);
    result = await callEmbeddingRoute(route, texts);
  } catch (error) {
    await finalizeManagedUsageRequest({
      ...reservation,
      outcome: 'failed',
      actualCostMicrousd: 0,
      usage: {
        type: 'retrieval_embedding',
        purpose: input.purpose,
        routeId: route.routeId,
        inputs: texts.length,
      },
    }).catch((releaseError: unknown) => {
      logger.error(
        { releaseError, userId: input.userId },
        '[retrieval] embedding reservation release failed',
      );
    });
    const status =
      error instanceof VercelGatewayEmbeddingError || error instanceof GoogleEmbeddingError
        ? error.status
        : null;
    throw new RetrievalEmbeddingError(
      status === null
        ? 'The embedding provider failed.'
        : `The embedding provider returned ${status}.`,
      'provider_failed',
    );
  }

  const promptTokens = result.promptTokens ?? estimatedTokens;
  const costMicrousd = estimateEmbeddingCostMicrousd(route.model, promptTokens);
  await finalizeManagedUsageRequest({
    ...reservation,
    outcome: 'completed',
    actualCostMicrousd: costMicrousd,
    usage: {
      type: 'retrieval_embedding',
      purpose: input.purpose,
      routeId: route.routeId,
      providerCallObservations: [
        { provider: route.provider, model: route.model.id, routeId: route.routeId },
      ],
      inputs: texts.length,
      promptTokens,
    },
  });

  return { vectors: result.vectors, model: route.model.id, routeId: route.routeId };
}
