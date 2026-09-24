import 'server-only';

import {
  createPostgresContextManifestStore,
  resolveContext,
  type ContextCandidate,
  type ContextSourceLoader,
} from '@agiworkforce/context-engine';
import { classifyTaskLocally, detectIndicScript, resolveAutoRoute } from '@agiworkforce/routing';
import { openAIWireRequestToChatRequest } from '@agiworkforce/provider-protocol';
import {
  DomainErrorCode,
  getModelMetadataById,
  getSlotForModel,
  getTierPolicy,
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
import { loadMcpToolDefs, runToolLoop } from '@/app/api/llm/v1/chat/completions/lib/tool-loop';
import { classifyToolLoopInputs } from '@/app/api/llm/v1/chat/completions/lib/tool-loop-routing';
import { resolveTurnCodeExecutionTools } from '@/lib/e2b/execution-tools';
import { e2bProvisioningReady } from '@/lib/e2b/gate';
import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';
import {
  formatProjectSystemPrompt,
  loadProjectContext,
  type LoadedProjectContext,
} from '@/lib/services/project-context-service';
import {
  formatManagedMemorySystemPrompt,
  loadManagedMemoryPolicy,
  loadOrganizationContextPolicy,
  loadProjectMemoryScope,
  managedMemoryContextLoader,
} from '@/lib/services/managed-memory-context-service';
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
import { SubscriptionService } from '@/lib/services/subscription-service';
import {
  loadUserConnectorToolCatalog,
  makeUserConnectorExecutor,
} from '@/lib/user-connector-tools';
import { webSearchBackendConfigured, webSearchToolDef } from '@/lib/web-search/web-search-tool';
import { logger } from '@/lib/logger';
import { ledgerCentsFromMicrousd } from '@/lib/services/credit-service';
import { dispatchProviderForSelectedRoute } from '@/lib/services/aggregator-routing';
import type {
  ScheduleTask,
  ScheduledExecutionResult,
  ScheduledTaskExecutor,
} from './schedule-service';

const MAX_PROMPT_LENGTH = 50_000;
const MAX_OUTPUT_CHARS = 100_000;
const MAX_OUTPUT_TOKENS = 4_096;

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

interface ScheduledToolPlan {
  tools: unknown[];
  mcpTools: WebMcpToolDef[];
  connectorPermissions: ConnectorToolPermissions;
  connectorExecutor?: ReturnType<typeof makeUserConnectorExecutor>;
  webSearch: boolean;
  codeExecution: boolean;
}

const NO_SCHEDULED_TOOLS: ScheduledToolPlan = {
  tools: [],
  mcpTools: [],
  connectorPermissions: EMPTY_CONNECTOR_TOOL_PERMISSIONS,
  webSearch: false,
  codeExecution: false,
};

/**
 * Unattended runs offer only what the catalog, the plan tier and the user's own
 * saved verdicts can back: a missing catalog entry grants nothing, and an MCP or
 * connector tool runs only when its saved level is already `allow`, a scheduled
 * run has nobody to answer an approval prompt, so anything still needing one is
 * never advertised to the model.
 */
async function buildScheduledToolPlan(input: {
  db: Parameters<typeof loadConnectorToolPermissions>[0];
  userId: string;
  organizationId?: string | null;
  planTier: string;
  provider: string;
  model: string;
}): Promise<ScheduledToolPlan> {
  const capabilities = getModelMetadataById(input.model)?.capabilities;
  const policy = getTierPolicy(input.planTier);
  if (capabilities?.tools !== true || policy.allowToolUse === false) return NO_SCHEDULED_TOOLS;

  const provider = input.provider.toLowerCase();
  let tools: unknown[] = [];
  const webSearch = policy.allowSearch;
  if (webSearch) {
    tools = appendWebSearchTool(provider, tools, capabilities) ?? tools;
    if (
      shouldOfferGenericWebSearchTool({
        providerLower: provider,
        toolsCapable: true,
        stream: true,
        freeTrial: false,
        backendConfigured: webSearchBackendConfigured(),
      })
    ) {
      tools = [...tools, webSearchToolDef()];
    }
    tools =
      resolveWebFetchTools({
        providerLower: provider,
        model: input.model,
        tools,
        toolsCapable: true,
        stream: true,
      }) ?? tools;
  }

  const codeExecution = resolveTurnCodeExecutionTools({
    provider,
    stream: true,
    e2bEnabled: e2bProvisioningReady(),
    toolsCapable: true,
    codeExecutionCapable: capabilities.codeExecution === true,
  });
  tools = [...tools, ...codeExecution.tools];

  if (policy.allowMCP === false) {
    return {
      tools,
      mcpTools: [],
      connectorPermissions: EMPTY_CONNECTOR_TOOL_PERMISSIONS,
      webSearch,
      codeExecution: codeExecution.tools.length > 0,
    };
  }

  const connectorPermissions = await loadConnectorToolPermissions(input.db, input.userId);
  const [operatorTools, connectorCatalog] = await Promise.all([
    loadMcpToolDefs(),
    loadUserConnectorToolCatalog(input.userId, {
      customConnectorLimit: getCustomRemoteMcpLimit(input.planTier) ?? undefined,
      planTier: input.planTier,
      organizationId: input.organizationId,
      isToolDenied: connectorPermissions.isConnectorToolDenied,
    }),
  ]);
  const mcpTools = [...operatorTools, ...connectorCatalog.tools].filter(
    (tool) => connectorPermissions.levelFor(tool.qualifiedName) === 'allow',
  );

  return {
    tools,
    mcpTools,
    connectorPermissions,
    ...(mcpTools.some((tool) => tool.origin === 'connector')
      ? { connectorExecutor: makeUserConnectorExecutor(input.userId, input.organizationId) }
      : {}),
    webSearch,
    codeExecution: codeExecution.tools.length > 0,
  };
}

const PROJECT_SOURCE_BUDGET_CHARS: Readonly<Record<string, number>> = {
  project_instruction: 8_000,
  project_knowledge_file: 48_000,
  project_sibling_chat: 16_000,
};

/**
 * The project's own sources as engine candidates, one loader per class so the
 * manifest says which kind of project context contributed what. The text is
 * what each source contributes to the prompt, so the engine budgets and
 * deduplicates the same strings the model will read.
 */
export function projectContextLoaders(context: LoadedProjectContext): ContextSourceLoader[] {
  const siblingSources = context.sources.filter(
    (source) => source.sourceClass === 'project_sibling_chat',
  );
  const textFor = (source: (typeof context.sources)[number]): string => {
    const { locator } = source.provenance;
    if (source.sourceClass === 'project_instruction') return context.instructions?.trim() ?? '';
    if (source.sourceClass === 'project_knowledge_file') {
      const fileId = locator.slice('project_knowledge_files/'.length);
      const file = context.knowledgeFiles.find((entry) => entry.fileId === fileId);
      const passages = file?.selection?.passages.map((passage) => passage.text).join('\n');
      return passages || file?.extractedText?.trim() || file?.summary?.trim() || '';
    }
    return context.siblingChats[siblingSources.indexOf(source)]?.preview?.trim() ?? '';
  };

  return [...new Set(context.sources.map((source) => source.sourceClass))].map((sourceClass) => ({
    sourceClass,
    budgetChars: PROJECT_SOURCE_BUDGET_CHARS[sourceClass] ?? 8_000,
    load: (): ContextCandidate[] =>
      context.sources
        .filter((source) => source.sourceClass === sourceClass)
        .flatMap((source): ContextCandidate[] => {
          const text = textFor(source);
          return text ? [{ source, text }] : [];
        }),
  }));
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
}): Promise<{ projectPrompt: string | null; memoryPrompt: string | null }> {
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
      memoryLoader,
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
    (entry) => entry.sourceClass !== 'account_memory' && entry.includedCount > 0,
  );

  return {
    projectPrompt:
      input.projectContext && projectIncluded
        ? formatProjectSystemPrompt(input.projectContext)
        : null,
    memoryPrompt: memories.length > 0 ? formatManagedMemorySystemPrompt(memories) : null,
  };
}

interface ScheduledCompletion {
  text: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costMicrousd: number;
  toolsUsed: string[];
}

function buildScheduledProcessedRequest(input: {
  task: ScheduleTask;
  runId: string;
  prompt: string;
  systemPrompt: string;
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
}): ProcessedRequest {
  const messages = [
    { role: 'system' as const, content: input.systemPrompt },
    { role: 'user' as const, content: input.prompt },
  ];
  const chatRequest: ChatCompletionRequest = {
    model: input.route.modelKey,
    messages,
    stream: true,
    web_search: input.plan.webSearch,
    web_fetch: input.plan.webSearch,
    code_execution: input.plan.codeExecution,
  };

  return {
    requestId: `schedule-run-${input.runId}`,
    chatSurface: 'web',
    sensitiveContextPresent: input.sensitiveContextPresent,
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
    llmRequest: {
      model: input.route.modelKey,
      messages,
      max_tokens: MAX_OUTPUT_TOKENS,
      stream: true,
      tools: input.plan.tools,
    },
  };
}

async function runScheduledToolLoop(input: {
  processed: ProcessedRequest;
  plan: ScheduledToolPlan;
  userId: string;
  signal: AbortSignal;
  usage: ObservedProviderUsage;
}): Promise<ScheduledCompletion> {
  const usage = input.usage;
  const toolsUsed: string[] = [];
  let text = '';
  let reportedError: string | undefined;
  let approvalRequired = false;

  const loop = runToolLoop(input.processed, {
    mcpTools: input.plan.mcpTools,
    approvalMode: 'auto',
    unattended: true,
    userId: input.userId,
    connectorPermissions: input.plan.connectorPermissions,
    ...(input.plan.connectorExecutor ? { connectorExecutor: input.plan.connectorExecutor } : {}),
    usage,
    signal: input.signal,
    onApprovalCheckpoint: async () => {
      approvalRequired = true;
    },
  });

  for await (const chunk of loop) {
    text += extractAssistantTextDelta(chunk);
    for (const envelope of extractManagedAgentEventEnvelopes(chunk)) {
      if (envelope.event.type === 'tool-execution-start') toolsUsed.push(envelope.event.name);
      if (envelope.event.type === 'error' && !reportedError) reportedError = envelope.event.message;
    }
  }

  if (approvalRequired) {
    throw new Error(
      'Scheduled execution stopped: a tool call needed approval, which an unattended run cannot grant',
    );
  }
  if (reportedError) throw new Error(reportedError);

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
  };
}

async function runScheduledCompletion(input: {
  prompt: string;
  systemPrompt: string;
  route: {
    provider: string;
    providerModelId: string;
    modelKey: string;
    routeId: string;
  };
  signal: AbortSignal;
}): Promise<ScheduledCompletion> {
  const dispatchProvider = dispatchProviderForSelectedRoute(input.route);
  const adapter = buildServerProviderAdapter(dispatchProvider);
  const chatRequest = openAIWireRequestToChatRequest({
    model: input.route.providerModelId,
    messages: [
      { role: 'system', content: input.systemPrompt },
      { role: 'user', content: input.prompt },
    ],
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

export const executeScheduledAgent: ScheduledTaskExecutor = async function executeScheduledAgent(
  task: ScheduleTask,
  signal: AbortSignal,
  runId: string,
  scope,
): Promise<ScheduledExecutionResult> {
  const prompt = validateAgentTask(task);
  if (task.userId !== scope.userId) {
    throw new Error('Scheduled execution scope does not match the task owner');
  }
  signal.throwIfAborted();

  const subscription = await SubscriptionService.getSubscription(scope.db, scope.userId);
  const subscriptionTier = subscription?.plan_tier ?? 'free';
  const accessDecision = await evaluateManagedComputeAccess(
    scope.db,
    scope.userId,
    subscription,
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
  const route = resolveAutoRoute({
    selection: task.model ?? 'auto',
    taskType,
    subscriptionTier,
    trustMode: 'managed_cloud',
    runtimeProfileId: 'web/cloud-chat',
  });
  if (route.status === 'unavailable') {
    throw new Error('The selected model is not available for scheduled managed execution');
  }
  if (route.harnessId.endsWith('/media')) {
    throw new Error('Scheduled media generation is unavailable');
  }
  const dispatchProvider = dispatchProviderForSelectedRoute(route);
  const resolvedSlot = getSlotForModel(route.modelKey);
  const isFlagshipRoute =
    resolvedSlot === 'flagship_coding_pro_plus' || resolvedSlot === 'flagship_general_pro_plus';

  const plan = await buildScheduledToolPlan({
    db: scope.db,
    userId: scope.userId,
    organizationId: scope.organizationId,
    planTier: subscriptionTier,
    provider: dispatchProvider,
    model: route.modelKey,
  });
  const toolLoopRunnable =
    classifyToolLoopInputs(plan.mcpTools, plan.tools).shouldRun &&
    Boolean(ADAPTER_PROVIDERS[dispatchProvider]);
  const projectContext = task.projectId
    ? await loadProjectContext(scope.db, { projectId: task.projectId, userId: scope.userId })
    : null;
  if (task.projectId && !projectContext) {
    throw new ScheduledProjectContextUnavailableError(task.projectId);
  }
  const resolved = await resolveScheduledContext({ task, runId, scope, projectContext });
  const systemPrompt = [
    resolved.projectPrompt,
    resolved.memoryPrompt,
    buildCapabilityPreamble({ tools: plan.tools, timeZone: task.timezone }),
    SCHEDULED_TASK_DIRECTIVE,
  ]
    .filter((block): block is string => Boolean(block))
    .join('\n\n');

  const estimatedPromptTokens = Math.ceil((prompt.length + systemPrompt.length) / 3.5) + 32;
  const estimatedCostMicrousd = LLMCostCalculator.estimateCostMicrousd(
    route.provider,
    route.modelKey,
    estimatedPromptTokens,
    MAX_OUTPUT_TOKENS,
  );
  const idempotencyKey = `schedule-run:${runId}`;
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
            systemPrompt,
            plan,
            route: { ...route, provider: dispatchProvider },
            subscriptionTier,
            isFlagship: isFlagshipRoute,
            estimatedCostMicrousd,
            estimatedPromptTokens,
            taskType,
            organizationId: scope.organizationId,
            reservation,
            sensitiveContextPresent: projectContext !== null,
          }),
          plan,
          userId: scope.userId,
          signal,
          usage: observedUsage,
        })
      : await runScheduledCompletion({ prompt, systemPrompt, route, signal });
    if (!completion.text) throw new Error('Scheduled provider response contained no text');
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
      },
    });

    return {
      text: completion.text.slice(0, MAX_OUTPUT_CHARS),
      model: route.modelKey,
      provider: route.provider,
      ...(completion.toolsUsed.length > 0 ? { toolsUsed: completion.toolsUsed } : {}),
      usage: {
        promptTokens: completion.promptTokens,
        completionTokens: completion.completionTokens,
        totalTokens: completion.totalTokens,
        costCents: ledgerCentsFromMicrousd(completion.costMicrousd),
      },
      billingStatus: finalization.settlementStatus ?? finalization.requestStatus,
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
};
