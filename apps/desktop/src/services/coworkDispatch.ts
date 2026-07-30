import type {
  DispatchTaskControlRequest,
  DispatchTaskLifecycleStatus,
  DispatchTaskStatusEvent,
} from '@agiworkforce/types';

import { type AgentTask, type AgentTaskStatus, useAgentTaskStore } from '../stores/agentTaskStore';
import { useCoworkDispatchStore } from '../stores/coworkDispatchStore';
import { sendCompanionControl } from '../stores/connectionStore';

const MAX_REQUEST_ID_LENGTH = 128;
const MAX_PROMPT_LENGTH = 20_000;
const MAX_TITLE_LENGTH = 160;
const MAX_STATUS_TEXT_LENGTH = 4_000;

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
) {
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
    const taskId = await useAgentTaskStore.getState().submitGoal(request.prompt);
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
    await sendTaskStatus(request.requestId, 'failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function cancelTask(
  request: Extract<DispatchTaskControlRequest, { action: 'dispatch.task.cancel' }>,
) {
  const dispatch = dispatchesByRequest.get(request.requestId);
  const taskId = dispatch?.taskId;
  if (!taskId || (request.taskId !== undefined && request.taskId !== taskId)) {
    await sendTaskStatus(request.requestId, 'rejected', {
      error: 'No matching Desktop task was found for this Dispatch request.',
    });
    return;
  }

  await useAgentTaskStore.getState().cancelTask(taskId);
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

async function handleCompanionControl(event: Event): Promise<void> {
  const detail = (event as CustomEvent<MobileCompanionControlDetail>).detail;
  if (!detail || typeof detail.action !== 'string' || !isRecord(detail.payload)) return;

  if (
    (detail.action === 'dispatch_request' || detail.action === 'cancel') &&
    (await handleLegacyAgentCommand(detail.payload))
  ) {
    return;
  }
  if (detail.action === 'sync_request') {
    await publishAgentSnapshot();
    return;
  }

  const request = parseDispatchTaskControl(detail.action, detail.payload);
  if (!request) return;
  if (request.action === 'dispatch.task.create') await createTask(request);
  else await cancelTask(request);
}

/**
 * Installs the one authoritative Desktop consumer for verified companion
 * controls and mirrors native task state back to Mobile.
 */
export function initializeCoworkDispatchRuntime(): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const onControl = (event: Event) => {
    void handleCompanionControl(event).catch((error) => {
      console.warn('[cowork-dispatch] control handling failed:', error);
    });
  };
  window.addEventListener('mobile-companion:control', onControl);

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

  return () => {
    window.removeEventListener('mobile-companion:control', onControl);
    unsubscribeTasks();
  };
}

export function resetCoworkDispatchRuntimeForTests(): void {
  dispatchesByRequest.clear();
  requestIdByTask.clear();
}
