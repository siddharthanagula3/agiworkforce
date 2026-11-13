export const SANDBOX_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * A paused sandbox is a warm cache, not the conversation: its state can be
 * rebuilt on the next run. It still holds a slot against the per-user cap, so
 * it gives that slot up long before a running one would.
 */
export const PAUSED_SANDBOX_MAX_AGE_MS = 2 * 60 * 60 * 1000;

/**
 * The longest gap between two runs of `/api/cron/reclaim-sandboxes` as
 * `vercel.json` schedules it. A sandbox that reaches its age cap just after a
 * sweep is reclaimed, and its open interval billed, only this much later.
 */
export const RECLAIM_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
