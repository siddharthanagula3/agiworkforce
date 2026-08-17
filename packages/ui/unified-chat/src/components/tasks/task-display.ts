import type { CloudAgentRun, CloudAgentWorkMode } from '@agiworkforce/cloud-contracts';

// The run-state enum isn't exported as a standalone type from cloud-contracts;
export type AgentTaskState = CloudAgentRun['state'];

export interface AgiWorkRerunGoal {
  goal: string;
  constraints?: string;
  deliverable?: string;
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
  return `$${(costCents / 100).toFixed(2)}`;
}

export function formatTaskTokens(tokens: number): string {
  if (tokens < 1_000) return String(tokens);
  if (tokens < 1_000_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return `${(tokens / 1_000_000).toFixed(2)}M`;
}

export function taskStateLabel(state: AgentTaskState): string {
  switch (state) {
    case 'queued':
      return 'Queued';
    case 'running':
      return 'Running';
    case 'awaiting_input':
      return 'Awaiting input';
    case 'ready_for_review':
      return 'Ready for review';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    case 'paused':
      return 'Paused';
    case 'archived':
      return 'Archived';
    default:
      return state;
  }
}

export type TaskStateTone = 'active' | 'attention' | 'success' | 'danger' | 'muted';

export function taskStateTone(state: AgentTaskState): TaskStateTone {
  switch (state) {
    case 'queued':
    case 'running':
      return 'active';
    case 'awaiting_input':
    case 'ready_for_review':
    case 'paused':
      return 'attention';
    case 'completed':
      return 'success';
    case 'failed':
      return 'danger';
    case 'cancelled':
    case 'archived':
    default:
      return 'muted';
  }
}

export const TASK_TONE_BADGE_CLASS: Record<TaskStateTone, string> = {
  active: 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400',
  attention: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  success: 'border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400',
  danger: 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
  muted: 'border-border bg-muted text-muted-foreground',
};

export function isCancellableState(state: AgentTaskState): boolean {
  return (
    state === 'queued' || state === 'running' || state === 'awaiting_input' || state === 'paused'
  );
}

/**
 * Is this run still capable of appending to its journal?
 *
 * Narrower than {@link isCancellableState} on purpose: this drives the detail
 * panel's background refresh, and polling a run that will never emit another
 * event is pure waste. `ready_for_review` is excluded — the agent loop emits it
 * as its FINAL state, so the journal is already complete. `awaiting_input` IS
 * included: another device can answer the approval, after which this run starts
 * producing events again without anything happening on this client.
 */
export function isLiveTaskState(state: AgentTaskState): boolean {
  return (
    state === 'queued' || state === 'running' || state === 'awaiting_input' || state === 'paused'
  );
}
