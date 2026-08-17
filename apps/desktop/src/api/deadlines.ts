export class DeadlineExceededError extends Error {
  readonly budgetMs: number;

  constructor(label: string, budgetMs: number) {
    super(`${label} exhausted its ${budgetMs}ms deadline`);
    this.name = 'DeadlineExceededError';
    this.budgetMs = budgetMs;
  }
}

export interface Deadline {
  readonly totalMs: number;
  readonly remainingMs: () => number;
}

export function startDeadline(totalMs: number): Deadline {
  const startedAt = Date.now();
  return {
    totalMs,
    remainingMs: () => Math.max(0, totalMs - (Date.now() - startedAt)),
  };
}

export function assertChildDeadline(childMs: number, parentMs: number, label: string): number {
  if (!Number.isFinite(childMs) || childMs <= 0) {
    throw new RangeError(`${label} deadline must be a positive number of milliseconds`);
  }
  if (childMs > parentMs) {
    throw new RangeError(`${label} deadline of ${childMs}ms outlives its ${parentMs}ms parent`);
  }
  return childMs;
}

export function claimFromDeadline(deadline: Deadline, requestedMs: number, label: string): number {
  const remaining = deadline.remainingMs();
  if (remaining <= 0) {
    throw new DeadlineExceededError(label, deadline.totalMs);
  }
  return assertChildDeadline(Math.min(requestedMs, remaining), deadline.totalMs, label);
}
