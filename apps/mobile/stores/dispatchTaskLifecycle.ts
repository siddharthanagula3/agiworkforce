import {
  DISPATCH_STATUS_AGENT_TASK_STATES,
  TERMINAL_AGENT_TASK_STATES,
  type AgentTaskState,
} from '@agiworkforce/types';

export function isDispatchTaskFinished(status: string): boolean {
  if (!Object.hasOwn(DISPATCH_STATUS_AGENT_TASK_STATES, status)) return false;
  const state: AgentTaskState =
    DISPATCH_STATUS_AGENT_TASK_STATES[status as keyof typeof DISPATCH_STATUS_AGENT_TASK_STATES];
  return TERMINAL_AGENT_TASK_STATES.has(state);
}

export function keepUnfinishedAndRecentFinished<T extends { status: string }>(
  tasks: readonly T[],
  finishedAllowed: number,
): T[] {
  let finishedKept = 0;
  return tasks.filter((task) => {
    if (!isDispatchTaskFinished(task.status)) return true;
    if (finishedKept >= finishedAllowed) return false;
    finishedKept += 1;
    return true;
  });
}
