import 'server-only';

import { randomUUID } from 'node:crypto';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { openAIWireRequestToChatRequest } from '@agiworkforce/provider-protocol';
import { classifyTaskLocally, detectIndicScript, resolveAutoRoute } from '@agiworkforce/routing';
import {
  getModelMetadataById,
  getSlotForModel,
  getTierPolicy,
  isFlagshipRoutingSlot,
} from '@agiworkforce/types';
import {
  ADAPTER_PROVIDERS,
  resolveWireMode,
} from '@/app/api/llm/v1/chat/completions/lib/adapter-providers';
import { drainToLlmResponse } from '@/app/api/llm/v1/chat/completions/lib/adapter-response';
import { extractAssistantTextDelta } from '@/app/api/llm/v1/chat/completions/lib/assistant-turn-persistence';
import {
  loadConnectorToolPermissions,
  type ConnectorToolPermissions,
} from '@/app/api/llm/v1/chat/completions/lib/connector-tool-permissions';
import { extractManagedAgentEventEnvelopes } from '@/app/api/llm/v1/chat/completions/lib/managed-agent-stream';
import type { ProcessedRequest } from '@/app/api/llm/v1/chat/completions/lib/request-processor';
import { resolveToolCallGate } from '@/app/api/llm/v1/chat/completions/lib/tool-call-gate';
import { loadToolApprovalPolicy } from '@/app/api/llm/v1/chat/completions/lib/tool-approval-policy';
import { runToolLoop } from '@/app/api/llm/v1/chat/completions/lib/tool-loop';
import { classifyToolLoopInputs } from '@/app/api/llm/v1/chat/completions/lib/tool-loop-routing';
import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';
import { sideCallRoutingRequest } from '@/lib/server/side-call-training-policy';
import { dispatchProviderForSelectedRoute } from '@/lib/services/aggregator-routing';
import { ledgerCentsFromMicrousd } from '@/lib/services/credit-service';
import { getCustomRemoteMcpLimit } from '@/lib/services/free-plan-entitlements';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import {
  createObservedProviderUsage,
  hasObservedProviderUsage,
  observedProviderUsageLedgerMicrousd,
  type ObservedProviderUsage,
} from '@/lib/services/managed-usage-accounting-service';
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
import {
  loadUserConnectorToolCatalog,
  makeUserConnectorExecutor,
} from '@/lib/user-connector-tools';
import type { ToolApprovalPolicy } from '@shared/types/toolApprovalPolicy';
import { logger } from '@/lib/logger';

export const ARTIFACT_RUNTIME_MAX_PROMPT_CHARS = 100_000;
export const ARTIFACT_STORAGE_SCOPE_LIMIT_BYTES = 20 * 1024 * 1024;
export const ARTIFACT_STORAGE_VALUE_LIMIT_BYTES = 4 * 1024 * 1024;
export const ARTIFACT_STORAGE_LIST_LIMIT = 1_000;
export const ARTIFACT_STORAGE_KEY_PATTERN = /^[^\s/\\'"]{1,200}$/u;
export const ARTIFACT_RUNTIME_MAX_CONNECTORS = 10;
export const ARTIFACT_CONNECTOR_ID_PATTERN = /^[a-z0-9][a-z0-9_.-]{0,63}$/;

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

export interface ArtifactConnectorPlan {
  mcpTools: WebMcpToolDef[];
  connectorPermissions: ConnectorToolPermissions;
  toolApprovalPolicy: ToolApprovalPolicy;
  connectorExecutor: ReturnType<typeof makeUserConnectorExecutor>;
  unusable: string[];
}

interface ArtifactCompletion {
  text: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costMicrousd: number;
  toolCalls: number;
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
  options: { needsTools?: boolean } = {},
): Promise<ArtifactRuntimeRoute> {
  const routing = await sideCallRoutingRequest(db, userId, {
    selection: 'auto',
    taskType: classifyTaskLocally(prompt, []).type,
    subscriptionTier: planTier,
    trustMode: 'managed_cloud',
    runtimeProfileId: 'web/cloud-chat',
    ...(options.needsTools ? { requiredCapabilities: ['functionCalling'] as const } : {}),
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

function runsWithoutAsking(
  qualifiedName: string,
  toolApprovalPolicy: ToolApprovalPolicy,
  connectorPermissions: ConnectorToolPermissions,
): boolean {
  return (
    resolveToolCallGate(
      {
        qualifiedName,
        savedLevel: connectorPermissions.levelFor(qualifiedName),
        batchIntroducesUntrustedContent: false,
      },
      {
        approvalMode: 'manual',
        toolApprovalPolicy,
        unattended: true,
        deviceHostPresent: false,
        untrustedContentInContext: false,
        sensitiveSourceAvailable: false,
      },
    ).verdict === 'allow'
  );
}

export async function buildArtifactConnectorPlan(input: {
  db: DatabaseAdapter;
  userId: string;
  organizationId: string | null;
  planTier: string;
  modelKey: string;
  connectors: readonly string[];
}): Promise<ArtifactConnectorPlan | null> {
  const policy = getTierPolicy(input.planTier);
  if (
    getModelMetadataById(input.modelKey)?.capabilities?.tools !== true ||
    policy.allowToolUse === false ||
    policy.allowMCP === false
  ) {
    return null;
  }
  const [toolApprovalPolicy, connectorPermissions] = await Promise.all([
    loadToolApprovalPolicy(input.db, input.userId),
    loadConnectorToolPermissions(input.db, input.userId),
  ]);
  const catalog = await loadUserConnectorToolCatalog(input.userId, {
    customConnectorLimit: getCustomRemoteMcpLimit(input.planTier) ?? undefined,
    planTier: input.planTier,
    organizationId: input.organizationId,
    isToolDenied: connectorPermissions.isConnectorToolDenied,
  });
  const mcpTools = catalog.tools.filter(
    (tool) =>
      tool.origin === 'connector' &&
      input.connectors.includes(tool.serverId) &&
      !connectorPermissions.isDenied(tool.qualifiedName) &&
      runsWithoutAsking(tool.qualifiedName, toolApprovalPolicy, connectorPermissions),
  );
  const usable = new Set(mcpTools.map((tool) => tool.serverId));
  return {
    mcpTools,
    connectorPermissions,
    toolApprovalPolicy,
    connectorExecutor: makeUserConnectorExecutor(input.userId, input.organizationId),
    unusable: input.connectors.filter((connector) => !usable.has(connector)),
  };
}

async function runArtifactCompletion(
  route: ArtifactRuntimeRoute,
  prompt: string,
  signal: AbortSignal,
): Promise<ArtifactCompletion> {
  const dispatchProvider = dispatchProviderForSelectedRoute(route);
  const response = await drainToLlmResponse(
    buildServerProviderAdapter(dispatchProvider).stream(
      openAIWireRequestToChatRequest({
        model: route.providerModelId,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: MAX_OUTPUT_TOKENS,
        stream: false,
      }),
      signal,
    ),
    route.modelKey,
    (chunk) => toGenericUpstreamError(dispatchProvider, chunk),
    resolveWireMode(dispatchProvider),
  );
  return {
    text: response.content,
    promptTokens: response.promptTokens,
    completionTokens: response.completionTokens,
    totalTokens: response.totalTokens,
    costMicrousd: LLMCostCalculator.calculateCostMicrousd(route.provider, route.modelKey, {
      promptTokens: response.promptTokens,
      completionTokens: response.completionTokens,
      totalTokens: response.totalTokens,
      cacheReadInputTokens: response.cachedInputTokens,
      cacheCreationInputTokens: response.cacheCreationInputTokens,
      cacheCreation1hInputTokens: response.cacheCreation1hInputTokens,
    }),
    toolCalls: 0,
  };
}

async function runArtifactToolLoop(input: {
  route: ArtifactRuntimeRoute;
  prompt: string;
  plan: ArtifactConnectorPlan;
  userId: string;
  organizationId: string | null;
  planTier: string;
  reservation: NonNullable<ProcessedRequest['managedUsage']>;
  estimatedCostMicrousd: number;
  estimatedPromptTokens: number;
  usage: ObservedProviderUsage;
  signal: AbortSignal;
}): Promise<ArtifactCompletion> {
  const dispatchProvider = dispatchProviderForSelectedRoute(input.route);
  const messages: ProcessedRequest['llmRequest']['messages'] = [
    { role: 'user', content: input.prompt },
  ];
  const processed: ProcessedRequest = {
    requestId: `artifact-runtime-${randomUUID()}`,
    chatSurface: 'web',
    sensitiveContextPresent: false,
    organizationId: input.organizationId,
    managedUsage: input.reservation,
    chatRequest: {
      model: input.route.modelKey,
      messages: [{ role: 'user', content: input.prompt }],
      stream: true,
    },
    conversationId: undefined,
    requestedModel: input.route.modelKey,
    provider: dispatchProvider,
    estimatedCostMicrousd: input.estimatedCostMicrousd,
    estimatedCostCents: ledgerCentsFromMicrousd(input.estimatedCostMicrousd),
    estimatedPromptTokens: input.estimatedPromptTokens,
    maxTokens: MAX_OUTPUT_TOKENS,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: 'auto',
    subscriptionTier: input.planTier,
    resolvedTaskType: classifyTaskLocally(input.prompt, []).type,
    classifierConfidence: 1,
    resolvedSlot: getSlotForModel(input.route.modelKey),
    quotaFeature: 'chat',
    quotaWarningHeader: null,
    isFlagshipRequest: isFlagshipRoutingSlot(getSlotForModel(input.route.modelKey)),
    indicResult: detectIndicScript(input.prompt),
    llmRequest: {
      model: input.route.modelKey,
      messages,
      max_tokens: MAX_OUTPUT_TOKENS,
      stream: true,
      tools: [],
    },
  };
  let text = '';
  let toolCalls = 0;
  let reportedError: string | undefined;
  for await (const chunk of runToolLoop(processed, {
    mcpTools: input.plan.mcpTools,
    approvalMode: classifyToolLoopInputs(input.plan.mcpTools, [], input.plan.toolApprovalPolicy)
      .approvalMode,
    toolApprovalPolicy: input.plan.toolApprovalPolicy,
    unattended: true,
    userId: input.userId,
    connectorPermissions: input.plan.connectorPermissions,
    connectorExecutor: input.plan.connectorExecutor,
    usage: input.usage,
    signal: input.signal,
  })) {
    text += extractAssistantTextDelta(chunk);
    for (const envelope of extractManagedAgentEventEnvelopes(chunk)) {
      if (envelope.event.type === 'tool-execution-start') toolCalls += 1;
      if (envelope.event.type === 'error' && !reportedError) reportedError = envelope.event.message;
    }
  }
  if (reportedError) throw new Error(reportedError);
  return {
    text: text.trim(),
    promptTokens: input.usage.inputTokens,
    completionTokens: input.usage.outputTokens,
    totalTokens: input.usage.inputTokens + input.usage.outputTokens,
    costMicrousd: hasObservedProviderUsage(input.usage)
      ? observedProviderUsageLedgerMicrousd(input.usage, {
          provider: dispatchProvider,
          model: input.route.modelKey,
        })
      : 0,
    toolCalls,
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
  plan?: ArtifactConnectorPlan | null;
}): Promise<string> {
  const { route } = input;
  const estimatedPromptTokens = Math.ceil(input.prompt.length / 3.5) + 32;
  const estimatedCostMicrousd = LLMCostCalculator.estimateCostMicrousd(
    route.provider,
    route.modelKey,
    estimatedPromptTokens,
    MAX_OUTPUT_TOKENS,
  );
  const plan = input.plan && input.plan.mcpTools.length > 0 ? input.plan : null;
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
      connectors: plan ? [...new Set(plan.mcpTools.map((tool) => tool.serverId))].sort() : [],
    }),
    provider: route.provider,
    model: route.modelKey,
    estimatedCostMicrousd,
    leaseSeconds: plan ? 300 : 120,
    planTier: input.planTier,
    isFlagship: isFlagshipRoutingSlot(getSlotForModel(route.modelKey)),
    attribution: { workload: 'chat' },
  });

  const observedUsage = createObservedProviderUsage();
  let providerCompleted = false;
  try {
    await markManagedUsageProviderStarted(reservation);
    const completion =
      plan && ADAPTER_PROVIDERS[dispatchProviderForSelectedRoute(route)]
        ? await runArtifactToolLoop({
            route,
            prompt: input.prompt,
            plan,
            userId: input.userId,
            organizationId: input.organizationId,
            planTier: input.planTier,
            reservation,
            estimatedCostMicrousd,
            estimatedPromptTokens,
            usage: observedUsage,
            signal: input.signal,
          })
        : await runArtifactCompletion(route, input.prompt, input.signal);
    providerCompleted = true;
    await finalizeManagedUsageRequest({
      ...reservation,
      outcome: 'completed',
      actualCostMicrousd: completion.costMicrousd,
      usage: {
        type: 'artifact_runtime_completion',
        publishedArtifactId: input.artifact.publishedArtifactId,
        provider: route.provider,
        model: route.modelKey,
        promptTokens: completion.promptTokens,
        completionTokens: completion.completionTokens,
        totalTokens: completion.totalTokens,
        toolCalls: completion.toolCalls,
      },
    });
    return completion.text;
  } catch (error) {
    if (!providerCompleted) {
      const observedCostMicrousd = hasObservedProviderUsage(observedUsage)
        ? observedProviderUsageLedgerMicrousd(observedUsage, {
            provider: route.provider,
            model: route.modelKey,
          })
        : 0;
      await finalizeManagedUsageRequest({
        ...reservation,
        outcome: observedCostMicrousd > 0 ? 'completed' : 'failed',
        actualCostMicrousd: observedCostMicrousd,
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
