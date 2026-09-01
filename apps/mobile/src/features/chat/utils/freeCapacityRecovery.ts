import type { ApiFreeCapacityError } from '@/services/api';

const MS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const MAX_COUNTDOWN_MS = 10 * SECONDS_PER_MINUTE * MS_PER_SECOND;

export const FREE_CAPACITY_BUSY_MESSAGE =
  'Free capacity is busy right now. Please try again shortly.';

export interface FreeCapacityErrorState {
  retryAtMs: number | null;
  code: string;
}

export function freeCapacityErrorStateFromApiError(
  error: ApiFreeCapacityError,
): FreeCapacityErrorState {
  return {
    retryAtMs: error.retryAtMs,
    code: error.code,
  };
}

/**
 * Zero whenever waiting out the deadline is not the right advice. The lane's
 * self-healing backoff tops out around ten minutes, so anything beyond that is
 * a quota window measured in hours, and a retry disabled that long is dead.
 */
export function freeCapacityRetrySeconds(retryAtMs: number | null, nowMs: number): number {
  if (retryAtMs === null) return 0;
  const remainingMs = retryAtMs - nowMs;
  if (remainingMs <= 0 || remainingMs > MAX_COUNTDOWN_MS) return 0;
  return Math.ceil(remainingMs / MS_PER_SECOND);
}

function formatRetryWait(retrySeconds: number): string {
  if (retrySeconds < SECONDS_PER_MINUTE) return `${retrySeconds}s`;
  const minutes = Math.floor(retrySeconds / SECONDS_PER_MINUTE);
  const seconds = retrySeconds % SECONDS_PER_MINUTE;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

export function freeCapacityCountdownMessage(retrySeconds: number): string {
  return `Free capacity is busy. You can retry in ${formatRetryWait(retrySeconds)}.`;
}
