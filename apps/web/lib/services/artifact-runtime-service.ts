import 'server-only';

import type { NextRequest } from 'next/server';

import {
  connectorsAllowedForTurn,
  connectorsAllowedWithoutRequest,
} from '@/lib/connectors/connector-capability';
import { resolveEntitlementBundle } from '@/lib/services/entitlement-resolution';
import { resolveCloudChatSurface } from '@/lib/free-chat-surface-policy';
import { randomUUID } from 'node:crypto';
import { managedUsageIdempotencyKey } from '@/lib/services/managed-usage-idempotency';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { openAIWireRequestToChatRequest } from '@agiworkforce/provider-protocol';
import { classifyTaskLocally, detectIndicScript, resolveAutoRoute } from '@agiworkforce/routing';
import {
  getModelMetadataById,
  getSlotForModel,
  getTierPolicy,
  isFlagshipRoutingSlot,
  type PrivacyMode,
} from '@agiworkforce/types';
import { resolveOriginPrivacyMode } from '@agiworkforce/artifacts';
import { getProviderModeForModel } from '@shared/lib/provider-mode-for-model';
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
import { runsUnattendedWithoutAsking } from '@/lib/services/unattended-tool-gate';
import { loadToolApprovalPolicy } from '@/app/api/llm/v1/chat/completions/lib/tool-approval-policy';
import { runToolLoop } from '@/app/api/llm/v1/chat/completions/lib/tool-loop';
import { classifyToolLoopInputs } from '@/app/api/llm/v1/chat/completions/lib/tool-loop-routing';
import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';
import {
  GOOGLE_USER_DATA_ARTIFACT_NO_MODEL_MESSAGE,
  toolsReachGoogleUserData,
} from '@/lib/connectors/google-user-data-runs';
import { modelKeepsInputsOutOfTraining } from '@/lib/server/provider-training-opt-out';
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
  type ProviderUsagePricingContext,
} from '@/lib/services/managed-usage-accounting-service';
import {
  ManagedUsageRequestError,
  finalizeManagedUsageRequest,
  fingerprintManagedUsageRequest,
  markManagedUsageProviderStarted,
  reserveManagedUsageRequest,
} from '@/lib/services/managed-usage-request-service';
import {
  CONNECTOR_ARTIFACT_PUBLIC_SHARE_MESSAGE,
  publishedArtifactAllowsConnectors,
} from '@/lib/services/published-artifact-service';
import {
  buildServerProviderAdapter,
  toGenericUpstreamError,
} from '@/lib/services/provider-adapter-service';
import {
  loadUserConnectorToolCatalog,
  makeUserConnectorExecutor,
} from '@/lib/user-connector-tools';
import type { ToolApprovalPolicy } from '@shared/types/toolApprovalPolicy';
import {
  ARTIFACT_STORAGE_SCOPE_LIMIT_BYTES,
  type ArtifactRuntimeConnector,
  type ArtifactRuntimeConnectorTool,
} from '@agiworkforce/cloud-contracts';
import { logger } from '@/lib/logger';
import type {
  LiveArtifact,
  LiveArtifactReadiness,
  LiveArtifactRefreshPolicy,
} from '@/app/chat/live-artifacts/live-artifact-contract';

const ARTIFACT_STORAGE_LIST_LIMIT = 1_000;

const MAX_OUTPUT_TOKENS = 4_096;

export type ArtifactStorageScope = 'personal' | 'shared';

export interface RunnableArtifact {
  publishedArtifactId: string;
  ownerUserId: string;
}

export type ArtifactRuntimeSubject =
  { kind: 'published'; publishedArtifactId: string } | { kind: 'owned'; artifactId: string };

export const LIVE_ARTIFACT_RUNTIME_TYPES = ['html', 'react'] as const;

export interface OwnedRunnableArtifact {
  artifactId: string;
  conversationId: string;
  messageId: string;
  title: string | null;
  type: string;
  originPrivacyMode: PrivacyMode | null;
}

export type LiveArtifactBinding = LiveArtifact;

export interface ArtifactRuntimeRoute {
  provider: string;
  providerModelId: string;
  modelKey: string;
  routeId: string;
}

export class ArtifactRuntimeRouteUnavailableError extends Error {
  constructor(message = 'No model on your plan can answer this app right now.') {
    super(message);
    this.name = 'ArtifactRuntimeRouteUnavailableError';
  }
}

/**
 * The run can reach a Google connector, and no model that keeps inputs out of
 * training can serve it. Google API Limited Use forbids the alternative.
 */
export class ArtifactRuntimeGoogleUserDataRouteError extends ArtifactRuntimeRouteUnavailableError {
  constructor() {
    super(GOOGLE_USER_DATA_ARTIFACT_NO_MODEL_MESSAGE);
    this.name = 'ArtifactRuntimeGoogleUserDataRouteError';
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
  options: { needsTools?: boolean; googleUserData?: boolean } = {},
): Promise<ArtifactRuntimeRoute> {
  const googleUserData = options.googleUserData === true;
  const unavailable = () =>
    googleUserData
      ? new ArtifactRuntimeGoogleUserDataRouteError()
      : new ArtifactRuntimeRouteUnavailableError();
  const routing = await sideCallRoutingRequest(
    db,
    userId,
    {
      selection: 'auto',
      taskType: classifyTaskLocally(prompt, []).type,
      subscriptionTier: planTier,
      trustMode: 'managed_cloud',
      runtimeProfileId: 'web/cloud-chat',
      ...(options.needsTools ? { requiredCapabilities: ['functionCalling'] as const } : {}),
    },
    { forceNoTraining: googleUserData },
  );
  if (!routing) throw unavailable();
  const route = resolveAutoRoute(routing);
  if (route.status === 'unavailable' || route.harnessId.endsWith('/media')) {
    throw unavailable();
  }
  if (googleUserData && !modelKeepsInputsOutOfTraining(route.modelKey)) {
    throw new ArtifactRuntimeGoogleUserDataRouteError();
  }
  return {
    provider: route.provider,
    providerModelId: route.providerModelId,
    modelKey: route.modelKey,
    routeId: route.routeId,
  };
}

interface ArtifactConnectorScope {
  db: DatabaseAdapter;
  userId: string;
  organizationId: string | null;
  planTier: string;
  connectors: readonly string[];
  request: NextRequest;
}

interface ArtifactConnectorAccess {
  toolApprovalPolicy: ToolApprovalPolicy;
  connectorPermissions: ConnectorToolPermissions;
  tools: WebMcpToolDef[];
}

type ArtifactToolStanding = 'available' | ArtifactRuntimeConnectorTool['unavailableReason'];

async function loadArtifactConnectorAccess(
  input: ArtifactConnectorScope,
): Promise<ArtifactConnectorAccess | null> {
  const policy = getTierPolicy(input.planTier);
  if (
    policy.allowToolUse === false ||
    policy.allowMCP === false ||
    !(await connectorsAllowedForTurn(input.request, input.userId, {
      organizationId: input.organizationId,
      subscriptionTier: input.planTier,
      chatSurface: resolveCloudChatSurface(input.request),
    }))
  ) {
    return null;
  }
  return readArtifactConnectorAccess(input, { dialOnlyListed: false });
}

async function readArtifactConnectorAccess(
  input: Omit<ArtifactConnectorScope, 'request'>,
  options: { dialOnlyListed: boolean },
): Promise<ArtifactConnectorAccess> {
  const [toolApprovalPolicy, connectorPermissions] = await Promise.all([
    loadToolApprovalPolicy(input.db, input.userId),
    loadConnectorToolPermissions(input.db, input.userId, input.organizationId),
  ]);
  const catalog = await loadUserConnectorToolCatalog(input.userId, {
    customConnectorLimit: getCustomRemoteMcpLimit(input.planTier) ?? undefined,
    planTier: input.planTier,
    organizationId: input.organizationId,
    isToolDenied: connectorPermissions.isConnectorToolDenied,
    ...(options.dialOnlyListed
      ? { isConnectorDenied: (connectorId: string) => !input.connectors.includes(connectorId) }
      : {}),
  });
  return {
    toolApprovalPolicy,
    connectorPermissions,
    tools: catalog.tools.filter(
      (tool) => tool.origin === 'connector' && input.connectors.includes(tool.serverId),
    ),
  };
}

function artifactToolStanding(
  tool: WebMcpToolDef,
  access: ArtifactConnectorAccess,
): ArtifactToolStanding {
  if (access.connectorPermissions.isDenied(tool.qualifiedName)) return 'blocked';
  return runsUnattendedWithoutAsking(
    tool.qualifiedName,
    access.toolApprovalPolicy,
    access.connectorPermissions,
    tool.annotations,
  )
    ? 'available'
    : 'needs_approval';
}

function artifactConnectorLabel(id: string, tools: readonly WebMcpToolDef[]): string {
  return (
    tools.find((tool) => tool.serverId === id && tool.serverLabel)?.serverLabel ??
    id
      .split(/[_.-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  );
}

export async function describeArtifactConnectors(
  input: ArtifactConnectorScope,
): Promise<ArtifactRuntimeConnector[] | null> {
  const access = await loadArtifactConnectorAccess(input);
  if (!access) return null;
  return input.connectors.map((id) => {
    const tools = access.tools.filter((tool) => tool.serverId === id);
    return {
      id,
      label: artifactConnectorLabel(id, access.tools),
      connected: tools.length > 0,
      tools: tools.map((tool) => {
        const standing = artifactToolStanding(tool, access);
        return {
          name: tool.qualifiedName,
          label: tool.toolName,
          description: tool.description,
          available: standing === 'available',
          unavailableReason: standing === 'available' ? null : standing,
        };
      }),
    };
  });
}

export async function buildArtifactConnectorPlan(
  input: ArtifactConnectorScope & { modelKey: string; allowedTools: readonly string[] },
): Promise<ArtifactConnectorPlan | null> {
  if (getModelMetadataById(input.modelKey)?.capabilities?.tools !== true) return null;
  const access = await loadArtifactConnectorAccess(input);
  if (!access) return null;
  const allowed = new Set(input.allowedTools);
  const available = access.tools.filter(
    (tool) => artifactToolStanding(tool, access) === 'available',
  );
  const mcpTools = available.filter((tool) => allowed.has(tool.qualifiedName));
  const usable = new Set(available.map((tool) => tool.serverId));
  return {
    mcpTools,
    connectorPermissions: access.connectorPermissions,
    toolApprovalPolicy: access.toolApprovalPolicy,
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
    costMicrousd: LLMCostCalculator.calculateCostMicrousd(
      route.provider,
      route.modelKey,
      {
        promptTokens: response.promptTokens,
        completionTokens: response.completionTokens,
        totalTokens: response.totalTokens,
        cacheReadInputTokens: response.cachedInputTokens,
        cacheCreationInputTokens: response.cacheCreationInputTokens,
        cacheCreation1hInputTokens: response.cacheCreation1hInputTokens,
      },
      undefined,
      route.routeId,
    ),
    toolCalls: 0,
  };
}

function toolLoopPricing(route: ArtifactRuntimeRoute): ProviderUsagePricingContext {
  return {
    provider: dispatchProviderForSelectedRoute(route),
    model: route.modelKey,
    routeId: route.routeId,
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
      ? observedProviderUsageLedgerMicrousd(input.usage, toolLoopPricing(input.route))
      : 0,
    toolCalls,
  };
}

const ARTIFACT_RUNTIME_USAGE_NAMESPACE = 'agi.artifact.runtime';

function subjectIdentity(subject: ArtifactRuntimeSubject): Record<string, string> {
  return subject.kind === 'published'
    ? { publishedArtifactId: subject.publishedArtifactId }
    : { artifactId: subject.artifactId };
}

export async function completeArtifactPrompt(input: {
  db: DatabaseAdapter;
  userId: string;
  organizationId: string | null;
  subject: ArtifactRuntimeSubject;
  prompt: string;
  route: ArtifactRuntimeRoute;
  planTier: string;
  signal: AbortSignal;
  plan?: ArtifactConnectorPlan | null;
  idempotencyKey: string | null;
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
  if (
    plan &&
    input.subject.kind === 'published' &&
    !(await publishedArtifactAllowsConnectors(input.db, input.subject.publishedArtifactId))
  ) {
    throw new ManagedUsageRequestError(
      CONNECTOR_ARTIFACT_PUBLIC_SHARE_MESSAGE,
      403,
      'connectors_not_on_public_share',
    );
  }
  // Fail closed whatever route the caller picked: a run offered any Google
  // connector tool only runs on a model that keeps inputs out of training.
  if (
    plan &&
    toolsReachGoogleUserData(plan.mcpTools) &&
    !modelKeepsInputsOutOfTraining(route.modelKey)
  ) {
    throw new ArtifactRuntimeGoogleUserDataRouteError();
  }
  const identity = {
    kind: 'artifact_runtime_completion',
    ...subjectIdentity(input.subject),
    prompt: input.prompt,
    provider: route.provider,
    model: route.modelKey,
    providerModelId: route.providerModelId,
    connectors: plan ? [...new Set(plan.mcpTools.map((tool) => tool.serverId))].sort() : [],
  };
  const reservation = await reserveManagedUsageRequest({
    db: input.db,
    userId: input.userId,
    organizationId: input.organizationId,
    idempotencyKey: managedUsageIdempotencyKey({
      namespace: ARTIFACT_RUNTIME_USAGE_NAMESPACE,
      suppliedKey: input.idempotencyKey,
      identity,
    }),
    requestHash: fingerprintManagedUsageRequest(identity),
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
        ...subjectIdentity(input.subject),
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
        ? observedProviderUsageLedgerMicrousd(observedUsage, toolLoopPricing(route))
        : 0;
      await finalizeManagedUsageRequest({
        ...reservation,
        outcome: observedCostMicrousd > 0 ? 'completed' : 'failed',
        actualCostMicrousd: observedCostMicrousd,
        usage: {
          type: 'artifact_runtime_completion',
          ...subjectIdentity(input.subject),
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

const LIVE_ARTIFACT_LIST_LIMIT = 200;

export interface LiveArtifactOwner {
  userId: string;
  organizationId: string | null;
}
const LIVE_ARTIFACT_FIRST_CHECK_DELAY = '1 hour';

interface OwnedArtifactRow {
  id: string;
  conversation_id: string;
  message_id: string;
  title: string | null;
  artifact_type: string;
}

export async function readOwnedRunnableArtifact(
  db: DatabaseAdapter,
  owner: LiveArtifactOwner,
  artifactId: string,
): Promise<OwnedRunnableArtifact | null> {
  const rows = await db.query<OwnedArtifactRow>(
    `select artifacts.id,
            artifacts.conversation_id,
            artifacts.message_id,
            artifacts.title,
            artifacts.artifact_type
       from public.web_artifact_index artifacts
       join public.web_conversations conversations
         on conversations.id = artifacts.conversation_id
        and conversations.deleted_at is null
        and conversations.organization_id is not distinct from $4::uuid
       join public.web_messages messages
         on messages.id = artifacts.message_id
        and messages.deleted_at is null
      where artifacts.id = $1::uuid
        and artifacts.user_id = $2::text
        and artifacts.artifact_type = any($3::text[])
      limit 1`,
    [artifactId, owner.userId, [...LIVE_ARTIFACT_RUNTIME_TYPES], owner.organizationId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    artifactId: row.id,
    conversationId: row.conversation_id,
    messageId: row.message_id,
    title: row.title,
    type: row.artifact_type,
    originPrivacyMode: await readConversationOriginPrivacyMode(db, owner, row.conversation_id),
  };
}

interface ConversationOriginSignalRow {
  model: string | null;
  privacy_mode: string | null;
  provider_mode: string | null;
}

export async function readConversationOriginPrivacyMode(
  db: DatabaseAdapter,
  owner: LiveArtifactOwner,
  conversationId: string,
): Promise<PrivacyMode | null> {
  const rows = await db.query<ConversationOriginSignalRow>(
    `select distinct signals.model, signals.privacy_mode, signals.provider_mode
       from (
         select conversations.model, null::text as privacy_mode, null::text as provider_mode
           from public.web_conversations conversations
          where conversations.id = $1::uuid
            and conversations.user_id = $2::text
            and conversations.deleted_at is null
            and conversations.organization_id is not distinct from $3::uuid
         union all
         select coalesce(messages.model, messages.metadata->>'model'),
                messages.metadata->>'privacyMode',
                messages.metadata->>'providerMode'
           from public.web_messages messages
          where messages.conversation_id = $1::uuid
            and messages.deleted_at is null
       ) signals`,
    [conversationId, owner.userId, owner.organizationId],
  );
  return (
    resolveOriginPrivacyMode(
      rows.flatMap((row) => [
        row.privacy_mode,
        row.provider_mode,
        getProviderModeForModel(row.model),
      ]),
    ) ?? null
  );
}

interface LiveArtifactRow {
  artifact_id: string;
  conversation_id: string;
  title: string | null;
  artifact_type: string;
  connectors: string[];
  allowed_tools: string[];
  refresh_policy: LiveArtifactRefreshPolicy;
  last_refreshed_at: Date | string | null;
  readiness: LiveArtifactReadiness;
  missing_connectors: string[];
  created_at: Date | string;
  updated_at: Date | string;
}

function isoTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toLiveArtifact(row: LiveArtifactRow): LiveArtifactBinding {
  return {
    artifactId: row.artifact_id,
    conversationId: row.conversation_id,
    title: row.title,
    type: row.artifact_type,
    connectors: row.connectors,
    allowedTools: row.allowed_tools,
    refreshPolicy: row.refresh_policy,
    lastRefreshedAt: row.last_refreshed_at ? isoTimestamp(row.last_refreshed_at) : null,
    readiness: row.readiness,
    missingConnectors: row.missing_connectors,
    createdAt: isoTimestamp(row.created_at),
    updatedAt: isoTimestamp(row.updated_at),
  };
}

const LIVE_ARTIFACT_COLUMNS = `live.artifact_id,
            live.conversation_id,
            artifacts.title,
            artifacts.artifact_type,
            live.connectors,
            live.allowed_tools,
            live.refresh_policy,
            live.last_refreshed_at,
            live.readiness,
            live.missing_connectors,
            live.created_at,
            live.updated_at`;

const LIVE_ARTIFACT_SOURCE = `public.live_artifacts live
       join public.web_artifact_index artifacts
         on artifacts.id = live.artifact_id
        and artifacts.user_id = live.user_id
       join public.web_conversations conversations
         on conversations.id = live.conversation_id
        and conversations.deleted_at is null
        and conversations.organization_id is not distinct from $2::uuid`;

export async function listLiveArtifacts(
  db: DatabaseAdapter,
  owner: LiveArtifactOwner,
): Promise<LiveArtifactBinding[]> {
  const rows = await db.query<LiveArtifactRow>(
    `select ${LIVE_ARTIFACT_COLUMNS}
       from ${LIVE_ARTIFACT_SOURCE}
      where live.user_id = $1::text
      order by coalesce(live.last_refreshed_at, live.created_at) desc
      limit $3::integer`,
    [owner.userId, owner.organizationId, LIVE_ARTIFACT_LIST_LIMIT],
  );
  return rows.map(toLiveArtifact);
}

export async function readLiveArtifact(
  db: DatabaseAdapter,
  owner: LiveArtifactOwner,
  artifactId: string,
): Promise<LiveArtifactBinding | null> {
  const rows = await db.query<LiveArtifactRow>(
    `select ${LIVE_ARTIFACT_COLUMNS}
       from ${LIVE_ARTIFACT_SOURCE}
      where live.user_id = $1::text
        and live.artifact_id = $3::uuid
      limit 1`,
    [owner.userId, owner.organizationId, artifactId],
  );
  const row = rows[0];
  return row ? toLiveArtifact(row) : null;
}

export async function saveLiveArtifact(
  db: DatabaseAdapter,
  input: {
    owner: LiveArtifactOwner;
    artifact: OwnedRunnableArtifact;
    connectors: readonly string[];
    allowedTools: readonly string[];
    refreshPolicy: LiveArtifactRefreshPolicy | null;
  },
): Promise<LiveArtifactBinding | null> {
  await db.query(
    `insert into public.live_artifacts
       (user_id, artifact_id, conversation_id, message_id, connectors, allowed_tools,
        refresh_policy, next_check_at)
     values ($1::text, $2::uuid, $3::uuid, $4::uuid, $5::text[], $6::text[],
             coalesce($7::text, 'on_open'), now() + $8::interval)
     on conflict (user_id, artifact_id) do update
       set conversation_id = excluded.conversation_id,
           message_id = excluded.message_id,
           connectors = excluded.connectors,
           allowed_tools = excluded.allowed_tools,
           refresh_policy = coalesce($7::text, live_artifacts.refresh_policy),
           readiness = 'ready',
           missing_connectors = '{}',
           check_failures = 0,
           next_check_at = excluded.next_check_at`,
    [
      input.owner.userId,
      input.artifact.artifactId,
      input.artifact.conversationId,
      input.artifact.messageId,
      [...new Set(input.connectors)],
      [...new Set(input.allowedTools)],
      input.refreshPolicy,
      LIVE_ARTIFACT_FIRST_CHECK_DELAY,
    ],
  );
  return readLiveArtifact(db, input.owner, input.artifact.artifactId);
}

export async function setLiveArtifactRefreshPolicy(
  db: DatabaseAdapter,
  owner: LiveArtifactOwner,
  artifactId: string,
  refreshPolicy: LiveArtifactRefreshPolicy,
): Promise<LiveArtifactBinding | null> {
  const rows = await db.query<{ artifact_id: string }>(
    `update public.live_artifacts
        set refresh_policy = $3::text
      where user_id = $1::text
        and artifact_id = $2::uuid
      returning artifact_id`,
    [owner.userId, artifactId, refreshPolicy],
  );
  return rows.length > 0 ? readLiveArtifact(db, owner, artifactId) : null;
}

export async function removeLiveArtifact(
  db: DatabaseAdapter,
  userId: string,
  artifactId: string,
): Promise<boolean> {
  const rows = await db.query<{ artifact_id: string }>(
    `delete from public.live_artifacts
      where user_id = $1::text
        and artifact_id = $2::uuid
      returning artifact_id`,
    [userId, artifactId],
  );
  return rows.length > 0;
}

export async function recordLiveArtifactRefresh(
  db: DatabaseAdapter,
  userId: string,
  artifactId: string,
): Promise<void> {
  await db.execute(
    `update public.live_artifacts
        set last_refreshed_at = now(),
            readiness = 'ready',
            missing_connectors = '{}'
      where user_id = $1::text
        and artifact_id = $2::uuid`,
    [userId, artifactId],
  );
}

export function bindingCovers(
  binding: Pick<LiveArtifactBinding, 'connectors'> | null,
  connectors: readonly string[],
): boolean {
  if (connectors.length === 0) return true;
  if (!binding) return false;
  const bound = new Set(binding.connectors);
  return connectors.every((connector) => bound.has(connector));
}

export async function liveArtifactMissingConnectors(input: {
  db: DatabaseAdapter;
  userId: string;
  organizationId: string | null;
  connectors: readonly string[];
}): Promise<string[]> {
  const entitlement = await resolveEntitlementBundle(input.db, input.userId);
  const policy = getTierPolicy(entitlement.plan);
  if (
    policy.allowToolUse === false ||
    policy.allowMCP === false ||
    !(await connectorsAllowedWithoutRequest({
      userId: input.userId,
      organizationId: input.organizationId,
      planTier: entitlement.plan,
    }))
  ) {
    return [...input.connectors];
  }
  const access = await readArtifactConnectorAccess(
    {
      db: input.db,
      userId: input.userId,
      organizationId: input.organizationId,
      planTier: entitlement.plan,
      connectors: input.connectors,
    },
    { dialOnlyListed: true },
  );
  const usable = new Set(
    access.tools
      .filter((tool) => artifactToolStanding(tool, access) === 'available')
      .map((tool) => tool.serverId),
  );
  return input.connectors.filter((connector) => !usable.has(connector));
}
