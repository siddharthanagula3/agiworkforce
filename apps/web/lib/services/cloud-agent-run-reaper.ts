import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { CLOUD_AGENT_WORKFLOW_INVOCATION_LIMIT_MS } from '@/lib/deadline-policy';
import {
  CLOUD_AGENT_RUN_ABANDONED_CODE,
  cancelCloudAgentWorkflowRun,
  explainCloudAgentRunEnding,
} from './cloud-agent-run-termination';
import { MAX_OPERATION_LEASE_SECONDS } from './cloud-agent-execution-service';

export const CLOUD_AGENT_ORPHANED_RUN_AGE_SECONDS =
  CLOUD_AGENT_WORKFLOW_INVOCATION_LIMIT_MS / 1_000 + MAX_OPERATION_LEASE_SECONDS;

const REAP_BATCH_SIZE = 200;
const MAX_REAP_BATCHES = 25;
const REAP_BUDGET_MS = 240_000;
const CANCELLED_STATE = 'cancelled';

const CANCEL_CONCURRENCY = 8;

const ORPHANED_RUN_MESSAGE =
  'This turn did not finish: the run working on it ended before it could report back.';
const STOPPED_RUN_MESSAGE =
  'You stopped this turn, and the run working on it ended before it could report back.';

export interface CloudAgentRunReapReport {
  reaped: number;
  stoppedByUser: number;
  worldRunsCancelled: number;
  worldRunsUncancelled: number;
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
  workflow_run_id: string | null;
}

function explainReapedRun(db: DatabaseAdapter, row: ReapedRunRow): Promise<void> {
  const stopped = row.state === CANCELLED_STATE;
  return explainCloudAgentRunEnding(db, {
    runId: row.id,
    userId: row.user_id,
    conversationId: row.conversation_id,
    turnId: row.request_id,
    model: row.model,
    lastEventSequence: Number(row.last_event_sequence),
    state: stopped ? 'cancelled' : 'failed',
    message: stopped ? STOPPED_RUN_MESSAGE : ORPHANED_RUN_MESSAGE,
    code: CLOUD_AGENT_RUN_ABANDONED_CODE,
    summary: stopped ? 'Stopped before it finished.' : 'Ended without finishing.',
  });
}

// A reaped row whose world run still exists is redelivered and burns a whole
// invocation limit each time; one refusal never stops the others.
async function cancelReapedWorldRuns(
  rows: readonly ReapedRunRow[],
  report: CloudAgentRunReapReport,
): Promise<void> {
  const pending = rows.map((row) => row.workflow_run_id).filter((id): id is string => Boolean(id));
  for (let index = 0; index < pending.length; index += CANCEL_CONCURRENCY) {
    const outcomes = await Promise.all(
      pending.slice(index, index + CANCEL_CONCURRENCY).map(cancelCloudAgentWorkflowRun),
    );
    for (const cancelled of outcomes) {
      if (cancelled) report.worldRunsCancelled += 1;
      else report.worldRunsUncancelled += 1;
    }
  }
}

export async function reapOrphanedCloudAgentRuns(
  db: DatabaseAdapter,
  options: { now?: () => number } = {},
): Promise<CloudAgentRunReapReport> {
  const now = options.now ?? Date.now;
  const startedAtMs = now();
  const report: CloudAgentRunReapReport = {
    reaped: 0,
    stoppedByUser: 0,
    worldRunsCancelled: 0,
    worldRunsUncancelled: 0,
    remaining: false,
  };

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
      returning id, user_id, state, conversation_id, request_id, model, last_event_sequence,
                workflow_run_id`,
      [CLOUD_AGENT_ORPHANED_RUN_AGE_SECONDS, REAP_BATCH_SIZE],
    );

    if (reaped.length === 0) return report;
    report.reaped += reaped.length;
    report.stoppedByUser += reaped.filter((row) => row.state === CANCELLED_STATE).length;

    await cancelReapedWorldRuns(reaped, report);

    for (const row of reaped) {
      await explainReapedRun(db, row);
    }

    if (reaped.length < REAP_BATCH_SIZE) return report;
  }

  report.remaining = true;
  return report;
}
