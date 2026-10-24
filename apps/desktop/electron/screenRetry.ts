/**
 * Brings a window back from the screen the shell drew when the app could not
 * be reached, without the person pressing anything. Three things end the wait:
 * the device regaining a connection, the machine waking from sleep, and a
 * backoff timer for the cases neither covers, such as our own outage. Each
 * attempt goes through the caller, which decides whether the app answers
 * before the window is touched, so a failed attempt leaves the screen as it is.
 */

export const RETRY_BACKOFF_MS: readonly number[] = [5_000, 10_000, 20_000, 40_000, 60_000];
export const CONNECTION_POLL_MS = 2_000;

export interface ScreenRetryDeps {
  isOnline(): boolean;
  /** Subscribes to the machine waking from sleep; returns the unsubscribe. */
  onResume(listener: () => void): () => void;
}

export interface ScreenRetry {
  /** The window is showing an unreachable screen; `attempt` tries to leave it. */
  watch(id: number, attempt: () => Promise<void>): void;
  /** The window left the screen or closed. */
  release(id: number): void;
  watching(id: number): boolean;
}

interface Watch {
  attempt: () => Promise<void>;
  failures: number;
  running: boolean;
  online: boolean;
  backoff: NodeJS.Timeout | null;
  poll: NodeJS.Timeout | null;
  stopResume: () => void;
}

export function createScreenRetry(deps: ScreenRetryDeps): ScreenRetry {
  const watches = new Map<number, Watch>();

  const clearTimers = (watch: Watch): void => {
    if (watch.backoff) clearTimeout(watch.backoff);
    if (watch.poll) clearTimeout(watch.poll);
    watch.backoff = null;
    watch.poll = null;
  };

  const scheduleBackoff = (id: number, watch: Watch): void => {
    if (watch.backoff) clearTimeout(watch.backoff);
    const delay = RETRY_BACKOFF_MS[Math.min(watch.failures, RETRY_BACKOFF_MS.length - 1)] ?? 0;
    watch.backoff = setTimeout(() => void run(id), delay);
    watch.backoff.unref?.();
  };

  const schedulePoll = (id: number, watch: Watch): void => {
    watch.poll = setTimeout(() => {
      watch.poll = null;
      const online = deps.isOnline();
      const regained = online && !watch.online;
      watch.online = online;
      if (watches.get(id) !== watch) return;
      schedulePoll(id, watch);
      if (regained) void run(id);
    }, CONNECTION_POLL_MS);
    watch.poll.unref?.();
  };

  const run = async (id: number): Promise<void> => {
    const watch = watches.get(id);
    if (!watch || watch.running) return;
    watch.running = true;
    if (watch.backoff) clearTimeout(watch.backoff);
    watch.backoff = null;
    watch.failures += 1;
    await watch.attempt().catch(() => undefined);
    watch.running = false;
    if (watches.get(id) === watch) scheduleBackoff(id, watch);
  };

  return {
    watch(id, attempt) {
      const existing = watches.get(id);
      if (existing) {
        existing.attempt = attempt;
        if (!existing.running) scheduleBackoff(id, existing);
        return;
      }
      const watch: Watch = {
        attempt,
        failures: 0,
        running: false,
        online: deps.isOnline(),
        backoff: null,
        poll: null,
        stopResume: deps.onResume(() => void run(id)),
      };
      watches.set(id, watch);
      scheduleBackoff(id, watch);
      schedulePoll(id, watch);
    },
    release(id) {
      const watch = watches.get(id);
      if (!watch) return;
      watches.delete(id);
      clearTimers(watch);
      watch.stopResume();
    },
    watching(id) {
      return watches.has(id);
    },
  };
}
