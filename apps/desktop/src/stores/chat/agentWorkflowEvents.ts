import { agent } from '@agiworkforce/api';
import type { BrowserActivityEventDetail } from '@agiworkforce/types';
import { EVENTS } from '../../constants/event-names';
import { listen, type UnlistenFn, isTauri } from '../../lib/tauri-mock';
import { sha256 } from '../../lib/hash';
import { useAgentStore, type AgentStatus } from './agentStore';
import type {
  ActionLogEntry,
  ActionLogEntryType,
  ActionLogStatus,
  ApprovalRequest,
  ApprovalScope,
  PlanData,
  PlanStep,
} from './toolStore';
import { useToolStore } from './toolStore';
import {
  addNormalizedActionLogEntry,
  addNormalizedActionTrailEntry,
  addNormalizedApprovalRequest,
  focusSidecarSectionFromEvent,
  updateNormalizedActionLogEntry,
} from './runtimeEventBindings';

export interface AgentPlanUpdateEvent {
  plan: {
    id: string;
    description: string;
    workflowHash?: string;
    steps: Array<{
      id: string;
      title: string;
      description?: string;
      status?: string;
      parentId?: string;
      result?: string;
    }>;
    createdAt?: number | string;
  };
}

export interface AgentActionUpdateEvent {
  action: {
    id: string;
    workflowHash?: string;
    type?: string;
    title?: string;
    description?: string;
    status?: string;
    requiresApproval?: boolean;
    scope?: ApprovalScope;
    metadata?: Record<string, unknown>;
    result?: string;
    error?: string;
    actionId?: string;
  };
}

export interface AgentPermissionRequiredEvent {
  actionId: string;
  workflowHash?: string;
  reason?: string;
  title?: string;
  scope: ApprovalScope;
  riskLevel?: 'low' | 'medium' | 'high';
  actionSignature?: string;
  type?: string;
}

export interface AgentMetricsEvent {
  metrics: {
    workflowHash?: string;
    actionId?: string;
    tokens?: number;
    costUsd?: number;
    durationMs?: number;
    completionReason?: string;
  };
}

export interface AgentSpawnedEvent {
  agent_id: string;
  goal?: string;
}

export interface AgentStepStartedPayload {
  taskId: string;
  step: string;
  stepIndex: number;
  totalSteps: number;
  tool?: string;
  type?: string;
  url?: string;
}

export interface AgentStepCompletedPayload {
  taskId: string;
  step: string;
  result: string;
  stepIndex: number;
}

export interface AgentStepFailedPayload {
  taskId: string;
  step: string;
  error: string;
  attempt: number;
  retrying: boolean;
}

export interface AgentTaskCompletedPayload {
  taskId: string;
  success: boolean;
  stepsCompleted: number;
}

export interface AgentTaskFailedPayload {
  taskId: string;
  error: string;
}

export interface BackgroundAgentCompletedEvent {
  agentId: string;
  goal?: string;
  summaryPath?: string;
  message?: string | null;
}

export interface BackgroundAgentFailedEvent {
  agentId: string;
  goal?: string;
  error?: string;
  message?: string | null;
}

export interface ApprovalRequestEvent {
  approval: ApprovalRequest;
  messageId?: string;
}

export interface ToolConfirmationSummary {
  request_id: string;
  tool_name: string;
  tool_display_name: string;
  description: string;
  parameters_summary: string;
  risk_level: string;
  safety_tier: string;
  reason: string;
  reversible: boolean;
  undo_description?: string;
}

export interface ApprovalRequestPayload {
  id: string;
  type?: string;
  description?: string;
  riskLevel?: string;
  details?: Record<string, unknown>;
  impact?: string;
}

export interface GoalProgressEvent {
  goalId?: string;
  goal_id?: string;
  progress?: number;
  progress_percent?: number;
  completed_steps?: number;
  total_steps?: number;
  currentStep?: string;
  current_step?: string;
}

export interface GoalStepCompletedEvent {
  stepId?: string;
  step_id?: string;
  goalId?: string;
  goal_id?: string;
  success: boolean;
  output?: string;
  error?: string;
  execution_time_ms?: number;
  step_index?: number;
  total_steps?: number;
}

export interface GoalCompletedEvent {
  goalId?: string;
  goal_id?: string;
  success?: boolean;
  result?: string;
  error?: string;
  completed_steps?: number;
  total_steps?: number;
}

function normalizeActionStatus(status?: string): ActionLogStatus {
  if (!status) return 'pending';
  const normalized = status.toLowerCase();
  if (normalized === 'running' || normalized === 'in_progress') return 'running';
  if (normalized === 'success' || normalized === 'completed' || normalized === 'done')
    return 'success';
  if (normalized === 'failed' || normalized === 'error') return 'failed';
  if (normalized === 'blocked') return 'blocked';
  return 'pending';
}

function normalizeRiskLevel(risk?: string): 'low' | 'medium' | 'high' {
  if (!risk) return 'high';
  const normalized = risk.toLowerCase();
  if (normalized === 'critical' || normalized === 'high') return 'high';
  if (normalized === 'medium') return 'medium';
  return 'low';
}

function mapActionType(type?: string): ActionLogEntryType {
  switch ((type ?? '').toLowerCase()) {
    case 'filesystem':
    case 'file':
    case 'file_delete':
    case 'data_modification':
    case 'cloud':
      return 'filesystem';
    case 'browser':
      return 'browser';
    case 'automation':
      return 'ui';
    case 'calendar':
    case 'gmail':
    case 'email':
      return 'mcp';
    case 'ui':
    case 'desktop':
      return 'ui';
    case 'mcp':
      return 'mcp';
    case 'approval':
      return 'approval';
    case 'metrics':
      return 'metrics';
    case 'plan':
      return 'plan';
    default:
      return 'terminal';
  }
}

function upsertActionLogEntry(
  entry: Partial<ActionLogEntry> & { id?: string; actionId?: string; type?: ActionLogEntryType },
): void {
  const entryId = entry.id ?? entry.actionId;
  if (!entryId) {
    return;
  }

  const existing = useToolStore
    .getState()
    .actionLog.find(
      (log) => log.id === entryId || (!!entry.actionId && log.actionId === entry.actionId),
    );

  if (!existing) {
    addNormalizedActionLogEntry({
      id: entryId,
      actionId: entry.actionId,
      workflowHash: entry.workflowHash,
      type: entry.type ?? 'terminal',
      title: entry.title ?? entry.description ?? 'Agent action',
      description: entry.description,
      status: entry.status ?? 'pending',
      requiresApproval: entry.requiresApproval,
      scope: entry.scope,
      metadata: entry.metadata,
      result: entry.result,
      error: entry.error,
    });
    return;
  }

  updateNormalizedActionLogEntry(existing.id, {
    workflowHash: entry.workflowHash ?? existing.workflowHash,
    status: entry.status ?? existing.status,
    title: entry.title ?? existing.title,
    description: entry.description ?? existing.description,
    requiresApproval: entry.requiresApproval ?? existing.requiresApproval,
    scope: entry.scope ?? existing.scope,
    metadata: entry.metadata ?? existing.metadata,
    result: entry.result ?? existing.result,
    error: entry.error ?? existing.error,
    type: entry.type ?? existing.type,
  });
}

function dispatchBrowserActivity(detail: BrowserActivityEventDetail): void {
  window.dispatchEvent(new CustomEvent('agi:browser-active', { detail }));
}

function findAgentByGoalId(goalId: string) {
  const state = useAgentStore.getState();
  const existingAgent = state.agents.find(
    (agentState) => agentState.currentGoal === goalId || agentState.id === goalId,
  );
  const currentAgentStatus = state.agentStatus;

  return { existingAgent, currentAgentStatus };
}

function updateTrackedAgentStatus(goalId: string, updates: Partial<AgentStatus>) {
  const { existingAgent, currentAgentStatus } = findAgentByGoalId(goalId);

  if (existingAgent) {
    useAgentStore.getState().updateAgentStatus(existingAgent.id, updates);
  }

  if (
    currentAgentStatus &&
    (currentAgentStatus.currentGoal === goalId || currentAgentStatus.id === goalId)
  ) {
    useAgentStore.getState().setAgentStatus({
      ...currentAgentStatus,
      ...updates,
    });
  }
}

function resolveGoalId(
  payload: GoalProgressEvent | GoalStepCompletedEvent | GoalCompletedEvent,
): string {
  return String(payload.goalId ?? payload.goal_id ?? '').trim();
}

function resolveGoalProgressPercent(payload: GoalProgressEvent): number {
  if (typeof payload.progress_percent === 'number') {
    return Math.min(100, Math.max(0, payload.progress_percent));
  }

  if (typeof payload.progress === 'number') {
    const progress = payload.progress <= 1 ? payload.progress * 100 : payload.progress;
    return Math.min(100, Math.max(0, progress));
  }

  if (
    typeof payload.completed_steps === 'number' &&
    typeof payload.total_steps === 'number' &&
    payload.total_steps > 0
  ) {
    return Math.round((payload.completed_steps / payload.total_steps) * 100);
  }

  return 0;
}

async function sendBackgroundAgentNotification(title: string, body: string): Promise<void> {
  try {
    const { sendNotification } = await import('@tauri-apps/plugin-notification');
    await sendNotification({ title, body });
  } catch {
    // Notification plugin unavailable outside the native desktop runtime.
  }
}

function buildPlanData(plan: AgentPlanUpdateEvent['plan']): PlanData {
  const normalizedSteps =
    plan.steps?.map<PlanStep>((step) => ({
      id: step.id,
      title: step.title,
      description: step.description,
      status: normalizeActionStatus(step.status),
      parentId: step.parentId,
      result: step.result,
    })) ?? [];

  return {
    id: plan.id,
    description: plan.description,
    steps: normalizedSteps,
    createdAt: plan.createdAt ? new Date(plan.createdAt) : new Date(),
    updatedAt: new Date(),
  };
}

export async function applyAgentPlanUpdate(payload: AgentPlanUpdateEvent): Promise<void> {
  if (!payload.plan) {
    return;
  }

  const { plan } = payload;
  useToolStore.getState().setPlan(buildPlanData(plan));

  const currentContext = useToolStore.getState().workflowContext;
  const entryPoint = currentContext?.entryPoint ?? currentContext?.description ?? plan.description;
  let workflowHash = plan.workflowHash;

  if (!workflowHash && entryPoint) {
    try {
      workflowHash = await sha256(`${entryPoint}::${plan.description}`);
    } catch (error) {
      console.error('[AgentWorkflowEvents] Failed to compute workflow hash', error);
    }
  }

  if (workflowHash && entryPoint) {
    useToolStore.getState().setWorkflowContext({
      hash: workflowHash,
      description: plan.description,
      entryPoint,
    });

    if (isTauri) {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      try {
        const INVOKE_TIMEOUT_MS = 10000;
        await Promise.race([
          agent.agentSetWorkflowHash(workflowHash),
          new Promise<never>((_, reject) => {
            timeoutId = setTimeout(
              () =>
                reject(
                  new Error('Timeout: agent_set_workflow_hash did not respond within 10 seconds'),
                ),
              INVOKE_TIMEOUT_MS,
            );
          }),
        ]);
      } catch (error) {
        console.error('[AgentWorkflowEvents] Failed to push workflow hash', error);
      } finally {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }
      }
    }
  } else if (workflowHash && !entryPoint) {
    console.warn(
      '[AgentWorkflowEvents] Missing entryPoint for workflow context, skipping setWorkflowContext',
    );
  }

  upsertActionLogEntry({
    id: plan.id,
    type: 'plan',
    title: 'Plan generated',
    description: plan.description,
    status: 'success',
    workflowHash,
  });
}

export function applyAgentActionUpdate(payload: AgentActionUpdateEvent): void {
  if (!payload.action) {
    return;
  }

  const action = payload.action;
  if (action.type) {
    focusSidecarSectionFromEvent(action.type);
  }

  upsertActionLogEntry({
    id: action.id ?? action.actionId,
    actionId: action.actionId ?? action.id,
    workflowHash: action.workflowHash,
    type: mapActionType(action.type),
    title: action.title,
    description: action.description,
    status: normalizeActionStatus(action.status),
    requiresApproval: action.requiresApproval,
    scope: action.scope,
    metadata: action.metadata,
    result: action.result,
    error: action.error,
  });
}

export function applyAgentPermissionRequired(payload: AgentPermissionRequiredEvent): void {
  addNormalizedApprovalRequest({
    id: payload.actionId,
    type: (payload.type as ApprovalRequest['type']) ?? 'terminal_command',
    description: payload.reason ?? 'Action requires approval',
    riskLevel: normalizeRiskLevel(payload.riskLevel ?? payload.scope.risk),
    details: {
      scope: payload.scope,
    },
    scope: payload.scope,
    workflowHash: payload.workflowHash,
    actionId: payload.actionId,
    actionSignature: payload.actionSignature,
  });

  upsertActionLogEntry({
    id: payload.actionId,
    type: mapActionType(payload.type),
    title: payload.title ?? 'Approval required',
    description: payload.reason,
    status: 'blocked',
    workflowHash: payload.workflowHash,
    requiresApproval: true,
    scope: payload.scope,
  });
}

export function applyAgentMetrics(payload: AgentMetricsEvent): void {
  if (!payload.metrics) {
    return;
  }

  const metrics = payload.metrics;
  upsertActionLogEntry({
    id: metrics.actionId ?? `metrics-${metrics.workflowHash ?? crypto.randomUUID()}`,
    type: 'metrics',
    title: 'Task metrics',
    description: `Tokens: ${metrics.tokens ?? 0}, Cost: $${(metrics.costUsd ?? 0).toFixed(4)}`,
    status: 'success',
    workflowHash: metrics.workflowHash,
    metadata: metrics,
  });
}

export function applyAgentSpawned(payload: AgentSpawnedEvent): void {
  if (!payload.agent_id) {
    return;
  }

  useAgentStore.getState().addAgent({
    id: payload.agent_id,
    name: payload.goal ? `Agent - ${payload.goal}` : payload.agent_id,
    status: 'idle',
    currentGoal: payload.goal,
    progress: 0,
    startedAt: new Date(),
  });
}

export function applyAgentStepStarted(payload: AgentStepStartedPayload): void {
  addNormalizedActionTrailEntry({
    type: 'running',
    message: `Step ${payload.stepIndex + 1}/${payload.totalSteps}: ${payload.step}`,
    progress: payload.totalSteps > 0 ? (payload.stepIndex / payload.totalSteps) * 100 : 0,
  });

  upsertActionLogEntry({
    id: `${payload.taskId}-step-${payload.stepIndex}`,
    type: 'plan',
    title: `Step ${payload.stepIndex + 1}/${payload.totalSteps}`,
    description: payload.step,
    status: 'running',
  });

  const isBrowserStep = payload.tool === 'browser_navigate' || payload.type === 'browser';

  dispatchBrowserActivity({
    active: isBrowserStep,
    url: isBrowserStep ? (payload.url ?? '') : '',
    title: payload.step ?? null,
    status: isBrowserStep ? 'executing' : 'idle',
    lastAction: payload.step ?? null,
    extensionConnected: isBrowserStep,
    hasError: false,
  });
}

export function applyAgentStepCompleted(payload: AgentStepCompletedPayload): void {
  upsertActionLogEntry({
    id: `${payload.taskId}-step-${payload.stepIndex}`,
    type: 'plan',
    title: `Step ${payload.stepIndex + 1} completed`,
    description: payload.step,
    status: 'success',
    result: payload.result,
  });
}

export function applyAgentStepFailed(payload: AgentStepFailedPayload): void {
  upsertActionLogEntry({
    id: `${payload.taskId}-step-attempt-${payload.attempt}`,
    type: 'plan',
    title: payload.retrying ? `Step failed (retrying, attempt ${payload.attempt})` : 'Step failed',
    description: payload.step,
    status: payload.retrying ? 'running' : 'failed',
    error: payload.error,
  });
}

export function applyAgentTaskCompleted(payload: AgentTaskCompletedPayload): void {
  addNormalizedActionTrailEntry({
    type: 'completed',
    message: `Task completed (${payload.stepsCompleted} steps)`,
    progress: 100,
    fadeAfter: 10000,
  });

  upsertActionLogEntry({
    id: payload.taskId,
    type: 'plan',
    title: 'Task completed',
    description: `Successfully completed ${payload.stepsCompleted} steps`,
    status: 'success',
  });

  dispatchBrowserActivity({
    active: false,
    url: '',
    status: 'done',
    lastAction: `Task completed (${payload.stepsCompleted} steps)`,
    extensionConnected: true,
    hasError: false,
  });
}

export function applyAgentTaskFailed(payload: AgentTaskFailedPayload): void {
  addNormalizedActionTrailEntry({
    type: 'error',
    message: `Task failed: ${payload.error}`,
    progress: 0,
  });

  upsertActionLogEntry({
    id: payload.taskId,
    type: 'plan',
    title: 'Task failed',
    description: payload.error,
    status: 'failed',
    error: payload.error,
  });

  dispatchBrowserActivity({
    active: false,
    url: '',
    status: 'error',
    lastAction: payload.error,
    extensionConnected: true,
    hasError: true,
  });
}

export async function applyBackgroundAgentCompleted(
  payload: BackgroundAgentCompletedEvent,
): Promise<void> {
  if (!payload.agentId) {
    return;
  }

  const goal = payload.goal?.trim() || payload.message?.trim() || 'Background task completed';
  const summaryPath = payload.summaryPath?.trim() ?? '';

  await sendBackgroundAgentNotification(
    'AGI Workforce — Task Completed',
    goal.length > 120 ? `${goal.slice(0, 117)}...` : goal,
  );

  upsertActionLogEntry({
    id: payload.agentId,
    type: 'plan',
    title: 'Background task completed',
    description: summaryPath ? `${goal}\n\nReport saved: ${summaryPath}` : goal,
    status: 'success',
  });

  dispatchBrowserActivity({
    active: false,
    url: '',
    status: 'done',
    lastAction: 'Background task completed',
    extensionConnected: true,
    hasError: false,
  });
}

export async function applyBackgroundAgentFailed(
  payload: BackgroundAgentFailedEvent,
): Promise<void> {
  if (!payload.agentId) {
    return;
  }

  const error = payload.error?.trim() || payload.message?.trim() || 'Background task failed';

  await sendBackgroundAgentNotification(
    'AGI Workforce — Task Failed',
    error.length > 120 ? `${error.slice(0, 117)}...` : error,
  );

  upsertActionLogEntry({
    id: payload.agentId,
    type: 'plan',
    title: 'Background task failed',
    description: error,
    status: 'failed',
    error,
  });

  dispatchBrowserActivity({
    active: false,
    url: '',
    status: 'error',
    lastAction: error,
    extensionConnected: true,
    hasError: true,
  });
}

export function applyApprovalRequired(payload: ApprovalRequestEvent): void {
  if (!payload.approval?.id) {
    return;
  }

  addNormalizedApprovalRequest(payload.approval);
}

export function applyToolConfirmationRequired(payload: ToolConfirmationSummary): void {
  if (!payload.request_id) {
    return;
  }

  addNormalizedApprovalRequest({
    id: payload.request_id,
    type: 'mcp_tool',
    description: payload.description,
    riskLevel: normalizeRiskLevel(payload.risk_level),
    details: {
      tool: payload.tool_display_name,
      toolName: payload.tool_name,
      parameters: payload.parameters_summary,
      reason: payload.reason,
      reversible: payload.reversible,
      safetyTier: payload.safety_tier,
    },
    timeoutSeconds: 120,
  });

  focusSidecarSectionFromEvent('approval');
}

export function applyToolConfirmationTimeout(payload: { request_id: string }): void {
  if (!payload.request_id) {
    return;
  }

  useToolStore.getState().rejectOperation(payload.request_id, 'Operation timed out');
}

export function applyApprovalRequest(payload: ApprovalRequestPayload): void {
  if (!payload.id) {
    return;
  }

  addNormalizedApprovalRequest({
    id: payload.id,
    type: (payload.type ?? 'terminal_command') as ApprovalRequest['type'],
    description: payload.description ?? 'Agent operation requires approval',
    riskLevel: normalizeRiskLevel(payload.riskLevel),
    details: payload.details ?? {},
    impact: payload.impact,
  });
}

export function applyApprovalGranted(payload: ApprovalRequestEvent): void {
  const approvalId = payload.approval?.id;
  if (!approvalId) {
    return;
  }

  useToolStore.getState().approveOperation(approvalId);
}

export function applyApprovalDenied(payload: ApprovalRequestEvent): void {
  const approval = payload.approval;
  if (!approval?.id) {
    return;
  }

  const reason =
    approval.rejectionReason ??
    (approval as ApprovalRequest & { rejection_reason?: string }).rejection_reason ??
    'Approval denied';

  useToolStore.getState().rejectOperation(approval.id, reason);
}

export function applyGoalProgress(payload: GoalProgressEvent): void {
  const goalId = resolveGoalId(payload);
  if (!goalId) {
    return;
  }

  const progressPercent = resolveGoalProgressPercent(payload);
  const currentStep =
    typeof payload.currentStep === 'string'
      ? payload.currentStep
      : typeof payload.current_step === 'string'
        ? payload.current_step
        : undefined;

  updateTrackedAgentStatus(goalId, {
    progress: progressPercent,
    currentStep,
    status: 'running',
  });

  addNormalizedActionTrailEntry({
    type: 'running',
    message: currentStep || `Progress: ${Math.round(progressPercent)}%`,
    progress: progressPercent,
    fadeAfter: 10000,
  });
}

export function applyGoalStepCompleted(payload: GoalStepCompletedEvent): void {
  const stepId = String(payload.stepId ?? payload.step_id ?? '').trim();
  if (!stepId) {
    return;
  }

  const success = payload.success === true;
  const result =
    payload.output ??
    payload.error ??
    (typeof payload.execution_time_ms === 'number'
      ? `Completed in ${payload.execution_time_ms}ms`
      : success
        ? 'Step completed'
        : 'Step failed');

  useToolStore.getState().updatePlanStep(stepId, {
    status: success ? 'success' : 'failed',
    result,
  });

  upsertActionLogEntry({
    id: stepId,
    actionId: stepId,
    type: 'terminal',
    title: success ? 'Step completed' : 'Step failed',
    description: result,
    status: success ? 'success' : 'failed',
    error: success ? undefined : payload.error,
    result: success ? result : undefined,
  });

  addNormalizedActionTrailEntry({
    type: success ? 'completed' : 'error',
    message: result,
    fadeAfter: 5000,
  });
}

export function applyGoalAchieved(payload: GoalCompletedEvent): void {
  const goalId = resolveGoalId(payload);
  if (!goalId) {
    return;
  }

  const description =
    payload.result ??
    (typeof payload.completed_steps === 'number' && typeof payload.total_steps === 'number'
      ? `Completed ${payload.completed_steps}/${payload.total_steps} steps`
      : 'Goal completed successfully');

  updateTrackedAgentStatus(goalId, {
    status: 'completed',
    progress: 100,
    completedAt: new Date(),
    error: undefined,
  });

  addNormalizedActionTrailEntry({
    type: 'completed',
    message: description,
    fadeAfter: 10000,
  });

  upsertActionLogEntry({
    id: `goal-${goalId}-complete`,
    type: 'terminal',
    title: 'Goal completed',
    description,
    status: 'success',
  });
}

export function applyGoalError(payload: GoalCompletedEvent): void {
  const goalId = resolveGoalId(payload);
  if (!goalId) {
    return;
  }

  const error = payload.error ?? 'Goal failed';

  updateTrackedAgentStatus(goalId, {
    status: 'failed',
    completedAt: new Date(),
    error,
  });

  addNormalizedActionTrailEntry({
    type: 'error',
    message: error,
    fadeAfter: 10000,
  });

  upsertActionLogEntry({
    id: `goal-${goalId}-complete`,
    type: 'terminal',
    title: 'Goal failed',
    description: error,
    status: 'failed',
    error,
  });
}

let agentWorkflowEventListenersInitialized = false;
const agentWorkflowUnlistenFunctions: UnlistenFn[] = [];

export function cleanupAgentWorkflowEventListeners(): void {
  for (const unlisten of agentWorkflowUnlistenFunctions) {
    try {
      unlisten();
    } catch (error) {
      console.error('[AgentWorkflowEvents] Failed to cleanup listener:', error);
    }
  }

  agentWorkflowUnlistenFunctions.length = 0;
  agentWorkflowEventListenersInitialized = false;
}

export async function initializeAgentWorkflowEventListeners(): Promise<void> {
  if (agentWorkflowEventListenersInitialized || !isTauri) {
    return;
  }

  agentWorkflowEventListenersInitialized = true;

  try {
    agentWorkflowUnlistenFunctions.push(
      await listen<AgentPlanUpdateEvent>('agent:plan_update', ({ payload }) => {
        void applyAgentPlanUpdate(payload).catch((error) => {
          console.error('[AgentWorkflowEvents] Failed to apply plan update:', error);
        });
      }),
    );

    agentWorkflowUnlistenFunctions.push(
      await listen<AgentActionUpdateEvent>('agent:action_update', ({ payload }) => {
        applyAgentActionUpdate(payload);
      }),
    );

    agentWorkflowUnlistenFunctions.push(
      await listen<AgentPermissionRequiredEvent>('agent:permission_required', ({ payload }) => {
        applyAgentPermissionRequired(payload);
      }),
    );

    agentWorkflowUnlistenFunctions.push(
      await listen<AgentMetricsEvent>('agent:metrics', ({ payload }) => {
        applyAgentMetrics(payload);
      }),
    );

    agentWorkflowUnlistenFunctions.push(
      await listen<AgentSpawnedEvent>('agent:spawned', ({ payload }) => {
        applyAgentSpawned(payload);
      }),
    );

    agentWorkflowUnlistenFunctions.push(
      await listen<AgentStepStartedPayload>('agent:step-started', ({ payload }) => {
        applyAgentStepStarted(payload);
      }),
    );

    agentWorkflowUnlistenFunctions.push(
      await listen<AgentStepCompletedPayload>('agent:step-completed', ({ payload }) => {
        applyAgentStepCompleted(payload);
      }),
    );

    agentWorkflowUnlistenFunctions.push(
      await listen<AgentStepFailedPayload>('agent:step-failed', ({ payload }) => {
        applyAgentStepFailed(payload);
      }),
    );

    agentWorkflowUnlistenFunctions.push(
      await listen<AgentTaskCompletedPayload>('agent:task-completed', ({ payload }) => {
        applyAgentTaskCompleted(payload);
      }),
    );

    agentWorkflowUnlistenFunctions.push(
      await listen<AgentTaskFailedPayload>('agent:task-failed', ({ payload }) => {
        applyAgentTaskFailed(payload);
      }),
    );

    agentWorkflowUnlistenFunctions.push(
      await listen<BackgroundAgentCompletedEvent>('background_agent:completed', ({ payload }) => {
        void applyBackgroundAgentCompleted(payload).catch((error) => {
          console.error('[AgentWorkflowEvents] Failed to apply background completion:', error);
        });
      }),
    );

    agentWorkflowUnlistenFunctions.push(
      await listen<BackgroundAgentFailedEvent>('background_agent:failed', ({ payload }) => {
        void applyBackgroundAgentFailed(payload).catch((error) => {
          console.error('[AgentWorkflowEvents] Failed to apply background failure:', error);
        });
      }),
    );

    agentWorkflowUnlistenFunctions.push(
      await listen<ApprovalRequestEvent>('agi:approval_required', ({ payload }) => {
        applyApprovalRequired(payload);
      }),
    );

    agentWorkflowUnlistenFunctions.push(
      await listen<ToolConfirmationSummary>('tool:confirmation_required', ({ payload }) => {
        applyToolConfirmationRequired(payload);
      }),
    );

    agentWorkflowUnlistenFunctions.push(
      await listen<{ request_id: string }>('tool:confirmation_timeout', ({ payload }) => {
        applyToolConfirmationTimeout(payload);
      }),
    );

    agentWorkflowUnlistenFunctions.push(
      await listen<ApprovalRequestPayload>('approval:request', ({ payload }) => {
        applyApprovalRequest(payload);
      }),
    );

    agentWorkflowUnlistenFunctions.push(
      await listen<ApprovalRequestEvent>('agi:approval_granted', ({ payload }) => {
        applyApprovalGranted(payload);
      }),
    );

    agentWorkflowUnlistenFunctions.push(
      await listen<ApprovalRequestEvent>('agi:approval_denied', ({ payload }) => {
        applyApprovalDenied(payload);
      }),
    );

    agentWorkflowUnlistenFunctions.push(
      await listen<GoalProgressEvent>(EVENTS.AGI_GOAL_PROGRESS, ({ payload }) => {
        applyGoalProgress(payload);
      }),
    );

    agentWorkflowUnlistenFunctions.push(
      await listen<GoalStepCompletedEvent>('agi:goal:step_completed', ({ payload }) => {
        applyGoalStepCompleted(payload);
      }),
    );

    agentWorkflowUnlistenFunctions.push(
      await listen<GoalStepCompletedEvent>('agi:step_completed', ({ payload }) => {
        applyGoalStepCompleted(payload);
      }),
    );

    agentWorkflowUnlistenFunctions.push(
      await listen<GoalCompletedEvent>('agi:goal:achieved', ({ payload }) => {
        applyGoalAchieved(payload);
      }),
    );

    agentWorkflowUnlistenFunctions.push(
      await listen<GoalCompletedEvent>('agi:goal:error', ({ payload }) => {
        applyGoalError(payload);
      }),
    );

    agentWorkflowUnlistenFunctions.push(
      await listen<GoalCompletedEvent>('agi:goal_completed', ({ payload }) => {
        if (payload.success === false) {
          applyGoalError(payload);
          return;
        }

        applyGoalAchieved(payload);
      }),
    );
  } catch (error) {
    cleanupAgentWorkflowEventListeners();
    console.error('[AgentWorkflowEvents] Failed to initialize listeners:', error);
  }
}
