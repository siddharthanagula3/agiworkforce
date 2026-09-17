import type {
  CloudAgentOriginSurface,
  CloudAgentRun,
  CloudAgentWorkMode,
} from '@agiworkforce/cloud-contracts';
import { AGENT_TASK_STATE_LABELS } from '@agiworkforce/types';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';

export type CloudRunState = CloudAgentRun['state'];

interface CloudRunStateFace {
  label: string;
  icon: string;
  settled: boolean;
}

/**
 * The word for each state belongs to the contracts owner; only the codicon and
 * whether the state is settled are this surface's business.
 */
const CLOUD_RUN_STATE_FACES: Record<CloudRunState, CloudRunStateFace> = {
  queued: { label: AGENT_TASK_STATE_LABELS.queued, icon: 'clock', settled: false },
  planning: { label: AGENT_TASK_STATE_LABELS.planning, icon: 'loading~spin', settled: false },
  running: { label: AGENT_TASK_STATE_LABELS.running, icon: 'loading~spin', settled: false },
  resuming: { label: AGENT_TASK_STATE_LABELS.resuming, icon: 'loading~spin', settled: false },
  awaiting_approval: {
    label: AGENT_TASK_STATE_LABELS.awaiting_approval,
    icon: 'shield',
    settled: false,
  },
  awaiting_input: {
    label: AGENT_TASK_STATE_LABELS.awaiting_input,
    icon: 'question',
    settled: false,
  },
  paused: { label: AGENT_TASK_STATE_LABELS.paused, icon: 'debug-pause', settled: false },
  ready_for_review: {
    label: AGENT_TASK_STATE_LABELS.ready_for_review,
    icon: 'eye',
    settled: true,
  },
  completed: { label: AGENT_TASK_STATE_LABELS.completed, icon: 'pass', settled: true },
  partial: { label: AGENT_TASK_STATE_LABELS.partial, icon: 'warning', settled: true },
  failed: { label: AGENT_TASK_STATE_LABELS.failed, icon: 'error', settled: true },
  timed_out: { label: AGENT_TASK_STATE_LABELS.timed_out, icon: 'watch', settled: true },
  cancelled: { label: AGENT_TASK_STATE_LABELS.cancelled, icon: 'circle-slash', settled: true },
  archived: { label: AGENT_TASK_STATE_LABELS.archived, icon: 'archive', settled: true },
};

const CLOUD_RUN_WORK_MODE_TITLES: Record<CloudAgentWorkMode, string> = {
  chat: 'Cloud chat',
  agiwork: 'AGI work task',
  research: 'Research task',
};

const CLOUD_RUN_ORIGIN_LABELS: Record<CloudAgentOriginSurface, string> = {
  web: 'Web',
  desktop: 'Desktop',
  mobile: 'Mobile',
  chrome: 'Chrome',
  vscode: 'VS Code',
  cli: 'CLI',
  api: 'API',
};

export function cloudRunStateLabel(state: CloudRunState): string {
  return CLOUD_RUN_STATE_FACES[state].label;
}

export function cloudRunStateIcon(state: CloudRunState): string {
  return CLOUD_RUN_STATE_FACES[state].icon;
}

export function isCloudRunSettled(state: CloudRunState): boolean {
  return CLOUD_RUN_STATE_FACES[state].settled;
}

export function cloudRunTitle(run: CloudAgentRun): string {
  return run.conversationTitle?.trim() || CLOUD_RUN_WORK_MODE_TITLES[run.workMode];
}

export function cloudRunOriginLabel(surface: CloudAgentOriginSurface): string {
  return CLOUD_RUN_ORIGIN_LABELS[surface];
}

export function formatCloudRunDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function cloudRunAgeLabel(run: CloudAgentRun, now = Date.now()): string {
  const touchedAt = Date.parse(run.completedAt ?? run.updatedAt);
  if (Number.isNaN(touchedAt)) return '';
  const verb = run.completedAt === null ? 'updated' : 'finished';
  return `${verb} ${formatCloudRunDuration(now - touchedAt)} ago`;
}

/**
 * The server measures how long the row has sat untouched on its own clock. An
 * absent reading is unknown age, never zero, so a run that reports none says
 * nothing here rather than claiming it is fresh.
 */
export function cloudRunQuietLabel(run: CloudAgentRun): string | undefined {
  if (isCloudRunSettled(run.state)) return undefined;
  if (typeof run.staleForMs !== 'number') return undefined;
  return `quiet ${formatCloudRunDuration(run.staleForMs)}`;
}

export function cloudRunDescription(run: CloudAgentRun, now = Date.now()): string {
  return [cloudRunStateLabel(run.state), cloudRunAgeLabel(run, now), cloudRunQuietLabel(run)]
    .filter((part): part is string => part !== undefined && part !== '')
    .join(' · ');
}

export function cloudRunPendingToolNames(run: CloudAgentRun): string[] {
  return (run.pendingApproval?.toolCalls ?? []).map((call) => call.name);
}

export function cloudRunTooltipLines(run: CloudAgentRun, now = Date.now()): string[] {
  const lines = [
    cloudRunTitle(run),
    `${cloudRunStateLabel(run.state)} · ${CLOUD_RUN_WORK_MODE_TITLES[run.workMode]} · started on ${cloudRunOriginLabel(run.originSurface)}`,
    `${run.provider}/${run.model}`,
    cloudRunAgeLabel(run, now),
  ];
  const quiet = cloudRunQuietLabel(run);
  if (quiet !== undefined) lines.push(quiet);
  const pendingTools = cloudRunPendingToolNames(run);
  if (pendingTools.length > 0) {
    lines.push(`Waiting for your decision on ${pendingTools.join(', ')}`);
  }
  if (run.pendingInput !== undefined) {
    lines.push('A connector is asking this run for input');
  }
  const deviceWait = cloudRunDeviceWaitLabel(run);
  if (deviceWait !== undefined) lines.push(deviceWait);
  return lines;
}

/**
 * A run held up on the user's own machine. Nothing here can answer it, so the
 * only useful thing to say is which machine to go to and what it was asked for.
 */
export function cloudRunDeviceWaitLabel(run: CloudAgentRun): string | undefined {
  const pending = run.pendingDeviceStep;
  if (pending === undefined) return undefined;
  const steps = pending.steps.map((step) => step.summary).join(', ');
  return `Waiting for ${pending.deviceName}: ${steps}`;
}

export interface CloudRunStep {
  id: string;
  summary: string;
  status: 'running' | 'completed' | 'failed';
  detail?: string;
}

/**
 * The run's plan as the executor reported it: one step per `progressId`, in the
 * order the executor first announced it, carrying the latest status it reached.
 */
export function readCloudRunSteps(events: readonly AgentEventEnvelope[]): CloudRunStep[] {
  const steps = new Map<string, CloudRunStep>();
  for (const envelope of events) {
    const event = envelope.event;
    if (event.type !== 'progress-update') continue;
    steps.set(event.progressId, {
      id: event.progressId,
      summary: event.summary,
      status: event.status,
      ...(event.detail === undefined ? {} : { detail: event.detail }),
    });
  }
  return [...steps.values()];
}

export function cloudRunStepIcon(status: CloudRunStep['status']): string {
  if (status === 'completed') return 'pass';
  return status === 'failed' ? 'error' : 'loading~spin';
}

export function cloudRunLatestError(events: readonly AgentEventEnvelope[]): string | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]?.event;
    if (event?.type === 'error') return event.message;
  }
  return undefined;
}
