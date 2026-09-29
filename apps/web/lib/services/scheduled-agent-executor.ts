import 'server-only';

import { connectorsAllowedWithoutRequest } from '@/lib/connectors/connector-capability';
import { createPostgresContextManifestStore, resolveContext } from '@agiworkforce/context-engine';
import {
  classifyTaskLocally,
  detectIndicScript,
  modelsPastDeprecationDate,
  resolveAutoRoute,
  type AutoRoutingRequest,
} from '@agiworkforce/routing';
import {
  sideCallRoutingRequest,
  sideCallTrainingOptOut,
} from '@/lib/server/side-call-training-policy';
import { modelKeepsInputsOutOfTraining } from '@/lib/server/provider-training-opt-out';
import {
  connectedGoogleUserDataConnectorIds,
  googleHostedCustomServerIds,
  projectHoldsGoogleUserData,
  readsGoogleUserData,
} from '@/lib/connectors/google-user-data';
import { openAIWireRequestToChatRequest } from '@agiworkforce/provider-protocol';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import {
  DomainErrorCode,
  getModelMetadataById,
  getSlotForModel,
  getTierPolicy,
  isFlagshipRoutingSlot,
  type DomainErrorCodeValue,
} from '@agiworkforce/types';
import {
  ADAPTER_PROVIDERS,
  resolveWireMode,
} from '@/app/api/llm/v1/chat/completions/lib/adapter-providers';
import { drainToLlmResponse } from '@/app/api/llm/v1/chat/completions/lib/adapter-response';
import { extractAssistantTextDelta } from '@/app/api/llm/v1/chat/completions/lib/assistant-turn-persistence';
import { buildCapabilityPreamble } from '@/app/api/llm/v1/chat/completions/lib/capability-preamble';
import {
  EMPTY_CONNECTOR_TOOL_PERMISSIONS,
  loadConnectorToolPermissions,
  type ConnectorToolPermissions,
} from '@/app/api/llm/v1/chat/completions/lib/connector-tool-permissions';
import { extractManagedAgentEventEnvelopes } from '@/app/api/llm/v1/chat/completions/lib/managed-agent-stream';
import {
  appendWebSearchTool,
  resolveWebFetchTools,
  shouldOfferGenericWebSearchTool,
  type ChatCompletionRequest,
  type ProcessedRequest,
} from '@/app/api/llm/v1/chat/completions/lib/request-processor';
import type { ResearchDomainPolicy } from '@/app/api/llm/v1/chat/completions/lib/research-sources';
import { resolveToolCallGate } from '@/app/api/llm/v1/chat/completions/lib/tool-call-gate';
import { loadToolApprovalPolicy } from '@/app/api/llm/v1/chat/completions/lib/tool-approval-policy';
import {
  canonicalToolSummary,
  loadMcpToolDefs,
  runToolLoop,
  type ToolLoopApprovalCheckpoint,
} from '@/app/api/llm/v1/chat/completions/lib/tool-loop';
import {
  classifyToolLoopInputs,
  functionToolName,
  type ToolLoopApprovalMode,
} from '@/app/api/llm/v1/chat/completions/lib/tool-loop-routing';
import { EXECUTE_CODE_TOOL, resolveTurnCodeExecutionTools } from '@/lib/e2b/execution-tools';
import { e2bProvisioningReady } from '@/lib/e2b/gate';
import { e2bChatTemplate } from '@/lib/e2b/chat-template';
import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';
import {
  formatProjectSystemPrompt,
  loadProjectContext,
  projectContextLoaders,
  type LoadedProjectContext,
} from '@/lib/services/project-context-service';
import {
  formatManagedMemorySystemPrompt,
  loadManagedMemoryPolicy,
  loadOrganizationContextPolicy,
  loadProjectMemoryScope,
  managedMemoryContextLoader,
} from '@/lib/services/managed-memory-context-service';
import {
  formatRecentChatsContext,
  RECENT_CHATS_EMPTY_NOTICE,
  RECENT_CHATS_UNAVAILABLE_NOTICE,
  recentChatsContextLoader,
} from '@/lib/services/past-chat-context-service';
import { getCustomRemoteMcpLimit } from '@/lib/services/free-plan-entitlements';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import { evaluateManagedComputeAccess } from '@/lib/services/managed-compute-access';
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
  type ManagedUsageRequestReservation,
} from '@/lib/services/managed-usage-request-service';
import {
  buildServerProviderAdapter,
  toGenericUpstreamError,
} from '@/lib/services/provider-adapter-service';
import { resolveEntitlementBundle } from '@/lib/services/entitlement-resolution';
import { readWorkspaceWebDomainPolicy } from '@/lib/services/connector-policy-service';
import {
  loadUserConnectorToolCatalog,
  makeUserConnectorExecutor,
} from '@/lib/user-connector-tools';
import { URL_FETCH_TOOL } from '@/lib/url-fetch/url-fetch-tool';
import {
  replaceNativeWebSearchTool,
  substituteGatedWebSearchTool,
} from '@/lib/web-search/required-search';
import {
  WEB_SEARCH_TOOL,
  webSearchBackendConfigured,
  webSearchToolDef,
} from '@/lib/web-search/web-search-tool';
import {
  DEFAULT_TOOL_APPROVAL_POLICY,
  toolApprovalPolicyOption,
  type ToolApprovalPolicy,
} from '@shared/types/toolApprovalPolicy';
import { logger } from '@/lib/logger';
import { ledgerCentsFromMicrousd } from '@/lib/services/credit-service';
import { dispatchProviderForSelectedRoute } from '@/lib/services/aggregator-routing';
import {
  MANAGED_CLOUD_SCHEDULE_DEFAULT_SOURCES,
  type ManagedCloudScheduleRunApprovalToolCall,
} from '@agiworkforce/cloud-contracts';
import type {
  ScheduleTask,
  ScheduledExecutionResult,
  ScheduledRunResume,
  ScheduledRunRoute,
  ScheduledTaskExecutor,
} from './schedule-service';

const MAX_PROMPT_LENGTH = 50_000;
const MAX_OUTPUT_CHARS = 100_000;
export const MAX_OUTPUT_TOKENS = 4_096;
const MAX_APPROVAL_INPUT_CHARS = 4_000;

const SCHEDULED_TASK_DIRECTIVE =
  'Complete the scheduled task now. Return the final result directly. ' +
  'No one is watching this run, so never ask a question or wait for input: use the tools ' +
  'you have, and if a step is impossible say so in the result. ' +
  'Do not claim to have performed external actions unless a tool result proves it.';

/**
 * A run bound to a project its owner can no longer read: archived, deleted, or
 * outside the workspace the task now belongs to. The chat route refuses the same
 * state rather than answering without the project, and nobody is watching this
 * one, so it ends before it spends anything.
 */
export class ScheduledProjectContextUnavailableError extends Error {
  readonly code: DomainErrorCodeValue = DomainErrorCode.RESOURCE_DELETED;

  constructor(readonly projectId: string) {
    super(
      'This scheduled task is bound to a project that is archived, deleted, or no longer readable. ' +
        'The run was stopped before it called a model. Restore the project, or remove it from the task.',
    );
    this.name = 'ScheduledProjectContextUnavailableError';
  }
}

function validateAgentTask(task: ScheduleTask): string {
  if (task.actionType !== 'agent') {
    throw new Error(`Unsupported scheduled action type: ${task.actionType}`);
  }
  const prompt = task.prompt?.trim();
  if (!prompt) throw new Error('Scheduled agent task has no prompt');
  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new Error(`Scheduled agent prompt exceeds ${MAX_PROMPT_LENGTH} characters`);
  }
  return prompt;
}

export interface ScheduledToolPlan {
  tools: unknown[];
  mcpTools: WebMcpToolDef[];
  connectorPermissions: ConnectorToolPermissions;
  connectorExecutor?: ReturnType<typeof makeUserConnectorExecutor>;
  toolApprovalPolicy: ToolApprovalPolicy;
  webSearch: boolean;
  webFetch: boolean;
  codeExecution: boolean;
  withheldTools: string[];
  webDomainPolicy?: ResearchDomainPolicy;
}

const NO_SCHEDULED_TOOLS: ScheduledToolPlan = {
  tools: [],
  mcpTools: [],
  connectorPermissions: EMPTY_CONNECTOR_TOOL_PERMISSIONS,
  toolApprovalPolicy: DEFAULT_TOOL_APPROVAL_POLICY,
  webSearch: false,
  webFetch: false,
  codeExecution: false,
  withheldTools: [],
};

const HEADLINE_WITHHELD_TOOLS: ReadonlyArray<readonly [string, string]> = [
  [WEB_SEARCH_TOOL, 'search the web'],
  [EXECUTE_CODE_TOOL, 'run code'],
];

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

export async function buildScheduledToolPlan(input: {
  db: Parameters<typeof loadConnectorToolPermissions>[0];
  userId: string;
  organizationId?: string | null;
  planTier: string;
  provider: string;
  model: string;
  webAllowed: boolean;
  connectors: readonly string[] | null;
}): Promise<ScheduledToolPlan> {
  const capabilities = getModelMetadataById(input.model)?.capabilities;
  const policy = getTierPolicy(input.planTier);
  if (capabilities?.tools !== true || policy.allowToolUse === false) return NO_SCHEDULED_TOOLS;
  const connectorsAllowed = await connectorsAllowedWithoutRequest({
    userId: input.userId,
    organizationId: input.organizationId,
    planTier: input.planTier,
  });

  const [toolApprovalPolicy, connectorPermissions] = await Promise.all([
    loadToolApprovalPolicy(input.db, input.userId),
    !connectorsAllowed
      ? Promise.resolve(EMPTY_CONNECTOR_TOOL_PERMISSIONS)
      : loadConnectorToolPermissions(input.db, input.userId, input.organizationId ?? null),
  ]);
  const asks = (name: string) => !runsWithoutAsking(name, toolApprovalPolicy, connectorPermissions);
  const withheldTools: string[] = [];

  const provider = input.provider.toLowerCase();
  let tools: unknown[] = [];
  let webSearch = false;
  let webDomainPolicy: ResearchDomainPolicy | null = null;
  if (policy.allowSearch && input.webAllowed) {
    webDomainPolicy = await readWorkspaceWebDomainPolicy(input.db, input.organizationId ?? null);
    const nativeSearch = appendWebSearchTool(provider, [], capabilities) ?? [];
    const searchTools = shouldOfferGenericWebSearchTool({
      providerLower: provider,
      toolsCapable: true,
      stream: true,
      freeTrial: false,
      backendConfigured: webSearchBackendConfigured(),
    })
      ? [...nativeSearch, webSearchToolDef()]
      : nativeSearch;
    const governedSearch = webDomainPolicy
      ? (replaceNativeWebSearchTool(searchTools, webSearchBackendConfigured()) ?? [])
      : searchTools;
    const offeredSearch =
      substituteGatedWebSearchTool(governedSearch, {
        approvalRequired: asks(WEB_SEARCH_TOOL),
        genericBackendConfigured: webSearchBackendConfigured(),
      }) ?? [];
    if (offeredSearch.length === 0 && governedSearch.length > 0) {
      withheldTools.push(WEB_SEARCH_TOOL);
    }
    webSearch = offeredSearch.length > 0;
    tools = [...tools, ...offeredSearch];
    tools =
      resolveWebFetchTools({
        providerLower: provider,
        model: input.model,
        tools,
        toolsCapable: true,
        stream: true,
        nativeFetchPermitted: !asks(URL_FETCH_TOOL) && !webDomainPolicy,
      }) ?? tools;
  }

  const codeExecution = resolveTurnCodeExecutionTools({
    provider,
    stream: true,
    e2bEnabled: e2bProvisioningReady(),
    officeRendering: e2bChatTemplate() !== null,
    toolsCapable: true,
    codeExecutionCapable: capabilities.codeExecution === true,
  });
  const codeAsks = asks(EXECUTE_CODE_TOOL);
  const codeTools = codeExecution.tools.filter(
    (tool) => functionToolName(tool) !== '' || !codeAsks,
  );
  if (codeTools.length < codeExecution.tools.length) withheldTools.push(EXECUTE_CODE_TOOL);
  tools = [...tools, ...codeTools];

  const base = {
    tools,
    connectorPermissions,
    toolApprovalPolicy,
    webSearch,
    webFetch: policy.allowSearch && input.webAllowed,
    codeExecution: codeTools.length > 0,
    withheldTools,
    ...(webDomainPolicy ? { webDomainPolicy } : {}),
  };
  if (!connectorsAllowed) return { ...base, mcpTools: [] };

  const [operatorTools, connectorCatalog] = await Promise.all([
    loadMcpToolDefs(),
    loadUserConnectorToolCatalog(input.userId, {
      customConnectorLimit: getCustomRemoteMcpLimit(input.planTier) ?? undefined,
      planTier: input.planTier,
      organizationId: input.organizationId,
      isToolDenied: connectorPermissions.isConnectorToolDenied,
      googleUserDataRouted: modelKeepsInputsOutOfTraining(input.model),
    }),
  ]);
  const mcpTools = [...operatorTools, ...connectorCatalog.tools].filter(
    (tool) =>
      !connectorPermissions.isDenied(tool.qualifiedName) &&
      (tool.origin !== 'connector' ||
        input.connectors === null ||
        input.connectors.includes(tool.serverId)),
  );
  return {
    ...base,
    mcpTools,
    ...(mcpTools.some((tool) => tool.origin === 'connector')
      ? { connectorExecutor: makeUserConnectorExecutor(input.userId, input.organizationId) }
      : {}),
  };
}

export function withheldToolsDirective(plan: ScheduledToolPlan): string | null {
  if (plan.withheldTools.length === 0) return null;
  const { label } = toolApprovalPolicyOption(plan.toolApprovalPolicy);
  return (
    `These tools were not offered to this run: ${plan.withheldTools.join(', ')}. Under the ` +
    `account's Tool approvals setting ("${label}") each needs the user's approval, and with ` +
    "this model they run inside the provider's turn, where the run cannot pause to ask. If " +
    'the task needed one of them, say in the result which step was skipped and why.'
  );
}

function withheldCapabilityNote(plan: {
  withheldTools: readonly string[];
  toolApprovalPolicy: ToolApprovalPolicy;
}): string | null {
  const actions = HEADLINE_WITHHELD_TOOLS.filter(([name]) => plan.withheldTools.includes(name)).map(
    ([, action]) => action,
  );
  if (actions.length === 0) return null;
  const { label } = toolApprovalPolicyOption(plan.toolApprovalPolicy);
  const readOnly = toolApprovalPolicyOption('auto_approve_read_only').label;
  const list = new Intl.ListFormat('en', { style: 'long', type: 'disjunction' }).format(actions);
  return (
    `This run could not ${list}: under your Tool approvals setting ("${label}") each needs ` +
    "your approval, and with this model they run inside the provider's turn, where the run " +
    `cannot pause to ask you. Choose "${readOnly}" in Settings → Capabilities → Tool ` +
    'approvals to let scheduled runs do this.'
  );
}

/**
 * An unattended run resolves its context through the same engine an attended
 * turn does, so the workspace policy, the ownership checks and the per-source
 * budgets apply here too and the run leaves a manifest behind.
 */
async function resolveScheduledContext(input: {
  task: ScheduleTask;
  runId: string;
  scope: Parameters<ScheduledTaskExecutor>[3];
  projectContext: LoadedProjectContext | null;
  includeMemory: boolean;
  includeRecentChats: boolean;
}): Promise<{
  projectPrompt: string | null;
  memoryPrompt: string | null;
  recentChatsPrompt: string | null;
  recentChatsIncluded: boolean;
}> {
  const { scope, task } = input;
  const [contextPolicy, memoryPolicy, memoryScope] = await Promise.all([
    loadOrganizationContextPolicy(scope.db, scope.organizationId),
    loadManagedMemoryPolicy(scope.db, {
      userId: scope.userId,
      organizationId: scope.organizationId,
    }),
    loadProjectMemoryScope(scope.db, { userId: scope.userId, projectId: task.projectId ?? null }),
  ]);
  const memoryLoader = managedMemoryContextLoader(scope.db, {
    userId: scope.userId,
    organizationId: scope.organizationId,
    scope: memoryScope,
    policy: memoryPolicy,
  });
  const recentChatsLoader =
    input.includeRecentChats && memoryPolicy.searchPastChats
      ? recentChatsContextLoader(scope.db, {
          userId: scope.userId,
          organizationId: scope.organizationId,
          scope: memoryScope,
        })
      : null;

  const resolution = await resolveContext({
    turnId: `schedule-run-${input.runId}`,
    actor: {
      userId: scope.userId,
      organizationId: scope.organizationId ?? null,
      projectId: task.projectId ?? null,
    },
    policy: contextPolicy,
    loaders: [
      ...(input.projectContext ? projectContextLoaders(input.projectContext) : []),
      ...(input.includeMemory ? [memoryLoader] : []),
      ...(recentChatsLoader ? [recentChatsLoader] : []),
    ],
    store: createPostgresContextManifestStore(scope.db),
    onLoaderError: (sourceClass, error) => {
      logger.warn(
        { taskId: task.id, runId: input.runId, sourceClass, error },
        'Scheduled run context source failed to load',
      );
    },
  });

  const memories = resolution.itemsOf('account_memory').flatMap((item) => {
    const memory = memoryLoader.itemFor(item.source.id);
    return memory ? [memory] : [];
  });
  const projectIncluded = resolution.manifest.entries.some(
    (entry) =>
      entry.sourceClass !== 'account_memory' &&
      entry.sourceClass !== 'past_chat' &&
      entry.includedCount > 0,
  );
  const recentChats = recentChatsLoader
    ? resolution.itemsOf('past_chat').flatMap((item) => {
        const excerpt = recentChatsLoader.excerptFor(item.source.id);
        return excerpt ? [{ ...excerpt, content: item.text }] : [];
      })
    : [];
  const recentChatsEntry = resolution.manifest.entries.find(
    (entry) => entry.sourceClass === 'past_chat',
  );
  const recentChatsWithheld =
    !recentChatsLoader ||
    recentChatsLoader.degraded() ||
    (recentChatsEntry !== undefined && recentChatsEntry.candidateCount > 0);
  const recentChatsPrompt = !input.includeRecentChats
    ? null
    : (formatRecentChatsContext(recentChats) ??
      (recentChatsWithheld ? RECENT_CHATS_UNAVAILABLE_NOTICE : RECENT_CHATS_EMPTY_NOTICE));

  return {
    projectPrompt:
      input.projectContext && projectIncluded
        ? formatProjectSystemPrompt(input.projectContext)
        : null,
    memoryPrompt: memories.length > 0 ? formatManagedMemorySystemPrompt(memories) : null,
    recentChatsPrompt,
    recentChatsIncluded: recentChats.length > 0,
  };
}

export interface ScheduledCompletion {
  text: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costMicrousd: number;
  toolsUsed: string[];
  approval?: ToolLoopApprovalCheckpoint;
}

export type ScheduledMessages = ProcessedRequest['llmRequest']['messages'];

function buildScheduledProcessedRequest(input: {
  task: ScheduleTask;
  runId: string;
  prompt: string;
  messages: ScheduledMessages;
  plan: ScheduledToolPlan;
  route: { provider: string; modelKey: string };
  subscriptionTier: string;
  isFlagship: boolean;
  estimatedCostMicrousd: number;
  estimatedPromptTokens: number;
  taskType: ReturnType<typeof classifyTaskLocally>['type'];
  organizationId?: string | null;
  reservation: ManagedUsageRequestReservation;
  sensitiveContextPresent: boolean;
  googleUserData: boolean;
}): ProcessedRequest {
  const chatRequest: ChatCompletionRequest = {
    model: input.route.modelKey,
    messages: [{ role: 'user', content: input.prompt }],
    stream: true,
    web_search: input.plan.webSearch,
    web_fetch: input.plan.webFetch,
    code_execution: input.plan.codeExecution,
  };

  return {
    requestId: `schedule-run-${input.runId}`,
    chatSurface: 'web',
    sensitiveContextPresent: input.sensitiveContextPresent,
    googleUserData: input.googleUserData,
    organizationId: input.organizationId,
    managedUsage: input.reservation,
    chatRequest,
    conversationId: undefined,
    requestedModel: input.route.modelKey,
    provider: input.route.provider,
    estimatedCostMicrousd: input.estimatedCostMicrousd,
    estimatedCostCents: ledgerCentsFromMicrousd(input.estimatedCostMicrousd),
    estimatedPromptTokens: input.estimatedPromptTokens,
    maxTokens: MAX_OUTPUT_TOKENS,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: input.task.model ?? 'auto',
    subscriptionTier: input.subscriptionTier,
    resolvedTaskType: input.taskType,
    classifierConfidence: 1,
    resolvedSlot: getSlotForModel(input.route.modelKey),
    quotaFeature: 'chat',
    quotaWarningHeader: null,
    isFlagshipRequest: input.isFlagship,
    indicResult: detectIndicScript(input.prompt),
    ...(input.plan.webDomainPolicy ? { webSearchDomainPolicy: input.plan.webDomainPolicy } : {}),
    llmRequest: {
      model: input.route.modelKey,
      messages: input.messages,
      max_tokens: MAX_OUTPUT_TOKENS,
      stream: true,
      tools: input.plan.tools,
    },
  };
}

export async function runScheduledToolLoop(input: {
  processed: ProcessedRequest;
  plan: ScheduledToolPlan;
  approvalMode: ToolLoopApprovalMode;
  userId: string;
  signal: AbortSignal;
  usage: ObservedProviderUsage;
  resume?: ScheduledRunResume;
  onEnvelope?: (envelope: AgentEventEnvelope) => Promise<void>;
  isCancellationRequested?: () => Promise<boolean>;
}): Promise<ScheduledCompletion> {
  const usage = input.usage;
  const toolsUsed: string[] = [];
  let text = '';
  let reportedError: string | undefined;
  let approval: ToolLoopApprovalCheckpoint | undefined;
  const resume = input.resume;

  const loop = runToolLoop(input.processed, {
    mcpTools: input.plan.mcpTools,
    approvalMode: input.approvalMode,
    toolApprovalPolicy: input.plan.toolApprovalPolicy,
    unattended: true,
    unattendedEscalationPauses: true,
    userId: input.userId,
    connectorPermissions: input.plan.connectorPermissions,
    ...(input.plan.connectorExecutor ? { connectorExecutor: input.plan.connectorExecutor } : {}),
    usage,
    signal: input.signal,
    ...(input.isCancellationRequested
      ? { isCancellationRequested: input.isCancellationRequested }
      : {}),
    ...(resume
      ? {
          resume: {
            approvals: resume.checkpoint.pendingToolCalls.map((call) => ({
              toolCallId: call.id,
              decision: resume.decision,
            })),
          },
          eventSessionId: resume.checkpoint.sessionId,
          eventTurnId: resume.checkpoint.turnId,
          initialEventSequence: resume.checkpoint.nextEventSequence,
          initialCompletedSteps: resume.checkpoint.completedSteps,
          invocationContinuation: false,
        }
      : {}),
    onApprovalCheckpoint: async (checkpoint) => {
      approval = checkpoint;
    },
  });

  for await (const chunk of loop) {
    text += extractAssistantTextDelta(chunk);
    for (const envelope of extractManagedAgentEventEnvelopes(chunk)) {
      if (envelope.event.type === 'tool-execution-start') toolsUsed.push(envelope.event.name);
      if (envelope.event.type === 'error' && !reportedError) reportedError = envelope.event.message;
      await input.onEnvelope?.(envelope);
    }
  }

  if (reportedError && !approval) throw new Error(reportedError);

  return {
    text: text.trim(),
    promptTokens: usage.inputTokens,
    completionTokens: usage.outputTokens,
    totalTokens: usage.inputTokens + usage.outputTokens,
    costMicrousd: hasObservedProviderUsage(usage)
      ? observedProviderUsageLedgerMicrousd(usage, {
          provider: input.processed.provider,
          model: input.processed.requestedModel,
        })
      : 0,
    toolsUsed,
    ...(approval ? { approval } : {}),
  };
}

export async function runScheduledCompletion(input: {
  messages: ScheduledMessages;
  route: ScheduledRunRoute;
  signal: AbortSignal;
}): Promise<ScheduledCompletion> {
  const dispatchProvider = dispatchProviderForSelectedRoute(input.route);
  const adapter = buildServerProviderAdapter(dispatchProvider);
  const chatRequest = openAIWireRequestToChatRequest({
    model: input.route.providerModelId,
    messages: input.messages.map((message) => ({ role: message.role, content: message.content })),
    max_tokens: MAX_OUTPUT_TOKENS,
    stream: false,
  });
  const wireMode = resolveWireMode(dispatchProvider);
  const response = await drainToLlmResponse(
    adapter.stream(chatRequest, input.signal),
    input.route.modelKey,
    (chunk) => toGenericUpstreamError(dispatchProvider, chunk),
    wireMode,
  );
  return {
    text: response.content.trim(),
    promptTokens: response.promptTokens,
    completionTokens: response.completionTokens,
    totalTokens: response.totalTokens,
    costMicrousd: LLMCostCalculator.calculateCostMicrousd(
      input.route.provider,
      input.route.modelKey,
      {
        promptTokens: response.promptTokens,
        completionTokens: response.completionTokens,
        totalTokens: response.totalTokens,
        cacheReadInputTokens: response.cachedInputTokens,
        cacheCreationInputTokens: response.cacheCreationInputTokens,
        cacheCreation1hInputTokens: response.cacheCreation1hInputTokens,
      },
    ),
    toolsUsed: [],
  };
}

const NO_TRAINING_MODEL_MESSAGE =
  'No model on your plan keeps your chats out of training right now, so this scheduled run did not start.';

const GOOGLE_USER_DATA_ROUTE_MESSAGE =
  'This task reads data from your Google account, and no model on your plan that keeps it out of training is available right now, so this scheduled run did not start.';

async function scheduledRunReachesGoogleUserData(
  db: Parameters<typeof connectedGoogleUserDataConnectorIds>[0],
  userId: string,
  organizationId: string | null,
  task: ScheduleTask,
  sources: { project: boolean },
): Promise<boolean> {
  const [google, hosted] = await Promise.all([
    connectedGoogleUserDataConnectorIds(db, userId),
    googleHostedCustomServerIds(db, userId, organizationId),
  ]);
  if (hosted === null) return true;
  const connected = [...google, ...hosted];
  const connectors = task.connectors ?? null;
  if (connected.some((connectorId) => connectors === null || connectors.includes(connectorId))) {
    return true;
  }
  return Boolean(
    task.projectId && sources.project && (await projectHoldsGoogleUserData(db, task.projectId)),
  );
}

async function selectScheduledRoute(
  scope: { db: Parameters<typeof sideCallRoutingRequest>[0]; userId: string },
  task: ScheduleTask,
  taskType: ReturnType<typeof classifyTaskLocally>['type'],
  subscriptionTier: string,
  googleUserData: boolean,
): Promise<ScheduledRunRoute> {
  return selectUnattendedRoute(scope, task.model ?? 'auto', taskType, subscriptionTier);
}

export async function selectUnattendedRoute(
  scope: { db: Parameters<typeof sideCallRoutingRequest>[0]; userId: string },
  selection: string,
  taskType: ReturnType<typeof classifyTaskLocally>['type'],
  subscriptionTier: string,
): Promise<ScheduledRunRoute> {
  const baseRouting: AutoRoutingRequest = {
    selection,
    taskType,
    subscriptionTier,
    trustMode: 'managed_cloud',
    runtimeProfileId: 'web/cloud-chat',
    retiredModelKeys: modelsPastDeprecationDate(),
  };
  const routing = await sideCallRoutingRequest(scope.db, scope.userId, baseRouting, {
    forceNoTraining: googleUserData,
  });
  const noTrainingMessage = googleUserData
    ? GOOGLE_USER_DATA_ROUTE_MESSAGE
    : NO_TRAINING_MODEL_MESSAGE;
  if (!routing) throw new Error(noTrainingMessage);
  const route = resolveAutoRoute(routing);
  if (route.status === 'unavailable') {
    throw new Error(
      routing === baseRouting
        ? 'The selected model is not available for scheduled managed execution'
        : noTrainingMessage,
    );
  }
  if (googleUserData && !modelKeepsInputsOutOfTraining(route.modelKey)) {
    throw new Error(GOOGLE_USER_DATA_ROUTE_MESSAGE);
  }
  if (route.harnessId.endsWith('/media')) {
    throw new Error('Scheduled media generation is unavailable');
  }
  return {
    provider: route.provider,
    providerModelId: route.providerModelId,
    modelKey: route.modelKey,
    routeId: route.routeId,
  };
}

function resumedRoute(route: ScheduledRunRoute): ScheduledRunRoute {
  if (!getModelMetadataById(route.modelKey)) {
    throw new Error('The model this run started with is no longer available, so it cannot resume');
  }
  return route;
}

export function approvalToolCalls(
  checkpoint: ToolLoopApprovalCheckpoint,
): ManagedCloudScheduleRunApprovalToolCall[] {
  return checkpoint.pendingToolCalls.map((call) => {
    const requested = checkpoint.events
      .map((envelope) => envelope.event)
      .find((event) => event.type === 'approval-requested' && event.toolCallId === call.id);
    const input = Object.keys(call.args).length > 0 ? JSON.stringify(call.args, null, 2) : null;
    return {
      id: call.id,
      name: call.qualifiedName,
      summary:
        requested?.type === 'approval-requested'
          ? requested.summary
          : canonicalToolSummary(call.qualifiedName, 'other', call.args),
      input:
        input && input.length > MAX_APPROVAL_INPUT_CHARS
          ? `${input.slice(0, MAX_APPROVAL_INPUT_CHARS - 1)}…`
          : input,
    };
  });
}

export interface ScheduledAgentRunOptions {
  /** The run was started by an event carrying Google user data, such as a Gmail trigger. */
  googleUserDataEvent?: boolean;
}

export function scheduledAgentExecutor(
  options: ScheduledAgentRunOptions = {},
): ScheduledTaskExecutor {
  return (task, signal, runId, scope, resume) =>
    runScheduledAgent(task, signal, runId, scope, resume, options);
}

export const executeScheduledAgent: ScheduledTaskExecutor = scheduledAgentExecutor();

async function runScheduledAgent(
  task: ScheduleTask,
  signal: AbortSignal,
  runId: string,
  scope: Parameters<ScheduledTaskExecutor>[3],
  resume: Parameters<ScheduledTaskExecutor>[4],
  options: ScheduledAgentRunOptions,
): Promise<ScheduledExecutionResult> {
  const prompt = validateAgentTask(task);
  if (task.userId !== scope.userId) {
    throw new Error('Scheduled execution scope does not match the task owner');
  }
  signal.throwIfAborted();

  const entitlement = await resolveEntitlementBundle(scope.db, scope.userId);
  const subscriptionTier = entitlement.plan;
  const accessDecision = await evaluateManagedComputeAccess(
    scope.db,
    scope.userId,
    entitlement.subscription,
    'api',
    { organizationId: scope.organizationId },
    'schedules',
  );
  if (!accessDecision.allowed) {
    logger.info(
      { taskId: task.id, runId, code: accessDecision.code },
      'Scheduled execution skipped by managed-compute access policy',
    );
    return {
      text: `Scheduled execution skipped: ${accessDecision.reason}`,
      model: task.model ?? 'auto',
      billingStatus: accessDecision.code,
    };
  }

  const taskType = classifyTaskLocally(prompt, []).type;
  const sources = task.sources ?? MANAGED_CLOUD_SCHEDULE_DEFAULT_SOURCES;
  const googleUserData =
    options.googleUserDataEvent === true ||
    (await scheduledRunReachesGoogleUserData(
      scope.db,
      scope.userId,
      scope.organizationId,
      task,
      sources,
    ));
  const route = resume
    ? resumedRoute(resume.checkpoint.route)
    : await selectScheduledRoute(scope, task, taskType, subscriptionTier, googleUserData);
  if (resume && !modelKeepsInputsOutOfTraining(route.modelKey)) {
    if (googleUserData) throw new Error(GOOGLE_USER_DATA_ROUTE_MESSAGE);
    if (await sideCallTrainingOptOut(scope.db, scope.userId)) {
      throw new Error(NO_TRAINING_MODEL_MESSAGE);
    }
  }
  const dispatchProvider = dispatchProviderForSelectedRoute(route);
  const isFlagshipRoute = isFlagshipRoutingSlot(getSlotForModel(route.modelKey));

  const plan = await buildScheduledToolPlan({
    db: scope.db,
    userId: scope.userId,
    organizationId: scope.organizationId,
    planTier: subscriptionTier,
    provider: dispatchProvider,
    model: route.modelKey,
    webAllowed: sources.web,
    connectors: task.connectors ?? null,
  });
  if (
    !modelKeepsInputsOutOfTraining(route.modelKey) &&
    plan.mcpTools.some(
      (tool) => tool.googleUserData === true || readsGoogleUserData(tool.serverId, tool.toolName),
    )
  ) {
    throw new Error(GOOGLE_USER_DATA_ROUTE_MESSAGE);
  }
  const loopInputs = classifyToolLoopInputs(plan.mcpTools, plan.tools, plan.toolApprovalPolicy);
  const toolLoopRunnable = loopInputs.shouldRun && Boolean(ADAPTER_PROVIDERS[dispatchProvider]);
  if (resume && !toolLoopRunnable) {
    throw new Error('This run cannot resume: its model can no longer call tools');
  }

  let messages: ScheduledMessages;
  let promptChars: number;
  let sensitiveContextPresent: boolean;
  if (resume) {
    messages = resume.checkpoint.messages;
    promptChars = JSON.stringify(messages).length;
    sensitiveContextPresent = resume.checkpoint.sensitiveContextPresent;
  } else {
    const readsProject = Boolean(task.projectId) && sources.project;
    const projectContext =
      task.projectId && readsProject
        ? await loadProjectContext(scope.db, { projectId: task.projectId, userId: scope.userId })
        : null;
    if (task.projectId && readsProject && !projectContext) {
      throw new ScheduledProjectContextUnavailableError(task.projectId);
    }
    const resolved = await resolveScheduledContext({
      task,
      runId,
      scope,
      projectContext,
      includeMemory: sources.memory,
      includeRecentChats: sources.recentChats === true,
    });
    const systemPrompt = [
      resolved.projectPrompt,
      resolved.memoryPrompt,
      resolved.recentChatsPrompt,
      buildCapabilityPreamble({ tools: plan.tools, timeZone: task.timezone }),
      withheldToolsDirective(plan),
      SCHEDULED_TASK_DIRECTIVE,
    ]
      .filter((block): block is string => Boolean(block))
      .join('\n\n');
    messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ];
    promptChars = prompt.length + systemPrompt.length;
    sensitiveContextPresent =
      projectContext !== null || resolved.memoryPrompt !== null || resolved.recentChatsIncluded;
  }

  const estimatedPromptTokens = Math.ceil(promptChars / 3.5) + 32;
  const estimatedCostMicrousd = LLMCostCalculator.estimateCostMicrousd(
    route.provider,
    route.modelKey,
    estimatedPromptTokens,
    MAX_OUTPUT_TOKENS,
  );
  const idempotencyKey = resume
    ? `schedule-run:${runId}:resume:${resume.checkpoint.completedSteps}`
    : `schedule-run:${runId}`;
  const requestHash = fingerprintManagedUsageRequest({
    kind: 'scheduled_agent_execution',
    taskId: task.id,
    runId,
    organizationId: scope.organizationId,
    prompt,
    requestedModel: task.model,
    provider: route.provider,
    model: route.modelKey,
    providerModelId: route.providerModelId,
    ...(resume ? { resumeStep: resume.checkpoint.completedSteps, decision: resume.decision } : {}),
  });
  const reservation = await reserveManagedUsageRequest({
    db: scope.db,
    userId: scope.userId,
    idempotencyKey,
    requestHash,
    provider: route.provider,
    model: route.modelKey,
    estimatedCostMicrousd,
    leaseSeconds: 120,
    planTier: subscriptionTier,
    isFlagship: isFlagshipRoute,
  });

  const observedUsage = createObservedProviderUsage();
  let providerCompleted = false;
  try {
    signal.throwIfAborted();
    await markManagedUsageProviderStarted(reservation);
    const completion = toolLoopRunnable
      ? await runScheduledToolLoop({
          processed: buildScheduledProcessedRequest({
            task,
            runId,
            prompt,
            messages,
            plan,
            route: { ...route, provider: dispatchProvider },
            subscriptionTier,
            isFlagship: isFlagshipRoute,
            estimatedCostMicrousd,
            estimatedPromptTokens,
            taskType,
            organizationId: scope.organizationId,
            reservation,
            sensitiveContextPresent,
            googleUserData: googleUserData || modelKeepsInputsOutOfTraining(route.modelKey),
          }),
          plan,
          approvalMode: loopInputs.approvalMode,
          userId: scope.userId,
          signal,
          usage: observedUsage,
          resume,
        })
      : await runScheduledCompletion({ messages, route, signal });
    if (!completion.approval && !completion.text) {
      throw new Error('Scheduled provider response contained no text');
    }
    providerCompleted = true;

    const finalization = await finalizeManagedUsageRequest({
      ...reservation,
      outcome: 'completed',
      actualCostMicrousd: completion.costMicrousd,
      usage: {
        type: 'scheduled_agent_execution',
        taskId: task.id,
        runId,
        provider: route.provider,
        model: route.modelKey,
        promptTokens: completion.promptTokens,
        completionTokens: completion.completionTokens,
        totalTokens: completion.totalTokens,
        toolCalls: completion.toolsUsed.length,
        ...(completion.approval ? { awaitingApproval: true } : {}),
      },
    });

    const note = completion.approval ? null : withheldCapabilityNote(plan);
    return {
      text: note
        ? `${completion.text.slice(0, MAX_OUTPUT_CHARS - note.length - 2)}\n\n${note}`
        : completion.text.slice(0, MAX_OUTPUT_CHARS),
      model: route.modelKey,
      provider: route.provider,
      ...(completion.toolsUsed.length > 0 ? { toolsUsed: completion.toolsUsed } : {}),
      usage: {
        promptTokens: completion.promptTokens,
        completionTokens: completion.completionTokens,
        totalTokens: completion.totalTokens,
      },
      billingStatus: finalization.settlementStatus ?? finalization.requestStatus,
      ...(completion.approval
        ? {
            approval: {
              checkpoint: {
                sessionId: completion.approval.sessionId,
                turnId: completion.approval.turnId,
                nextEventSequence: completion.approval.nextEventSequence,
                completedSteps: completion.approval.completedSteps,
                messages: completion.approval.messages,
                pendingToolCalls: completion.approval.pendingToolCalls,
                route,
                sensitiveContextPresent,
              },
              toolCalls: approvalToolCalls(completion.approval),
            },
          }
        : {}),
    };
  } catch (error) {
    if (!providerCompleted) {
      // A tool loop can fail after several billable provider steps; settling those
      // at zero would hand back spend the provider already charged for.
      const observedCostMicrousd = hasObservedProviderUsage(observedUsage)
        ? observedProviderUsageLedgerMicrousd(observedUsage, {
            provider: route.provider,
            model: route.modelKey,
          })
        : 0;
      try {
        await finalizeManagedUsageRequest({
          ...reservation,
          outcome: observedCostMicrousd > 0 ? 'completed' : 'failed',
          actualCostMicrousd: observedCostMicrousd,
          usage: {
            type: 'scheduled_agent_execution',
            taskId: task.id,
            runId,
            reason: error instanceof Error ? error.message : String(error),
            promptTokens: observedUsage.inputTokens,
            completionTokens: observedUsage.outputTokens,
          },
        });
      } catch (releaseError) {
        logger.error(
          { taskId: task.id, runId, error: releaseError },
          'Scheduled execution reservation release could not be persisted',
        );
      }
    }
    throw error;
  }
}
