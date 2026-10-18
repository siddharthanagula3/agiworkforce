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
import {
  type BackgroundAgent,
  type BackgroundAgentStatus,
  isTerminalBackgroundAgentStatus,
  useBackgroundAgentStore,
} from '../stores/backgroundAgentStore';
import { type ApprovalRequest, useToolStore } from '../stores/chat/toolStore';
import { useCoworkDispatchStore } from '../stores/coworkDispatchStore';
import {
  MOBILE_COMPANION_SESSION_ENDED_EVENT,
  sendCompanionControl,
} from '../stores/connectionStore';
import { createControlReceiptLedger } from '@agiworkforce/utils/control-receipts';

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
const controlReceipts = createControlReceiptLedger();
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

function clipStatusText(value: string | null | undefined): string | undefined {
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
    result?: string | null;
    error?: string | null;
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

function mobileAgentStatus(
  status: BackgroundAgentStatus,
): 'running' | 'completed' | 'failed' | 'waiting' {
  if (status === 'running') return 'running';
  if (status === 'completed') return 'completed';
  if (isTerminalBackgroundAgentStatus(status)) return 'failed';
  return 'waiting';
}

const MOBILE_STATUS_TEXT: Record<BackgroundAgentStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  paused: 'Paused',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  taken_over: 'Taken over on Desktop',
};

function mobileAgent(agent: BackgroundAgent) {
  return {
    id: agent.id,
    name: clipStatusText(agent.goal)?.slice(0, 200) || 'Desktop task',
    model: 'Desktop agent',
    status: mobileAgentStatus(agent.status),
    currentStep:
      clipStatusText(agent.progress.currentStepDescription) ?? MOBILE_STATUS_TEXT[agent.status],
    progress: agent.status === 'completed' ? 100 : agent.progress.percentage,
    ...(agent.progress.totalSteps > 0
      ? { totalSteps: agent.progress.totalSteps, stepsCompleted: agent.progress.currentStep }
      : {}),
    steps: [],
    toolCalls: [],
    startedAt: agent.startedAt ?? agent.createdAt,
    updatedAt: agent.completedAt ?? agent.startedAt ?? agent.createdAt,
  };
}

async function publishAgentSnapshot(): Promise<void> {
  const agents = useBackgroundAgentStore.getState().agents.slice(0, 50).map(mobileAgent);
  await sendCompanionControl('agents_update', { agents });
}

const DISPATCH_STATUS: Record<BackgroundAgentStatus, DispatchTaskLifecycleStatus> = {
  queued: 'queued',
  running: 'running',
  paused: 'awaiting_input',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'cancelled',
  taken_over: 'ready_for_review',
};

function publishDispatchStatus(agent: BackgroundAgent): void {
  const requestId = requestIdByTask.get(agent.id);
  if (!requestId) return;
  const dispatch = dispatchesByRequest.get(requestId);
  if (!dispatch) return;

  const status = DISPATCH_STATUS[agent.status];
  if (dispatch.lastStatus === status) return;
  dispatch.lastStatus = status;

  void sendTaskStatus(requestId, status, {
    taskId: agent.id,
    message:
      status === 'awaiting_input'
        ? 'The task is paused on Desktop.'
        : status === 'ready_for_review'
          ? 'The task was taken over on Desktop.'
          : undefined,
    result: agent.summary?.description,
    error: agent.error,
  });
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
    const agent = useBackgroundAgentStore
      .getState()
      .agents.find((candidate) => candidate.id === existing.taskId);
    await sendTaskStatus(
      request.requestId,
      agent ? DISPATCH_STATUS[agent.status] : (existing.lastStatus ?? 'accepted'),
      { taskId: existing.taskId, result: agent?.summary?.description, error: agent?.error },
    );
    return;
  }

  try {
    const taskId = await useBackgroundAgentStore.getState().startAgent(request.prompt);
    if (!isCurrentSession()) return;
    dispatchesByRequest.set(request.requestId, {
      requestId: request.requestId,
      taskId,
      lastStatus: 'accepted',
    });
    requestIdByTask.set(taskId, request.requestId);
    await sendTaskStatus(request.requestId, 'accepted', {
      taskId,
      message: request.title
        ? `“${request.title}” was accepted by Desktop.`
        : 'Task accepted by Desktop.',
    });
    const agent = useBackgroundAgentStore
      .getState()
      .agents.find((candidate) => candidate.id === taskId);
    if (agent) publishDispatchStatus(agent);
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

  await useBackgroundAgentStore.getState().cancelAgent(taskId);
  if (!isCurrentSession()) return;
  dispatch.lastStatus = 'cancelled';
  await sendTaskStatus(request.requestId, 'cancelled', {
    taskId,
    message: 'Task cancelled on Desktop.',
  });
}

const CANCEL_ALL_SCOPE = 'all';

/**
 * Mobile's Emergency Stop sends `cancel` with `scope: 'all'` and no `taskId`
 * (`sendEmergencyStop` in apps/mobile/services/companion.ts). The relay also
 * rewrites a raw `emergency_stop` control to the same shape and defaults its
 * scope to `all`, so both spellings must land on the cancel-all branch.
 */
function isCancelAllControl(action: string, payload: Record<string, unknown>): boolean {
  const scope = payload['scope'];
  if (action === 'emergency_stop') return scope === undefined || scope === CANCEL_ALL_SCOPE;
  return action === 'cancel' && scope === CANCEL_ALL_SCOPE;
}

interface CancelAllOutcome {
  taskId: string;
  cancelled: boolean;
  error?: string;
}

async function cancelAllTasks(isCurrentSession: () => boolean): Promise<void> {
  const store = useBackgroundAgentStore.getState();
  await store.listAgents();
  if (!isCurrentSession()) return;
  const listError = useBackgroundAgentStore.getState().error;
  if (listError) {
    await sendCompanionControl('emergency_stop', {
      action: 'emergency_stop',
      version: 1,
      scope: CANCEL_ALL_SCOPE,
      requested: 0,
      cancelled: 0,
      failed: 0,
      cancelledTaskIds: [],
      errorMessage: clipStatusText(
        `Desktop could not read its running agents, so nothing was stopped: ${listError}`,
      ),
      stoppedAt: new Date().toISOString(),
    });
    return;
  }

  // Running work is cancelled first: an unattended shell or computer-use session
  // is the reason this control exists, so it must not wait behind queued work.
  const stoppable = useBackgroundAgentStore
    .getState()
    .agents.filter((agent) => !isTerminalBackgroundAgentStatus(agent.status))
    .sort((left, right) => Number(right.status === 'running') - Number(left.status === 'running'));

  // Every cancellation is attempted even when an earlier one throws: a kill
  // switch that stops at the first error is not a kill switch.
  const outcomes: CancelAllOutcome[] = await Promise.all(
    stoppable.map(async (agent): Promise<CancelAllOutcome> => {
      try {
        await useBackgroundAgentStore.getState().cancelAgent(agent.id);
        return { taskId: agent.id, cancelled: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn('[cowork-dispatch] emergency stop could not cancel', agent.id, error);
        return { taskId: agent.id, cancelled: false, error: message };
      }
    }),
  );
  if (!isCurrentSession()) return;

  const cancelledIds = outcomes.filter((outcome) => outcome.cancelled).map((o) => o.taskId);
  const failures = outcomes.filter((outcome) => !outcome.cancelled);

  for (const outcome of outcomes) {
    const requestId = requestIdByTask.get(outcome.taskId);
    if (!requestId) continue;
    const dispatch = dispatchesByRequest.get(requestId);
    if (outcome.cancelled) {
      if (dispatch) dispatch.lastStatus = 'cancelled';
      await sendTaskStatus(requestId, 'cancelled', {
        taskId: outcome.taskId,
        message: 'Task cancelled by Emergency Stop on Desktop.',
      });
    } else {
      // The task is still running, so its lifecycle status is left untouched and
      // the rejection reports only that the cancellation itself did not land.
      await sendTaskStatus(requestId, 'rejected', {
        taskId: outcome.taskId,
        error: `Emergency Stop could not cancel this task: ${outcome.error ?? 'unknown error'}`,
      });
    }
    if (!isCurrentSession()) return;
  }

  await sendCompanionControl('emergency_stop', {
    action: 'emergency_stop',
    version: 1,
    scope: CANCEL_ALL_SCOPE,
    requested: stoppable.length,
    cancelled: cancelledIds.length,
    failed: failures.length,
    cancelledTaskIds: cancelledIds.slice(0, 50),
    ...(failures.length > 0
      ? {
          failedTaskIds: failures.map((failure) => failure.taskId).slice(0, 50),
          errorMessage: clipStatusText(
            `${failures.length} task${failures.length === 1 ? '' : 's'} could not be cancelled and may still be running.`,
          ),
        }
      : {}),
    ...(stoppable.length === 0 ? { message: 'No tasks were running on Desktop.' } : {}),
    stoppedAt: new Date().toISOString(),
  });
  if (!isCurrentSession()) return;

  // The snapshot is the authoritative answer: anything that refused to cancel
  // still shows as running on Mobile instead of being papered over.
  await publishAgentSnapshot();
}

async function handleAgentCommand(payload: Record<string, unknown>): Promise<boolean> {
  if (payload['kind'] !== 'agent_command') return false;
  const agentId = boundedString(payload['agentId'], MAX_REQUEST_ID_LENGTH);
  const command = payload['command'];
  if (!agentId || (command !== 'pause' && command !== 'resume' && command !== 'cancel')) {
    return true;
  }

  const store = useBackgroundAgentStore.getState();
  if (command === 'pause') await store.pauseAgent(agentId);
  else if (command === 'resume') await store.resumeAgent(agentId);
  else await store.cancelAgent(agentId);
  return true;
}

async function acknowledgeCompanionControl(
  action: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const requestId = boundedString(payload['requestId'], MAX_REQUEST_ID_LENGTH);
  if (!requestId) return;

  const receipt = controlReceipts.record(action, requestId);
  await sendCompanionControl(receipt.action, { ...receipt });
}

async function handleCompanionControl(
  event: Event,
  isCurrentSession: () => boolean,
): Promise<void> {
  if (!isCurrentSession()) return;
  const detail = (event as CustomEvent<MobileCompanionControlDetail>).detail;
  if (!detail || typeof detail.action !== 'string' || !isRecord(detail.payload)) return;

  await acknowledgeCompanionControl(detail.action, detail.payload);
  if (!isCurrentSession()) return;

  // Checked before the single-agent cancel so the broader scope is not swallowed
  // by the narrower one.
  if (isCancelAllControl(detail.action, detail.payload)) {
    await cancelAllTasks(isCurrentSession);
    return;
  }
  if (!isCurrentSession()) return;

  if (
    (detail.action === 'dispatch_request' || detail.action === 'cancel') &&
    (await handleAgentCommand(detail.payload))
  ) {
    return;
  }
  if (!isCurrentSession()) return;
  if (detail.action === 'sync_request') {
    await useBackgroundAgentStore.getState().listAgents();
    if (!isCurrentSession()) return;
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
  else if (request.action === 'dispatch.task.cancel') await cancelTask(request, isCurrentSession);
}

function resetCoworkDispatchSession(): void {
  dispatchesByRequest.clear();
  requestIdByTask.clear();
  controlReceipts.clear();
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

  const unsubscribeAgents = useBackgroundAgentStore.subscribe((state, previous) => {
    if (state.agents === previous.agents) return;
    for (const agent of state.agents) {
      if (requestIdByTask.has(agent.id)) publishDispatchStatus(agent);
    }
    void publishAgentSnapshot();
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
    unsubscribeAgents();
    unsubscribeApprovals();
  };
}

export function resetCoworkDispatchRuntimeForTests(): void {
  resetCoworkDispatchSession();
}
