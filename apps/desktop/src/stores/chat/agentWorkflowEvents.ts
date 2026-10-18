import type { BrowserActivityEventDetail } from '@agiworkforce/types';
import { listen, type UnlistenFn, isTauri } from '../../lib/tauri-mock';
import type {
  ActionLogEntry,
  ActionLogEntryType,
  ActionLogStatus,
  ApprovalRequest,
  ApprovalScope,
} from './toolStore';
import { useToolStore } from './toolStore';
import {
  addNormalizedActionLogEntry,
  addNormalizedActionTrailEntry,
  addNormalizedApprovalRequest,
  focusSidecarSectionFromEvent,
  updateNormalizedActionLogEntry,
} from './runtimeEventBindings';

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
  toolName?: string;
  workflowHash?: string | null;
  reason?: string;
  title?: string;
  description?: string;
  scope: ApprovalScope;
  riskLevel?: 'low' | 'medium' | 'high';
  actionSignature?: string;
  requestedAtMs?: number;
  expiresAtMs?: number;
  timeoutSeconds?: number;
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

export interface BackgroundAgentCompletedEvent {
  agentId: string;
  goal?: string;
  summary?: string;
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
  args?: Record<string, unknown>;
  summary_hash?: string;
  risk_level: string;
  safety_tier: string;
  reason: string;
  reversible: boolean;
  undo_description?: string;
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

function normalizeToolConfirmationRisk(
  payload: ToolConfirmationSummary,
): 'low' | 'medium' | 'high' {
  const normalizedRisk = normalizeRiskLevel(payload.risk_level);
  const safetyTier = payload.safety_tier.toLowerCase();
  const toolName = payload.tool_name.toLowerCase();
  const mutatingToolPattern =
    /(delete|remove|write|create|update|modify|execute|run|shell|terminal)/;

  if (
    normalizedRisk === 'high' ||
    safetyTier === 'dangerous' ||
    payload.reversible === false ||
    mutatingToolPattern.test(toolName)
  ) {
    return 'high';
  }

  return normalizedRisk;
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

// An MCP-scoped request is deliberately not 'mcp_tool': that type is answered
// through the tool-confirmation command, and this request waits on the agent
// approval controller.
function approvalTypeForScope(scopeType: string | undefined): ApprovalRequest['type'] {
  switch (scopeType) {
    case 'terminal':
      return 'terminal_command';
    case 'filesystem':
      return 'data_modification';
    default:
      return 'tool_execution';
  }
}

export function applyAgentPermissionRequired(payload: AgentPermissionRequiredEvent): void {
  const workflowHash = payload.workflowHash ?? undefined;
  addNormalizedApprovalRequest({
    id: payload.actionId,
    type: approvalTypeForScope(payload.scope.type),
    description: payload.reason ?? 'Action requires approval',
    riskLevel: normalizeRiskLevel(payload.riskLevel ?? payload.scope.risk),
    details: {
      scope: payload.scope,
    },
    scope: payload.scope,
    workflowHash,
    actionId: payload.actionId,
    actionSignature: payload.actionSignature,
  });

  upsertActionLogEntry({
    id: payload.actionId,
    type: mapActionType(payload.scope.type),
    title: payload.title ?? 'Approval required',
    description: payload.reason,
    status: 'blocked',
    workflowHash,
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

export async function applyBackgroundAgentCompleted(
  payload: BackgroundAgentCompletedEvent,
): Promise<void> {
  if (!payload.agentId) {
    return;
  }

  const goal = payload.goal?.trim() || payload.message?.trim() || 'Background task completed';
  const summary = payload.summary?.trim() ?? '';

  upsertActionLogEntry({
    id: payload.agentId,
    type: 'plan',
    title: 'Background task completed',
    description: summary ? `${goal}\n\n${summary}` : goal,
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
    riskLevel: normalizeToolConfirmationRisk(payload),
    details: {
      tool: payload.tool_display_name,
      toolName: payload.tool_name,
      arguments: payload.args,
      parametersSummary: payload.parameters_summary,
      summaryHash: payload.summary_hash ?? '',
      reason: payload.reason,
      reversible: payload.reversible,
      undoDescription: payload.undo_description,
      safetyTier: payload.safety_tier,
    },
    timeoutSeconds: 120,
  });
}

export function applyToolConfirmationTimeout(payload: { request_id: string }): void {
  if (!payload.request_id) {
    return;
  }

  const existingApproval = useToolStore
    .getState()
    .pendingApprovals.find((approval) => approval.id === payload.request_id);
  if (!existingApproval) {
    return;
  }

  const toolName =
    typeof existingApproval?.details['tool'] === 'string'
      ? existingApproval.details['tool']
      : typeof existingApproval?.details['toolName'] === 'string'
        ? existingApproval.details['toolName']
        : 'Tool approval';
  const timeoutReason = `${toolName} timed out waiting for approval.`;

  useToolStore.getState().rejectOperation(payload.request_id, timeoutReason);

  addNormalizedActionTrailEntry({
    type: 'error',
    message: timeoutReason,
    fadeAfter: 10000,
    metadata: {
      approvalId: payload.request_id,
      toolName,
    },
  });

  upsertActionLogEntry({
    id: payload.request_id,
    type: 'approval',
    title: 'Approval timed out',
    description: timeoutReason,
    status: 'failed',
    error: timeoutReason,
    metadata: {
      approvalId: payload.request_id,
      toolName,
    },
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
      await listen<ApprovalRequestEvent>('agi:approval_granted', ({ payload }) => {
        applyApprovalGranted(payload);
      }),
    );

    agentWorkflowUnlistenFunctions.push(
      await listen<ApprovalRequestEvent>('agi:approval_denied', ({ payload }) => {
        applyApprovalDenied(payload);
      }),
    );
  } catch (error) {
    cleanupAgentWorkflowEventListeners();
    console.error('[AgentWorkflowEvents] Failed to initialize listeners:', error);
  }
}
