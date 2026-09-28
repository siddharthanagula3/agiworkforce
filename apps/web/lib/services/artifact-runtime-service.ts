import 'server-only';

import { randomUUID } from 'node:crypto';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { openAIWireRequestToChatRequest } from '@agiworkforce/provider-protocol';
import { classifyTaskLocally, resolveAutoRoute } from '@agiworkforce/routing';
import { getSlotForModel, isFlagshipRoutingSlot } from '@agiworkforce/types';
import { resolveWireMode } from '@/app/api/llm/v1/chat/completions/lib/adapter-providers';
import { drainToLlmResponse } from '@/app/api/llm/v1/chat/completions/lib/adapter-response';
import { sideCallRoutingRequest } from '@/lib/server/side-call-training-policy';
import { dispatchProviderForSelectedRoute } from '@/lib/services/aggregator-routing';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import {
  finalizeManagedUsageRequest,
  fingerprintManagedUsageRequest,
  markManagedUsageProviderStarted,
  reserveManagedUsageRequest,
} from '@/lib/services/managed-usage-request-service';
import {
  buildServerProviderAdapter,
  toGenericUpstreamError,
} from '@/lib/services/provider-adapter-service';
import { logger } from '@/lib/logger';

export const ARTIFACT_RUNTIME_MAX_PROMPT_CHARS = 100_000;
export const ARTIFACT_STORAGE_SCOPE_LIMIT_BYTES = 20 * 1024 * 1024;
export const ARTIFACT_STORAGE_VALUE_LIMIT_BYTES = 4 * 1024 * 1024;
export const ARTIFACT_STORAGE_LIST_LIMIT = 1_000;
export const ARTIFACT_STORAGE_KEY_PATTERN = /^[^\s/\\'"]{1,200}$/u;

const MAX_OUTPUT_TOKENS = 4_096;

export type ArtifactStorageScope = 'personal' | 'shared';

export interface RunnableArtifact {
  publishedArtifactId: string;
  ownerUserId: string;
}

export interface ArtifactRuntimeRoute {
  provider: string;
  providerModelId: string;
  modelKey: string;
  routeId: string;
}

export class ArtifactRuntimeRouteUnavailableError extends Error {
  constructor() {
    super('No model on your plan can answer this app right now.');
    this.name = 'ArtifactRuntimeRouteUnavailableError';
  }
}

export async function readRunnableArtifact(
  db: DatabaseAdapter,
  token: string,
): Promise<RunnableArtifact | null> {
  const rows = await db.query<{ published_artifact_id: string; owner_user_id: string }>(
    `select published_artifact_id, owner_user_id
       from public.app_runnable_published_artifact($1::text)`,
    [token],
  );
  const row = rows[0];
  return row
    ? { publishedArtifactId: row.published_artifact_id, ownerUserId: row.owner_user_id }
    : null;
}

interface StorageTarget {
  artifact: RunnableArtifact;
  userId: string;
  scope: ArtifactStorageScope;
}

function scopeOwner(target: StorageTarget): string | null {
  return target.scope === 'personal' ? target.userId : null;
}

export async function readArtifactStorageValue(
  db: DatabaseAdapter,
  target: StorageTarget & { key: string },
): Promise<string | null> {
  const rows = await db.query<{ value: string }>(
    `select value
       from public.published_artifact_storage
      where published_artifact_id = $1::uuid
        and scope_key = coalesce($2::text, '')
        and owner_user_id is not distinct from $2::text
        and storage_key = $3::text`,
    [target.artifact.publishedArtifactId, scopeOwner(target), target.key],
  );
  return rows[0]?.value ?? null;
}

export async function writeArtifactStorageValue(
  db: DatabaseAdapter,
  target: StorageTarget & { key: string; value: string },
): Promise<'saved' | 'over_limit'> {
  const rows = await db.query<{ storage_key: string }>(
    `with used as (
       select coalesce(sum(value_bytes), 0)::bigint as bytes
         from public.published_artifact_storage
        where published_artifact_id = $1::uuid
          and scope_key = coalesce($2::text, '')
          and owner_user_id is not distinct from $2::text
          and storage_key <> $3::text
     )
     insert into public.published_artifact_storage
       (published_artifact_id, owner_user_id, storage_key, value, updated_by)
     select $1::uuid, $2::text, $3::text, $4::text, $5::text
      where (select bytes from used) + octet_length($3::text) + octet_length($4::text) <= $6::bigint
     on conflict (published_artifact_id, scope_key, storage_key)
     do update set value = excluded.value, updated_by = excluded.updated_by
     returning storage_key`,
    [
      target.artifact.publishedArtifactId,
      scopeOwner(target),
      target.key,
      target.value,
      target.userId,
      ARTIFACT_STORAGE_SCOPE_LIMIT_BYTES,
    ],
  );
  return rows.length > 0 ? 'saved' : 'over_limit';
}

export async function deleteArtifactStorageValue(
  db: DatabaseAdapter,
  target: StorageTarget & { key: string },
): Promise<boolean> {
  const rows = await db.query<{ storage_key: string }>(
    `delete from public.published_artifact_storage
      where published_artifact_id = $1::uuid
        and scope_key = coalesce($2::text, '')
        and owner_user_id is not distinct from $2::text
        and storage_key = $3::text
      returning storage_key`,
    [target.artifact.publishedArtifactId, scopeOwner(target), target.key],
  );
  return rows.length > 0;
}

export async function listArtifactStorageKeys(
  db: DatabaseAdapter,
  target: StorageTarget & { prefix: string | null },
): Promise<string[]> {
  const rows = await db.query<{ storage_key: string }>(
    `select storage_key
       from public.published_artifact_storage
      where published_artifact_id = $1::uuid
        and scope_key = coalesce($2::text, '')
        and owner_user_id is not distinct from $2::text
        and ($3::text is null or left(storage_key, char_length($3::text)) = $3::text)
      order by storage_key
      limit $4::integer`,
    [
      target.artifact.publishedArtifactId,
      scopeOwner(target),
      target.prefix,
      ARTIFACT_STORAGE_LIST_LIMIT,
    ],
  );
  return rows.map((row) => row.storage_key);
}

export async function selectArtifactRuntimeRoute(
  db: DatabaseAdapter,
  userId: string,
  prompt: string,
  planTier: string,
): Promise<ArtifactRuntimeRoute> {
  const routing = await sideCallRoutingRequest(db, userId, {
    selection: 'auto',
    taskType: classifyTaskLocally(prompt, []).type,
    subscriptionTier: planTier,
    trustMode: 'managed_cloud',
    runtimeProfileId: 'web/cloud-chat',
  });
  if (!routing) throw new ArtifactRuntimeRouteUnavailableError();
  const route = resolveAutoRoute(routing);
  if (route.status === 'unavailable' || route.harnessId.endsWith('/media')) {
    throw new ArtifactRuntimeRouteUnavailableError();
  }
  return {
    provider: route.provider,
    providerModelId: route.providerModelId,
    modelKey: route.modelKey,
    routeId: route.routeId,
  };
}

export async function completeArtifactPrompt(input: {
  db: DatabaseAdapter;
  userId: string;
  organizationId: string | null;
  artifact: RunnableArtifact;
  prompt: string;
  route: ArtifactRuntimeRoute;
  planTier: string;
  signal: AbortSignal;
}): Promise<string> {
  const { route } = input;
  const estimatedPromptTokens = Math.ceil(input.prompt.length / 3.5) + 32;
  const reservation = await reserveManagedUsageRequest({
    db: input.db,
    userId: input.userId,
    organizationId: input.organizationId,
    idempotencyKey: `artifact-runtime:${randomUUID()}`,
    requestHash: fingerprintManagedUsageRequest({
      kind: 'artifact_runtime_completion',
      publishedArtifactId: input.artifact.publishedArtifactId,
      prompt: input.prompt,
      provider: route.provider,
      model: route.modelKey,
      providerModelId: route.providerModelId,
    }),
    provider: route.provider,
    model: route.modelKey,
    estimatedCostMicrousd: LLMCostCalculator.estimateCostMicrousd(
      route.provider,
      route.modelKey,
      estimatedPromptTokens,
      MAX_OUTPUT_TOKENS,
    ),
    leaseSeconds: 120,
    planTier: input.planTier,
    isFlagship: isFlagshipRoutingSlot(getSlotForModel(route.modelKey)),
    attribution: { workload: 'chat' },
  });

  let providerCompleted = false;
  try {
    await markManagedUsageProviderStarted(reservation);
    const dispatchProvider = dispatchProviderForSelectedRoute(route);
    const response = await drainToLlmResponse(
      buildServerProviderAdapter(dispatchProvider).stream(
        openAIWireRequestToChatRequest({
          model: route.providerModelId,
          messages: [{ role: 'user', content: input.prompt }],
          max_tokens: MAX_OUTPUT_TOKENS,
          stream: false,
        }),
        input.signal,
      ),
      route.modelKey,
      (chunk) => toGenericUpstreamError(dispatchProvider, chunk),
      resolveWireMode(dispatchProvider),
    );
    providerCompleted = true;
    await finalizeManagedUsageRequest({
      ...reservation,
      outcome: 'completed',
      actualCostMicrousd: LLMCostCalculator.calculateCostMicrousd(route.provider, route.modelKey, {
        promptTokens: response.promptTokens,
        completionTokens: response.completionTokens,
        totalTokens: response.totalTokens,
        cacheReadInputTokens: response.cachedInputTokens,
        cacheCreationInputTokens: response.cacheCreationInputTokens,
        cacheCreation1hInputTokens: response.cacheCreation1hInputTokens,
      }),
      usage: {
        type: 'artifact_runtime_completion',
        publishedArtifactId: input.artifact.publishedArtifactId,
        provider: route.provider,
        model: route.modelKey,
        promptTokens: response.promptTokens,
        completionTokens: response.completionTokens,
        totalTokens: response.totalTokens,
      },
    });
    return response.content;
  } catch (error) {
    if (!providerCompleted) {
      await finalizeManagedUsageRequest({
        ...reservation,
        outcome: 'failed',
        actualCostMicrousd: 0,
        usage: {
          type: 'artifact_runtime_completion',
          publishedArtifactId: input.artifact.publishedArtifactId,
          reason: error instanceof Error ? error.message : String(error),
        },
      }).catch((releaseError: unknown) => {
        logger.error(
          { userId: input.userId, error: releaseError },
          'Artifact runtime reservation release could not be persisted',
        );
      });
    }
    throw error;
  }
}
