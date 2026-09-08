import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { createAgentEventStreamEmitter } from '@/app/api/llm/v1/chat/completions/lib/agent-event-stream';
import { CLOUD_AGENT_WORKFLOW_INVOCATION_LIMIT_MS } from '@/lib/deadline-policy';
import { logger } from '@/lib/logger';
import { appendCloudAgentEvents } from './cloud-agent-run-service';
import { MAX_OPERATION_LEASE_SECONDS } from './cloud-agent-execution-service';

/**
 * How long a run may sit non-terminal before it certainly has no invocation.
 *
 * Every journal append writes `updated_at`, so a run that is producing anything
 * keeps its row fresh and is never a candidate. A silent one is bounded by the
 * platform's workflow invocation ceiling, and a replay that finds the operation
 * still leased waits at most one lease on top of that. Past the sum, "still
 * working" has stopped being a possible explanation.
 *
 * Erring long is deliberate, as in `cloud-code-turn-reaper`: writing a terminal
 * row underneath a live workflow would be overwritten by it, while waiting
 * longer only delays a row nobody is watching.
 */
export const CLOUD_AGENT_ORPHANED_RUN_AGE_SECONDS =
  CLOUD_AGENT_WORKFLOW_INVOCATION_LIMIT_MS / 1_000 + MAX_OPERATION_LEASE_SECONDS;

const REAP_BATCH_SIZE = 200;
const MAX_REAP_BATCHES = 25;
const REAP_BUDGET_MS = 240_000;
const CANCELLED_STATE = 'cancelled';

const ORPHANED_RUN_MESSAGE =
  'This turn did not finish: the run working on it ended before it could report back.';
const STOPPED_RUN_MESSAGE =
  'You stopped this turn, and the run working on it ended before it could report back.';
const ORPHANED_RUN_CODE = 'run_abandoned';

export interface CloudAgentRunReapReport {
  /** Runs moved off queued or running by this sweep. */
  reaped: number;
  /** Of those, the ones the reader had already asked to stop. */
  stoppedByUser: number;
  /** True when the batch or time ceiling stopped the sweep with work left. */
  remaining: boolean;
}

interface ReapedRunRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  state: string;
  conversation_id: string | null;
  request_id: string;
  model: string;
  last_event_sequence: number | string;
}

/**
 * The state change alone is a run that stopped for no stated reason. These two
 * events are what a reattaching client and the task surface read, written
 * through the same journal owner the workflow's own failure path uses.
 *
 * Best-effort on purpose: the run is already off `running` by the time this
 * runs, and a journal that cannot be written must not put it back.
 */
async function explainReapedRun(db: DatabaseAdapter, row: ReapedRunRow): Promise<void> {
  const stopped = row.state === CANCELLED_STATE;
  const turnId = row.request_id;
  const emitter = createAgentEventStreamEmitter({
    sessionId: row.conversation_id ?? turnId,
    turnId,
    responseModel: row.model,
    initialSequence: Number(row.last_event_sequence) + 1,
  });
  const envelopes = [
    emitter.emitWithEnvelope({
      type: 'error',
      message: stopped ? STOPPED_RUN_MESSAGE : ORPHANED_RUN_MESSAGE,
      code: ORPHANED_RUN_CODE,
      retryable: true,
    }).envelope,
    emitter.emitWithEnvelope({
      type: 'task-state-changed',
      taskId: turnId,
      state: stopped ? 'cancelled' : 'failed',
      summary: stopped ? 'Stopped before it finished.' : 'Ended without finishing.',
    }).envelope,
  ];

  try {
    await appendCloudAgentEvents(db, { userId: row.user_id, runId: row.id, envelopes });
  } catch (error) {
    logger.warn(
      { error, runId: row.id },
      'A reaped run was ended but its reason was not journalled',
    );
  }
}

/**
 * Ends runs whose workflow invocation died before it could settle them.
 *
 * Only `queued` and `running` are swept. `awaiting_input`, `ready_for_review`
 * and `paused` are parked on a person and stay parked however long that takes.
 *
 * Deliberately does not settle managed-usage reservations, for the reason
 * `reapStuckCloudCodeTurns` states: `recover_stale_managed_usage_requests` owns
 * that ledger and refunds an expired reservation exactly once, and a second
 * writer could double-refund or race its `for update skip locked`.
 */
export async function reapOrphanedCloudAgentRuns(
  db: DatabaseAdapter,
  options: { now?: () => number } = {},
): Promise<CloudAgentRunReapReport> {
  const now = options.now ?? Date.now;
  const startedAtMs = now();
  const report: CloudAgentRunReapReport = { reaped: 0, stoppedByUser: 0, remaining: false };

  for (let batch = 0; batch < MAX_REAP_BATCHES; batch += 1) {
    if (now() - startedAtMs > REAP_BUDGET_MS) {
      report.remaining = true;
      return report;
    }

    const reaped = await db.query<ReapedRunRow>(
      `update public.cloud_agent_runs
          set state = case when cancellation_requested_at is null then 'failed' else 'cancelled' end,
              completed_at = coalesce(completed_at, now()),
              updated_at = now()
        where id in (
          select id
            from public.cloud_agent_runs
           where state in ('queued', 'running')
             and updated_at < now() - make_interval(secs => $1)
           order by updated_at
           limit $2
        )
      returning id, user_id, state, conversation_id, request_id, model, last_event_sequence`,
      [CLOUD_AGENT_ORPHANED_RUN_AGE_SECONDS, REAP_BATCH_SIZE],
    );

    if (reaped.length === 0) return report;
    report.reaped += reaped.length;
    report.stoppedByUser += reaped.filter((row) => row.state === CANCELLED_STATE).length;

    for (const row of reaped) {
      await explainReapedRun(db, row);
    }

    if (reaped.length < REAP_BATCH_SIZE) return report;
  }

  report.remaining = true;
  return report;
}
