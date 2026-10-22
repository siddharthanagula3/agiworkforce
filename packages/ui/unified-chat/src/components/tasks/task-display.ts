import type { CloudAgentRun, CloudAgentWorkMode } from '@agiworkforce/cloud-contracts';
import { agentTaskStateLabel, creditsFromCents, formatCredits } from '@agiworkforce/types';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';

// The run-state enum isn't exported as a standalone type from cloud-contracts;
export type AgentTaskState = CloudAgentRun['state'];

/** The finer Work state when the server reports one, else the coarse state every server sends. */
export function runWorkState(run: Pick<CloudAgentRun, 'state' | 'workState'>): AgentTaskState {
  return run.workState ?? run.state;
}

export type AgiWorkExcludedTool = 'web_search' | 'code_execution';

export interface AgiWorkRerunGoal {
  goal: string;
  constraints?: string;
  deliverable?: string;
  excludedTools?: AgiWorkExcludedTool[];
}

export function workModeLabel(mode: CloudAgentWorkMode): string {
  switch (mode) {
    case 'agiwork':
      return 'AGI Work';
    case 'research':
      return 'Research';
    case 'chat':
    default:
      return 'Chat';
  }
}

export function formatTaskCost(costCents: number): string {
  return formatCredits(creditsFromCents(costCents), { maximumFractionDigits: 2 });
}

export function formatTaskTokens(tokens: number): string {
  if (tokens < 1_000) return String(tokens);
  if (tokens < 1_000_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return `${(tokens / 1_000_000).toFixed(2)}M`;
}

export function taskStateLabel(state: AgentTaskState): string {
  return agentTaskStateLabel(state);
}

export type TaskStateTone = 'active' | 'attention' | 'success' | 'danger' | 'muted';

export function taskStateTone(state: AgentTaskState): TaskStateTone {
  switch (state) {
    case 'queued':
    case 'planning':
    case 'running':
    case 'resuming':
      return 'active';
    case 'awaiting_input':
    case 'awaiting_approval':
    case 'ready_for_review':
    case 'paused':
    case 'partial':
      return 'attention';
    case 'completed':
      return 'success';
    case 'failed':
    case 'timed_out':
      return 'danger';
    case 'cancelled':
    case 'archived':
    default:
      return 'muted';
  }
}

export const TASK_TONE_BADGE_CLASS: Record<TaskStateTone, string> = {
  active: 'border-info-fill/30 bg-info-fill/10 text-info-text',
  attention: 'border-warning-fill/30 bg-warning-fill/10 text-warning-text',
  success: 'border-success-fill/30 bg-success-fill/10 text-success-text',
  danger: 'border-danger-fill/30 bg-danger-fill/10 text-danger-text',
  muted: 'border-border bg-muted text-muted-foreground',
};

/**
 * Archiving is a shelf for work that has stopped. A run still capable of
 * producing events would come back from the shelf changed, so it stays off.
 */
export function isArchivableState(state: AgentTaskState): boolean {
  return (
    state === 'ready_for_review' ||
    state === 'completed' ||
    state === 'partial' ||
    state === 'failed' ||
    state === 'timed_out' ||
    state === 'cancelled'
  );
}

export function isCancellableState(state: AgentTaskState): boolean {
  return isLiveTaskState(state);
}

/** A pause lands at the run's next step boundary, so only a run that is working can take one. */
export function isPausableState(state: AgentTaskState): boolean {
  return state === 'queued' || state === 'planning' || state === 'running' || state === 'resuming';
}

/**
 * Is this run still capable of appending to its journal?
 *
 * Narrower than {@link isCancellableState} on purpose: this drives the detail
 * panel's background refresh, and polling a run that will never emit another
 * event is pure waste. `ready_for_review` is excluded, the agent loop emits it
 * as its FINAL state, so the journal is already complete. `awaiting_input` IS
 * included: another device can answer the approval, after which this run starts
 * producing events again without anything happening on this client.
 */
export function isLiveTaskState(state: AgentTaskState): boolean {
  return (
    isPausableState(state) ||
    state === 'awaiting_input' ||
    state === 'awaiting_approval' ||
    state === 'paused'
  );
}

const TASK_RESULT_MAX_CHARS = 4_000;

export function taskResultText(events: readonly AgentEventEnvelope[]): string {
  let segment = '';
  let lastSegment = '';
  for (const envelope of events) {
    const event = envelope.event;
    if (event.type === 'tool-execution-start') {
      if (segment.trim()) lastSegment = segment;
      segment = '';
    } else if (event.type === 'text-delta') {
      segment += event.delta;
    }
  }
  const text = (segment.trim() ? segment : lastSegment).trim();
  return text.length > TASK_RESULT_MAX_CHARS ? `${text.slice(0, TASK_RESULT_MAX_CHARS)}…` : text;
}

const TASK_VIEWS_STORAGE_KEY = 'agi-task-views';
const TASK_VIEWS_CAP = 500;

export interface TaskViews {
  since: string;
  seen: Record<string, string>;
}

function isTaskViews(value: unknown): value is TaskViews {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<TaskViews>;
  return (
    typeof candidate.since === 'string' &&
    !Number.isNaN(Date.parse(candidate.since)) &&
    typeof candidate.seen === 'object' &&
    candidate.seen !== null &&
    Object.values(candidate.seen).every((stamp) => typeof stamp === 'string')
  );
}

function saveTaskViews(views: TaskViews): void {
  try {
    window.localStorage.setItem(TASK_VIEWS_STORAGE_KEY, JSON.stringify(views));
  } catch {
    return;
  }
}

/**
 * Where this device last looked at each run. A device that has never looked
 * starts from now, so a first visit does not mark every past run unread; a
 * device without storage tracks nothing and shows no unread marks.
 */
export function loadTaskViews(now: Date = new Date()): TaskViews | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored: unknown = JSON.parse(
      window.localStorage.getItem(TASK_VIEWS_STORAGE_KEY) ?? 'null',
    );
    if (isTaskViews(stored)) return stored;
    const fresh: TaskViews = { since: now.toISOString(), seen: {} };
    window.localStorage.setItem(TASK_VIEWS_STORAGE_KEY, JSON.stringify(fresh));
    return fresh;
  } catch {
    return null;
  }
}

function latestStamp(a: string, b: string): string {
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

export function markTaskViewed(
  views: TaskViews,
  run: Pick<CloudAgentRun, 'id' | 'updatedAt'>,
  now: Date = new Date(),
): TaskViews {
  const previous = views.seen[run.id];
  if (previous && Date.parse(previous) >= Date.parse(run.updatedAt)) return views;
  const stamp = latestStamp(run.updatedAt, now.toISOString());
  const entries = Object.entries(views.seen).filter(([id]) => id !== run.id);
  entries.push([run.id, stamp]);
  const next: TaskViews = {
    since: views.since,
    seen: Object.fromEntries(entries.slice(-TASK_VIEWS_CAP)),
  };
  saveTaskViews(next);
  return next;
}

/**
 * A run is unread when it has settled into something for the user (a result,
 * a failure or a question) after this device last looked at it. Runs still
 * working, cancelled or archived carry no mark.
 */
export function isTaskUnread(
  run: Pick<CloudAgentRun, 'id' | 'state' | 'workState' | 'updatedAt'>,
  views: TaskViews | null,
): boolean {
  if (!views) return false;
  const tone = taskStateTone(runWorkState(run));
  if (tone === 'active' || tone === 'muted') return false;
  const updated = Date.parse(run.updatedAt);
  if (Number.isNaN(updated)) return false;
  return updated > Date.parse(views.seen[run.id] ?? views.since);
}
