import 'server-only';

import { classifyTaskLocally, detectIndicScript, resolveAutoRoute } from '@agiworkforce/routing';
import { openAIWireRequestToChatRequest } from '@agiworkforce/provider-protocol';
import { getModelMetadataById, getSlotForModel, getTierPolicy } from '@agiworkforce/types';
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
} from '@/lib/services/project-context-service';
import { getCustomRemoteMcpLimit } from '@/lib/services/free-plan-entitlements';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import { evaluateManagedComputeAccess } from '@/lib/services/managed-compute-access';
import {
  createObservedProviderUsage,
  hasObservedProviderUsage,
  observedProviderUsageLedgerCents,
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

interface ScheduledCompletion {
  text: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costCents: number;
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
  estimatedCostCents: number;
  estimatedPromptTokens: number;
  taskType: ReturnType<typeof classifyTaskLocally>['type'];
  organizationId?: string | null;
  reservation: ManagedUsageRequestReservation;
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
    organizationId: input.organizationId,
    managedUsage: input.reservation,
    chatRequest,
    conversationId: undefined,
    requestedModel: input.route.modelKey,
    provider: input.route.provider,
    estimatedCostCents: input.estimatedCostCents,
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
    costCents: hasObservedProviderUsage(usage)
      ? observedProviderUsageLedgerCents(usage, {
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
  route: { provider: string; providerModelId: string; modelKey: string };
  signal: AbortSignal;
}): Promise<ScheduledCompletion> {
  const adapter = buildServerProviderAdapter(input.route.provider);
  const chatRequest = openAIWireRequestToChatRequest({
    model: input.route.providerModelId,
    messages: [
      { role: 'system', content: input.systemPrompt },
      { role: 'user', content: input.prompt },
    ],
    max_tokens: MAX_OUTPUT_TOKENS,
    stream: false,
  });
  const wireMode = resolveWireMode(input.route.provider);
  const response = await drainToLlmResponse(
    adapter.stream(chatRequest, input.signal),
    input.route.modelKey,
    (chunk) => toGenericUpstreamError(input.route.provider, chunk),
    wireMode,
  );
  return {
    text: response.content.trim(),
    promptTokens: response.promptTokens,
    completionTokens: response.completionTokens,
    totalTokens: response.totalTokens,
    costCents: LLMCostCalculator.calculateCost(input.route.provider, input.route.modelKey, {
      promptTokens: response.promptTokens,
      completionTokens: response.completionTokens,
      totalTokens: response.totalTokens,
      cacheReadInputTokens: response.cachedInputTokens,
      cacheCreationInputTokens: response.cacheCreationInputTokens,
      cacheCreation1hInputTokens: response.cacheCreation1hInputTokens,
    }),
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
  const resolvedSlot = getSlotForModel(route.modelKey);
  const isFlagshipRoute =
    resolvedSlot === 'flagship_coding_pro_plus' || resolvedSlot === 'flagship_general_pro_plus';

  const plan = await buildScheduledToolPlan({
    db: scope.db,
    userId: scope.userId,
    organizationId: scope.organizationId,
    planTier: subscriptionTier,
    provider: route.provider,
    model: route.modelKey,
  });
  const toolLoopRunnable =
    classifyToolLoopInputs(plan.mcpTools, plan.tools).shouldRun &&
    Boolean(ADAPTER_PROVIDERS[route.provider]);
  const projectContext = task.projectId
    ? await loadProjectContext(scope.db, { projectId: task.projectId, userId: scope.userId })
    : null;
  const systemPrompt = [
    projectContext ? formatProjectSystemPrompt(projectContext) : null,
    buildCapabilityPreamble({ tools: plan.tools, timeZone: task.timezone }),
    SCHEDULED_TASK_DIRECTIVE,
  ]
    .filter((block): block is string => Boolean(block))
    .join('\n\n');

  const estimatedPromptTokens = Math.ceil((prompt.length + systemPrompt.length) / 3.5) + 32;
  const estimatedCostCents = LLMCostCalculator.estimateCost(
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
    estimatedCostCents,
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
            route,
            subscriptionTier,
            isFlagship: isFlagshipRoute,
            estimatedCostCents,
            estimatedPromptTokens,
            taskType,
            organizationId: scope.organizationId,
            reservation,
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
      actualCostCents: completion.costCents,
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
        costCents: completion.costCents,
      },
      billingStatus: finalization.settlementStatus ?? finalization.requestStatus,
    };
  } catch (error) {
    if (!providerCompleted) {
      // A tool loop can fail after several billable provider steps; settling those
      // at zero would hand back spend the provider already charged for.
      const observedCostCents = hasObservedProviderUsage(observedUsage)
        ? observedProviderUsageLedgerCents(observedUsage, {
            provider: route.provider,
            model: route.modelKey,
          })
        : 0;
      try {
        await finalizeManagedUsageRequest({
          ...reservation,
          outcome: observedCostCents > 0 ? 'completed' : 'failed',
          actualCostCents: observedCostCents,
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
