import 'server-only';

import { AsyncLocalStorage } from 'node:async_hooks';

export interface ScheduleRunScope {
  userId: string;
  taskId: string;
  runId: string;
}

const scheduleRunScope = new AsyncLocalStorage<ScheduleRunScope>();

export function runWithinScheduleRun<T>(
  scope: ScheduleRunScope,
  run: () => Promise<T>,
): Promise<T> {
  return scheduleRunScope.run(scope, run);
}

export function currentScheduleRun(): ScheduleRunScope | undefined {
  return scheduleRunScope.getStore();
}
