const FINISHED_STATUSES: ReadonlySet<string> = new Set([
  'ready_for_review',
  'completed',
  'failed',
  'cancelled',
  'rejected',
]);

export function isDispatchTaskFinished(status: string): boolean {
  return FINISHED_STATUSES.has(status);
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
