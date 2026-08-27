import {
  AgentTaskStateSchema,
  type CloudAgentOriginSurface,
  type CloudAgentRun,
  type CloudAgentWorkMode,
} from '@agiworkforce/cloud-contracts';
import type { AgentEventEnvelope, AgentTaskState } from '@agiworkforce/types/protocol';
import { TIME_GROUPS } from '@/lib/constants';
import { formatAgeLabel } from '@/src/features/artifacts/store';
import type { ColorScheme } from '@/src/ui/theme';

export const ALL_CLOUD_RUN_STATES: readonly AgentTaskState[] = AgentTaskStateSchema.options;

export const CLOUD_RUN_FILTERS = [
  { key: 'all', label: 'All', states: ALL_CLOUD_RUN_STATES },
  { key: 'blocked', label: 'Needs you', states: ['awaiting_input', 'paused'] },
  { key: 'running', label: 'Running', states: ['queued', 'running'] },
  {
    key: 'finished',
    label: 'Finished',
    states: ['ready_for_review', 'completed', 'failed', 'cancelled', 'archived'],
  },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  states: readonly AgentTaskState[];
}>;

export type CloudRunFilterKey = (typeof CLOUD_RUN_FILTERS)[number]['key'];

export const DEFAULT_CLOUD_RUN_FILTER: CloudRunFilterKey = CLOUD_RUN_FILTERS[0].key;

export function cloudRunFilterStates(key: CloudRunFilterKey): AgentTaskState[] {
  const filter =
    CLOUD_RUN_FILTERS.find((candidate) => candidate.key === key) ?? CLOUD_RUN_FILTERS[0];
  return [...filter.states];
}

export const CLOUD_RUN_STATE_LABELS: Record<AgentTaskState, string> = {
  queued: 'Queued',
  running: 'Running',
  awaiting_input: 'Waiting on you',
  ready_for_review: 'Ready for review',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  paused: 'Paused',
  archived: 'Archived',
};

export const CLOUD_RUN_ORIGIN_LABELS: Record<CloudAgentOriginSurface, string> = {
  web: 'Web',
  desktop: 'Desktop',
  mobile: 'Mobile',
  chrome: 'Chrome',
  vscode: 'VS Code',
  cli: 'CLI',
  api: 'API',
};

export const CLOUD_RUN_WORK_MODE_LABELS: Record<CloudAgentWorkMode, string> = {
  chat: 'Chat',
  agiwork: 'AGI work',
  research: 'Research',
};

const CLOUD_RUN_WORK_MODE_TITLES: Record<CloudAgentWorkMode, string> = {
  chat: 'Cloud chat',
  agiwork: 'AGI work task',
  research: 'Research task',
};

export function cloudRunStateColor(state: AgentTaskState, colors: ColorScheme): string {
  switch (state) {
    case 'awaiting_input':
    case 'paused':
      return colors.agentWarning;
    case 'running':
      return colors.agentActive;
    case 'queued':
      return colors.textSecondary;
    case 'ready_for_review':
    case 'completed':
      return colors.agentSuccess;
    case 'failed':
      return colors.agentError;
    default:
      return colors.textMuted;
  }
}

export type CloudRunBlock = 'approval' | 'input';

export function cloudRunBlock(run: CloudAgentRun): CloudRunBlock | null {
  if (run.pendingApproval) return 'approval';
  if (run.pendingInput) return 'input';
  return null;
}

export function isCloudRunSteerable(run: CloudAgentRun): boolean {
  return (
    run.state === 'queued' ||
    run.state === 'running' ||
    run.state === 'awaiting_input' ||
    run.state === 'paused'
  );
}

export function cloudRunTitle(run: CloudAgentRun, conversationTitle?: string): string {
  return conversationTitle?.trim() || CLOUD_RUN_WORK_MODE_TITLES[run.workMode];
}

export function cloudRunActivityMs(run: CloudAgentRun): number {
  const parsed = Date.parse(run.completedAt ?? run.updatedAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function cloudRunTimeLabel(run: CloudAgentRun): string {
  const age = formatAgeLabel(run.completedAt ?? run.updatedAt);
  if (!age) return '';
  return `${run.completedAt ? 'Finished' : 'Updated'} ${age}`;
}

const CLOUD_RUN_GROUP_ORDER = ['Today', 'Yesterday', 'This Week', 'Older'] as const;

export type CloudRunGroupTitle = (typeof CLOUD_RUN_GROUP_ORDER)[number];

export interface CloudRunSection {
  title: CloudRunGroupTitle;
  data: CloudAgentRun[];
}

export function groupCloudRunsByRecency(runs: CloudAgentRun[]): CloudRunSection[] {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();
  const groups: Record<CloudRunGroupTitle, CloudAgentRun[]> = {
    Today: [],
    Yesterday: [],
    'This Week': [],
    Older: [],
  };

  for (const run of [...runs].sort((a, b) => cloudRunActivityMs(b) - cloudRunActivityMs(a))) {
    const age = todayMs - cloudRunActivityMs(run);
    if (age < 0) groups.Today.push(run);
    else if (age < TIME_GROUPS.YESTERDAY) groups.Yesterday.push(run);
    else if (age < TIME_GROUPS.THIS_WEEK) groups['This Week'].push(run);
    else groups.Older.push(run);
  }

  return CLOUD_RUN_GROUP_ORDER.filter((title) => groups[title].length > 0).map((title) => ({
    title,
    data: groups[title],
  }));
}

export function mergeCloudRuns(
  current: CloudAgentRun[],
  incoming: CloudAgentRun[],
): CloudAgentRun[] {
  const merged = new Map(current.map((run) => [run.id, run]));
  for (const run of incoming) merged.set(run.id, run);
  return [...merged.values()];
}

export type CloudRunActivityTone = 'default' | 'success' | 'error';

export interface CloudRunActivityLine {
  id: string;
  label: string;
  tone: CloudRunActivityTone;
}

const APPROVAL_DECISION_LABELS: Record<string, string> = {
  approved: 'Approved',
  'approved-for-session': 'Approved for this session',
  denied: 'Denied',
  cancelled: 'Cancelled',
};

export function cloudRunTextDelta(envelope: AgentEventEnvelope): string {
  return envelope.event.type === 'text-delta' ? envelope.event.delta : '';
}

export function summarizeCloudRunEvent(envelope: AgentEventEnvelope): CloudRunActivityLine | null {
  const id = `${envelope.turnId}:${envelope.sequence}`;
  const event = envelope.event;

  switch (event.type) {
    case 'tool-execution-start':
      return { id, label: event.summary, tone: 'default' };
    case 'tool-execution-end':
      return {
        id,
        label: `${event.name} ${event.isError ? 'failed' : 'finished'}`,
        tone: event.isError ? 'error' : 'success',
      };
    case 'progress-update':
      return {
        id,
        label: event.summary,
        tone:
          event.status === 'failed'
            ? 'error'
            : event.status === 'completed'
              ? 'success'
              : 'default',
      };
    case 'approval-requested':
      return { id, label: `Approval requested: ${event.summary}`, tone: 'default' };
    case 'approval-resolved':
      return {
        id,
        label: APPROVAL_DECISION_LABELS[event.decision] ?? event.decision,
        tone: event.decision === 'denied' ? 'error' : 'success',
      };
    case 'input-requested':
      return { id, label: `${event.toolName} is asking for input`, tone: 'default' };
    case 'artifact-produced':
      return { id, label: `Produced ${event.name}`, tone: 'success' };
    case 'error':
      return { id, label: event.message, tone: 'error' };
    case 'task-state-changed':
      return {
        id,
        label: event.summary ?? CLOUD_RUN_STATE_LABELS[event.state],
        tone: event.state === 'failed' ? 'error' : 'default',
      };
    default:
      return null;
  }
}
