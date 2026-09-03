import { CLOUD_CODE_HARNESS_COMMAND_DEADLINE_MS, nestedDeadlineMs } from '@/lib/deadline-policy';

export const HARNESS_MAX_TURNS = 24;

export const HARNESS_RUN_DEADLINE_MS = CLOUD_CODE_HARNESS_COMMAND_DEADLINE_MS;

export function harnessRunDeadlineMs(
  parentBudgetMs: number | undefined,
  parentElapsedMs: number,
): number {
  return nestedDeadlineMs(HARNESS_RUN_DEADLINE_MS, parentBudgetMs, parentElapsedMs);
}
