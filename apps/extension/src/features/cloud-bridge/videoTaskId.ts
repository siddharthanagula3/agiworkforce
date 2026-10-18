const TASK_ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

export function isChromeVideoTaskId(value: unknown): value is string {
  return typeof value === 'string' && TASK_ID_PATTERN.test(value);
}
