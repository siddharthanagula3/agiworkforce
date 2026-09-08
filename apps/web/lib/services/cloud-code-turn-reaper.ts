import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { CLOUD_CODE_RUN_LEASE_SECONDS } from './cloud-code-session-service';
import { CLOUD_CODE_ROUTE_FUNCTION_LIMIT_MS } from './cloud-code-agent-service';

/**
 * How long a turn may sit at `running` before it is certainly dead.
 *
 * A turn writes `updated_at` when it opens and again when it reaches a terminal
 * state, so a live turn's row is at most one route ceiling old. Past that
 * ceiling the platform has already killed the invocation, and past the run
 * lease on top of it the session has been reclaimable for a while too. Anything
 * still `running` beyond the sum has no invocation behind it: the sum is the
 * point where "still working" stops being a possible explanation.
 *
 * Erring long is deliberate. Reaping a turn that is in fact alive would write a
 * terminal row underneath a running loop, and the loop would then write over
 * it; waiting longer only delays a row nobody is watching.
 */
export const CLOUD_CODE_STUCK_TURN_AGE_SECONDS =
  CLOUD_CODE_ROUTE_FUNCTION_LIMIT_MS / 1_000 + CLOUD_CODE_RUN_LEASE_SECONDS;

const REAP_BATCH_SIZE = 200;
const MAX_REAP_BATCHES = 25;
const REAP_BUDGET_MS = 240_000;

const ABANDONED_TURN_MESSAGE =
  'This turn stopped without finishing: the run executing it ended before it could report back.';
const ABANDONED_STOPPED_TURN_MESSAGE =
  'You stopped this turn, and the run executing it ended before it could report back.';

export interface CloudCodeTurnReapReport {
  /** Turns moved off `running` by this sweep. */
  reaped: number;
  /** Of those, the ones the reader had already asked to stop. */
  stoppedByUser: number;
  /** Sessions released from `running` because their turn was reaped. */
  sessionsReleased: number;
  /** True when the batch or time ceiling stopped the sweep with work left. */
  remaining: boolean;
}

interface ReapedTurnRow extends Record<string, unknown> {
  session_id: string;
  user_id: string;
  stop_reason: string;
}

/**
 * Moves turns off `running` when the invocation that held them is gone.
 *
 * Deliberately does not settle their managed-usage reservations.
 * `recover_stale_managed_usage_requests` (migration 0056) already refunds a
 * reservation whose lease expires without a durable provider success, exactly
 * once, and the reconcile-credits cron is its only caller. A second writer to
 * that ledger could double-refund or race that function's `for update skip
 * locked`, so the reservation is left to its owner; this sweep only ends the
 * turn row, which nothing else ends.
 *
 * A turn the reader had asked to stop is recorded as stopped rather than timed
 * out. The request outlived the invocation that never saw it, and blaming the
 * clock for a stop the reader asked for reads as a fault the product had.
 */
export async function reapStuckCloudCodeTurns(
  db: DatabaseAdapter,
  options: { now?: () => number } = {},
): Promise<CloudCodeTurnReapReport> {
  const now = options.now ?? Date.now;
  const startedAtMs = now();
  const report: CloudCodeTurnReapReport = {
    reaped: 0,
    stoppedByUser: 0,
    sessionsReleased: 0,
    remaining: false,
  };

  for (let batch = 0; batch < MAX_REAP_BATCHES; batch += 1) {
    if (now() - startedAtMs > REAP_BUDGET_MS) {
      report.remaining = true;
      return report;
    }

    const reaped = await db.query<ReapedTurnRow>(
      `update cloud_code_agent_turns
          set state = case when cancel_requested_at is null then 'failed' else 'cancelled' end,
              stop_reason = case when cancel_requested_at is null then 'timeout' else 'cancelled' end,
              error_message = coalesce(
                error_message,
                case when cancel_requested_at is null then $3 else $4 end
              ),
              updated_at = now()
        where id in (
          select id
            from cloud_code_agent_turns
           where state = 'running'
             and updated_at < now() - make_interval(secs => $1)
           order by updated_at
           limit $2
        )
      returning session_id, user_id, stop_reason`,
      [
        CLOUD_CODE_STUCK_TURN_AGE_SECONDS,
        REAP_BATCH_SIZE,
        ABANDONED_TURN_MESSAGE,
        ABANDONED_STOPPED_TURN_MESSAGE,
      ],
    );

    if (reaped.length === 0) return report;
    report.reaped += reaped.length;
    report.stoppedByUser += reaped.filter((row) => row.stop_reason === 'cancelled').length;

    // Only the sessions whose turn this sweep just ended, and only where the
    // run lease has already expired, so a session a live run holds is never
    // taken from underneath it.
    const released = await db.query<{ id: string }>(
      `update cloud_code_sessions
          set state = 'ready',
              run_lease_token = null,
              run_lease_expires_at = null,
              updated_at = now()
        where (id, user_id) in (select unnest($1::uuid[]), unnest($2::text[]))
          and state = 'running'
          and (run_lease_expires_at is null or run_lease_expires_at <= now())
       returning id`,
      [reaped.map((row) => row.session_id), reaped.map((row) => row.user_id)],
    );
    report.sessionsReleased += released.length;

    if (reaped.length < REAP_BATCH_SIZE) return report;
  }

  report.remaining = true;
  return report;
}
