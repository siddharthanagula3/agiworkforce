import type {
  CompanionApprovalRequestEvent,
  CompanionApprovalResponse,
  CompanionApprovalSnapshotEvent,
  CompanionApprovalType,
  CompanionApprovalClosedEvent,
  DispatchTaskControlRequest,
  DispatchTaskLifecycleStatus,
  DispatchTaskStatusEvent,
} from '@agiworkforce/types';

import { resolveApprovalRequest } from './approvalResolution';
import { type AgentTask, type AgentTaskStatus, useAgentTaskStore } from '../stores/agentTaskStore';
import { type ApprovalRequest, useToolStore } from '../stores/chat/toolStore';
import { useCoworkDispatchStore } from '../stores/coworkDispatchStore';
import {
  MOBILE_COMPANION_SESSION_ENDED_EVENT,
  sendCompanionControl,
} from '../stores/connectionStore';

const MAX_REQUEST_ID_LENGTH = 128;
const MAX_PROMPT_LENGTH = 20_000;
const MAX_TITLE_LENGTH = 160;
const MAX_STATUS_TEXT_LENGTH = 4_000;
const MAX_APPROVAL_TOOL_NAME_LENGTH = 120;
const MAX_APPROVAL_DESCRIPTION_LENGTH = 1_000;
const MAX_APPROVAL_REASON_LENGTH = 500;

interface MobileCompanionControlDetail {
  action: string;
  payload: Record<string, unknown>;
}

interface ActiveDispatch {
  requestId: string;
  taskId: string;
  lastStatus?: DispatchTaskLifecycleStatus;
}

const dispatchesByRequest = new Map<string, ActiveDispatch>();
const requestIdByTask = new Map<string, string>();
const relayedApprovalIds = new Set<string>();
const relayingApprovalIds = new Set<string>();
const resolvingApprovalIds = new Set<string>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : null;
}

function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 64 &&
    value.length > 0 &&
    Number.isFinite(Date.parse(value))
  );
}

export function parseDispatchTaskControl(
  action: string,
  payload: unknown,
): DispatchTaskControlRequest | null {
  if (!isRecord(payload) || payload['version'] !== 1) return null;

  const requestId = boundedString(payload['requestId'], MAX_REQUEST_ID_LENGTH);
  if (!requestId || !isIsoTimestamp(payload['sentAt'])) return null;

  if (action === 'dispatch.task.create') {
    const prompt = boundedString(payload['prompt'], MAX_PROMPT_LENGTH);
    const titleValue = payload['title'];
    const title =
      titleValue === undefined ? undefined : boundedString(titleValue, MAX_TITLE_LENGTH);
    if (!prompt || (titleValue !== undefined && !title)) return null;

    return {
      action,
      version: 1,
      requestId,
      prompt,
      ...(title ? { title } : {}),
      sentAt: payload['sentAt'],
    };
  }

  if (action === 'dispatch.task.cancel') {
    const taskValue = payload['taskId'];
    const taskId =
      taskValue === undefined ? undefined : boundedString(taskValue, MAX_REQUEST_ID_LENGTH);
    if (taskValue !== undefined && !taskId) return null;

    return {
      action,
      version: 1,
      requestId,
      ...(taskId ? { taskId } : {}),
      sentAt: payload['sentAt'],
    };
  }

  return null;
}

export function parseCompanionApprovalResponse(payload: unknown): CompanionApprovalResponse | null {
  if (
    !isRecord(payload) ||
    (payload['version'] !== undefined && payload['version'] !== 1) ||
    typeof payload['approved'] !== 'boolean'
  ) {
    return null;
  }

  const requestId = boundedString(payload['requestId'], MAX_REQUEST_ID_LENGTH);
  const respondedAt = payload['respondedAt'];
  const reasonValue = payload['reason'];
  const reason =
    reasonValue === undefined ? undefined : boundedString(reasonValue, MAX_APPROVAL_REASON_LENGTH);
  if (
    !requestId ||
    !isIsoTimestamp(respondedAt) ||
    (reasonValue !== undefined && reason === null)
  ) {
    return null;
  }

  return {
    action: 'approval_response',
    version: 1,
    requestId,
    approved: payload['approved'],
    respondedAt,
    ...(reason ? { reason } : {}),
  };
}

function approvalTypeForMobile(type: ApprovalRequest['type']): CompanionApprovalType {
  switch (type) {
    case 'file_delete':
      return 'file_delete';
    case 'terminal_command':
      return 'command';
    case 'api_call':
      return 'api_call';
    case 'data_modification':
      return 'data_modification';
    default:
      return 'other';
  }
}

function readApprovalDetail(approval: ApprovalRequest, key: string): string | null {
  return boundedString(approval.details[key], MAX_APPROVAL_TOOL_NAME_LENGTH);
}

export function buildCompanionApprovalRequest(
  approval: ApprovalRequest,
  now = Date.now(),
): CompanionApprovalRequestEvent | null {
  const requestId = boundedString(approval.id, MAX_REQUEST_ID_LENGTH);
  const description = boundedString(approval.description, MAX_APPROVAL_DESCRIPTION_LENGTH);
  const toolName =
    readApprovalDetail(approval, 'tool') ??
    readApprovalDetail(approval, 'toolName') ??
    readApprovalDetail(approval, 'command') ??
    boundedString(approval.type.replaceAll('_', ' '), MAX_APPROVAL_TOOL_NAME_LENGTH);
  const createdAt = new Date(approval.createdAt);

  if (!requestId || !description || !toolName || !Number.isFinite(createdAt.getTime())) {
    return null;
  }

  const timeoutSeconds =
    typeof approval.timeoutSeconds === 'number' &&
    Number.isFinite(approval.timeoutSeconds) &&
    approval.timeoutSeconds > 0
      ? Math.min(3_600, Math.floor(approval.timeoutSeconds))
      : undefined;
  const deadline = timeoutSeconds ? createdAt.getTime() + timeoutSeconds * 1_000 : undefined;
  const countdown = deadline ? Math.max(0, Math.ceil((deadline - now) / 1_000)) : undefined;

  return {
    action: 'approval_request',
    version: 1,
    requestId,
    toolName,
    description,
    riskLevel: approval.riskLevel,
    type: approvalTypeForMobile(approval.type),
    createdAt: createdAt.toISOString(),
    ...(deadline !== undefined
      ? {
          expiresAt: new Date(deadline).toISOString(),
          countdown,
        }
      : {}),
  };
}

async function publishApproval(approval: ApprovalRequest, force = false): Promise<void> {
  if (
    approval.status !== 'pending' ||
    relayingApprovalIds.has(approval.id) ||
    (!force && relayedApprovalIds.has(approval.id))
  ) {
    return;
  }

  const event = buildCompanionApprovalRequest(approval);
  if (!event) return;

  relayingApprovalIds.add(approval.id);
  try {
    const sent = await sendCompanionControl(event.action, { ...event });
    if (sent) {
      const stillPending = useToolStore
        .getState()
        .pendingApprovals.some(
          (candidate) => candidate.id === approval.id && candidate.status === 'pending',
        );
      if (stillPending) {
        relayedApprovalIds.add(approval.id);
      } else {
        await publishApprovalClosed(approval.id);
      }
    }
  } finally {
    relayingApprovalIds.delete(approval.id);
  }
}

async function publishPendingApprovals(force = false): Promise<void> {
  const pending = useToolStore
    .getState()
    .pendingApprovals.filter((approval) => approval.status === 'pending');
  if (force) {
    const snapshot: CompanionApprovalSnapshotEvent = {
      action: 'approval_snapshot',
      version: 1,
      pendingRequestIds: pending
        .map((approval) => boundedString(approval.id, MAX_REQUEST_ID_LENGTH))
        .filter((requestId): requestId is string => requestId !== null)
        .slice(0, 50),
      syncedAt: new Date().toISOString(),
    };
    await sendCompanionControl(snapshot.action, { ...snapshot });
  }
  await Promise.all(pending.map((approval) => publishApproval(approval, force)));
}

async function publishApprovalClosed(requestId: string): Promise<void> {
  const event: CompanionApprovalClosedEvent = {
    action: 'approval_closed',
    version: 1,
    requestId,
    closedAt: new Date().toISOString(),
  };
  await sendCompanionControl(event.action, { ...event });
}

async function resolveCompanionApproval(response: CompanionApprovalResponse): Promise<void> {
  if (resolvingApprovalIds.has(response.requestId)) return;

  const approval = useToolStore
    .getState()
    .pendingApprovals.find(
      (candidate) => candidate.id === response.requestId && candidate.status === 'pending',
    );
  if (!approval || !buildCompanionApprovalRequest(approval)) return;

  resolvingApprovalIds.add(response.requestId);
  try {
    await resolveApprovalRequest(approval, response.approved ? 'approve' : 'reject', {
      trust: false,
      reason:
        response.reason ??
        (response.approved ? 'Approved from Mobile companion' : 'Denied from Mobile companion'),
    });
    relayedApprovalIds.delete(response.requestId);
  } catch (error) {
    relayedApprovalIds.delete(response.requestId);
    queueMicrotask(() => {
      void publishPendingApprovals();
    });
    throw error;
  } finally {
    resolvingApprovalIds.delete(response.requestId);
  }
}

function statusForAgentTask(status: AgentTaskStatus): DispatchTaskLifecycleStatus {
  switch (status) {
    case 'paused':
      return 'awaiting_input';
    case 'archived':
      return 'completed';
    default:
      return status;
  }
}

function clipStatusText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.length <= MAX_STATUS_TEXT_LENGTH
    ? value
    : `${value.slice(0, MAX_STATUS_TEXT_LENGTH - 1)}…`;
}

async function sendTaskStatus(
  requestId: string,
  status: DispatchTaskLifecycleStatus,
  options: {
    taskId?: string;
    message?: string;
    result?: string;
    error?: string;
  } = {},
): Promise<void> {
  const event: DispatchTaskStatusEvent = {
    action: 'dispatch.task.status',
    version: 1,
    requestId,
    ...(options.taskId ? { taskId: options.taskId } : {}),
    status,
    ...(clipStatusText(options.message) ? { message: clipStatusText(options.message) } : {}),
    ...(clipStatusText(options.result) ? { result: clipStatusText(options.result) } : {}),
    ...(clipStatusText(options.error) ? { error: clipStatusText(options.error) } : {}),
    updatedAt: new Date().toISOString(),
  };

  await sendCompanionControl(event.action, { ...event });
}

function publishAgentTaskStatus(task: AgentTask): void {
  const requestId = requestIdByTask.get(task.id);
  if (!requestId) return;

  const dispatch = dispatchesByRequest.get(requestId);
  if (!dispatch) return;

  const status = statusForAgentTask(task.status);
  if (dispatch.lastStatus === status) return;
  dispatch.lastStatus = status;

  void sendTaskStatus(requestId, status, {
    taskId: task.id,
    message: status === 'ready_for_review' ? 'The task is ready for review on Desktop.' : undefined,
    result: task.result,
    error: task.error,
  });
}

function mobileAgentStatus(
  status: AgentTaskStatus,
): 'running' | 'completed' | 'failed' | 'waiting' {
  if (status === 'running') return 'running';
  if (status === 'failed' || status === 'cancelled') return 'failed';
  if (status === 'completed' || status === 'ready_for_review' || status === 'archived') {
    return 'completed';
  }
  return 'waiting';
}

async function publishAgentSnapshot(): Promise<void> {
  const state = useAgentTaskStore.getState();
  const agents = state.tasks.slice(-50).map((task) => {
    const progress = state.liveProgressByTask[task.id];
    const liveSteps = state.liveStepsByTask[task.id] ?? [];
    const currentStep =
      [...liveSteps].reverse().find((step) => step.status === 'running')?.description ??
      (task.status === 'ready_for_review'
        ? 'Ready for review on Desktop'
        : useAgentTaskStore.getState().getStatusLabel(task.status));
    const progressPercent =
      progress && progress.total > 0
        ? Math.min(100, Math.round((progress.step / progress.total) * 100))
        : task.status === 'completed' || task.status === 'ready_for_review'
          ? 100
          : 0;

    return {
      id: task.id,
      name: clipStatusText(task.goal)?.slice(0, 200) || 'Desktop task',
      model: 'Desktop agent',
      status: mobileAgentStatus(task.status),
      currentStep: clipStatusText(currentStep) ?? '',
      progress: progressPercent,
      ...(progress ? { totalSteps: progress.total, stepsCompleted: progress.step } : {}),
      steps: liveSteps.map((step) => ({
        id: step.id,
        icon: step.status === 'failed' ? 'error' : step.status === 'done' ? 'success' : 'thinking',
        message: clipStatusText(step.description) ?? '',
        ...(step.output ? { detail: clipStatusText(step.output) } : {}),
        status:
          step.status === 'done' ? 'completed' : step.status === 'failed' ? 'failed' : 'running',
      })),
      toolCalls: [],
      startedAt: task.createdAt,
      updatedAt: task.completedAt ?? task.createdAt,
    };
  });

  await sendCompanionControl('agents_update', { agents });
}

async function createTask(
  request: Extract<DispatchTaskControlRequest, { action: 'dispatch.task.create' }>,
  isCurrentSession: () => boolean,
) {
  if (!isCurrentSession()) return;
  if (!useCoworkDispatchStore.getState().enabled) {
    await sendTaskStatus(request.requestId, 'rejected', {
      error: 'Dispatch is disabled in Desktop Settings → Cowork.',
    });
    return;
  }

  const existing = dispatchesByRequest.get(request.requestId);
  if (existing) {
    const task = useAgentTaskStore
      .getState()
      .tasks.find((candidate) => candidate.id === existing.taskId);
    await sendTaskStatus(
      request.requestId,
      task ? statusForAgentTask(task.status) : (existing.lastStatus ?? 'accepted'),
      { taskId: existing.taskId, result: task?.result, error: task?.error },
    );
    return;
  }

  try {
    const taskId = await useAgentTaskStore.getState().submitGoal(request.prompt, {
      assertCurrent: () => {
        if (!isCurrentSession()) {
          throw new DOMException(
            'The Mobile Companion session ended before dispatch.',
            'AbortError',
          );
        }
      },
    });
    if (!isCurrentSession()) return;
    const dispatch: ActiveDispatch = {
      requestId: request.requestId,
      taskId,
      lastStatus: 'accepted',
    };
    dispatchesByRequest.set(request.requestId, dispatch);
    requestIdByTask.set(taskId, request.requestId);
    await sendTaskStatus(request.requestId, 'accepted', {
      taskId,
      message: request.title
        ? `“${request.title}” was accepted by Desktop.`
        : 'Task accepted by Desktop.',
    });
  } catch (error) {
    if (!isCurrentSession()) return;
    await sendTaskStatus(request.requestId, 'failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function cancelTask(
  request: Extract<DispatchTaskControlRequest, { action: 'dispatch.task.cancel' }>,
  isCurrentSession: () => boolean,
) {
  if (!isCurrentSession()) return;
  const dispatch = dispatchesByRequest.get(request.requestId);
  const taskId = dispatch?.taskId;
  if (!taskId || (request.taskId !== undefined && request.taskId !== taskId)) {
    await sendTaskStatus(request.requestId, 'rejected', {
      error: 'No matching Desktop task was found for this Dispatch request.',
    });
    return;
  }

  await useAgentTaskStore.getState().cancelTask(taskId);
  if (!isCurrentSession()) return;
  dispatch.lastStatus = 'cancelled';
  requestIdByTask.set(taskId, request.requestId);
  await sendTaskStatus(request.requestId, 'cancelled', {
    taskId,
    message: 'Task cancelled on Desktop.',
  });
}

async function handleLegacyAgentCommand(payload: Record<string, unknown>): Promise<boolean> {
  if (payload['kind'] !== 'agent_command') return false;
  const agentId = boundedString(payload['agentId'], MAX_REQUEST_ID_LENGTH);
  const command = payload['command'];
  if (!agentId || (command !== 'pause' && command !== 'resume' && command !== 'cancel')) {
    return true;
  }

  const store = useAgentTaskStore.getState();
  if (command === 'pause') await store.pauseTask(agentId, 'Paused from Mobile companion');
  else if (command === 'resume') await store.resumeTask(agentId);
  else await store.cancelTask(agentId);
  return true;
}

async function handleCompanionControl(
  event: Event,
  isCurrentSession: () => boolean,
): Promise<void> {
  if (!isCurrentSession()) return;
  const detail = (event as CustomEvent<MobileCompanionControlDetail>).detail;
  if (!detail || typeof detail.action !== 'string' || !isRecord(detail.payload)) return;

  if (
    (detail.action === 'dispatch_request' || detail.action === 'cancel') &&
    (await handleLegacyAgentCommand(detail.payload))
  ) {
    return;
  }
  if (!isCurrentSession()) return;
  if (detail.action === 'sync_request') {
    await Promise.all([publishAgentSnapshot(), publishPendingApprovals(true)]);
    return;
  }
  if (detail.action === 'approval_response') {
    const response = parseCompanionApprovalResponse(detail.payload);
    if (response) await resolveCompanionApproval(response);
    return;
  }

  const request = parseDispatchTaskControl(detail.action, detail.payload);
  if (!request) return;
  if (request.action === 'dispatch.task.create') await createTask(request, isCurrentSession);
  else await cancelTask(request, isCurrentSession);
}

function resetCoworkDispatchSession(): void {
  dispatchesByRequest.clear();
  requestIdByTask.clear();
  relayedApprovalIds.clear();
  relayingApprovalIds.clear();
  resolvingApprovalIds.clear();
}

export function initializeCoworkDispatchRuntime(): () => void {
  if (typeof window === 'undefined') return () => undefined;

  let sessionGeneration = 0;
  const onControl = (event: Event) => {
    const eventGeneration = sessionGeneration;
    void handleCompanionControl(event, () => eventGeneration === sessionGeneration).catch(
      (error) => {
        console.warn('[cowork-dispatch] control handling failed:', error);
      },
    );
  };
  const onSessionEnded = () => {
    sessionGeneration += 1;
    resetCoworkDispatchSession();
  };
  window.addEventListener('mobile-companion:control', onControl);
  window.addEventListener(MOBILE_COMPANION_SESSION_ENDED_EVENT, onSessionEnded);

  const unsubscribeTasks = useAgentTaskStore.subscribe((state, previous) => {
    if (
      state.tasks === previous.tasks &&
      state.liveProgressByTask === previous.liveProgressByTask &&
      state.liveStepsByTask === previous.liveStepsByTask
    ) {
      return;
    }
    let taskLifecycleChanged = false;
    for (const task of state.tasks) {
      const previousTask = previous.tasks.find((candidate) => candidate.id === task.id);
      if (
        !previousTask ||
        previousTask.status !== task.status ||
        previousTask.result !== task.result ||
        previousTask.error !== task.error
      ) {
        taskLifecycleChanged = true;
        if (requestIdByTask.has(task.id)) publishAgentTaskStatus(task);
      }
    }
    if (
      taskLifecycleChanged ||
      state.liveProgressByTask !== previous.liveProgressByTask ||
      state.liveStepsByTask !== previous.liveStepsByTask
    ) {
      void publishAgentSnapshot();
    }
  });

  const unsubscribeApprovals = useToolStore.subscribe((state, previous) => {
    if (state.pendingApprovals === previous.pendingApprovals) return;

    const pendingIds = new Set(state.pendingApprovals.map((approval) => approval.id));
    for (const approval of previous.pendingApprovals) {
      if (!pendingIds.has(approval.id) && relayedApprovalIds.delete(approval.id)) {
        void publishApprovalClosed(approval.id);
      }
    }

    queueMicrotask(() => {
      void publishPendingApprovals();
    });
  });

  return () => {
    sessionGeneration += 1;
    resetCoworkDispatchSession();
    window.removeEventListener('mobile-companion:control', onControl);
    window.removeEventListener(MOBILE_COMPANION_SESSION_ENDED_EVENT, onSessionEnded);
    unsubscribeTasks();
    unsubscribeApprovals();
  };
}

export function resetCoworkDispatchRuntimeForTests(): void {
  resetCoworkDispatchSession();
}
