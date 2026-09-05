import type { AgentActivityEntry } from '@agiworkforce/client-runtime';

/**
 * Mirrors the ids the AGI Work planner emits; the server constants live behind
 * `server-only` and cannot be imported here.
 */
export const AGIWORK_GOAL_PROGRESS_ID = 'agiwork:goal';
export const AGIWORK_PLAN_PROGRESS_ID_PREFIX = 'agiwork:plan:';

const PLAN_STEP_ORDINAL = /^\s*\d+\.\s*/;

export function isAgiWorkPlanEntry(entry: AgentActivityEntry): boolean {
  return entry.kind === 'progress' && entry.progressId.startsWith(AGIWORK_PLAN_PROGRESS_ID_PREFIX);
}

export function agiWorkPlanSentence(entries: readonly AgentActivityEntry[]): string | undefined {
  const first = entries.find(isAgiWorkPlanEntry);
  if (!first || first.kind !== 'progress') return undefined;
  const sentence = first.summary.replace(PLAN_STEP_ORDINAL, '').trim();
  return sentence.length > 0 ? sentence : undefined;
}
