import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  createCloudAgentRun,
  isCloudAgentRunCancellationRequested,
  requestCloudAgentRunCancellation,
} from './cloud-agent-run-service';

/**
 * A Code turn's durable execution runs on the same spine the chat surface uses,
 * `cloud_agent_runs`, and not because the two turns are the same thing.
 *
 * `cloud_agent_execution_operations`, the ledger that makes a step idempotent
 * across invocations, carries a hard foreign key to `cloud_agent_runs(id,
 * user_id)` (migration 0063). Nothing durable can be recorded for a turn that
 * has no run row, so a Code turn opens one. The turn's own product state stays
 * where it was, in `cloud_code_agent_turns`; the run row is the execution
 * identity, not a second copy of the turn.
 *
 * The two are joined without a new column: `cloud_agent_runs.request_id` is
 * unique per user, and so is `cloud_code_agent_turns.idempotency_key`, so the
 * turn's key is the run's request id and either row finds the other. That is
 * what keeps this off a migration.
 */
export const CLOUD_CODE_RUN_ORIGIN_SURFACE = 'web' as const;

/**
 * `work_mode` admits chat, agiwork and research (migration 0061), and a Code
 * turn is none of the three exactly. `agiwork` is the closest true statement:
 * an agent doing work rather than holding a conversation. Widening the enum
 * would be a migration for a label, so the label bends instead of the schema.
 */
export const CLOUD_CODE_RUN_WORK_MODE = 'agiwork' as const;

export interface CloudCodeDurableRunOwner {
  userId: string;
  organizationId: string | null;
}

export interface OpenCloudCodeDurableRunInput {
  turnId: string;
  idempotencyKey: string;
  provider: string;
  model: string;
}

/**
 * Idempotent: `createCloudAgentRun` conflicts on (user_id, request_id) and
 * returns the existing row, so a retried start reattaches to the run it already
 * opened rather than opening a second one.
 */
export async function openCloudCodeDurableRun(
  db: DatabaseAdapter,
  owner: CloudCodeDurableRunOwner,
  input: OpenCloudCodeDurableRunInput,
): Promise<{ runId: string }> {
  const run = await createCloudAgentRun(db, {
    userId: owner.userId,
    requestId: input.idempotencyKey,
    originSurface: CLOUD_CODE_RUN_ORIGIN_SURFACE,
    workMode: CLOUD_CODE_RUN_WORK_MODE,
    provider: input.provider,
    model: input.model,
  });
  return { runId: run.id };
}

export async function findCloudCodeDurableRunId(
  db: DatabaseAdapter,
  owner: CloudCodeDurableRunOwner,
  idempotencyKey: string,
): Promise<string | null> {
  const rows = await db.query<{ id: string }>(
    `select id
       from public.cloud_agent_runs
      where user_id = $1 and request_id = $2
      limit 1`,
    [owner.userId, idempotencyKey],
  );
  return rows[0]?.id ?? null;
}

/**
 * Mirrors a stop onto the run row so the durable loop's existing cancellation
 * read sees it.
 *
 * A stop is recorded against the turn, which is the record the Code surface
 * reads. The durable loop reads `cloud_agent_runs.cancellation_requested_at`
 * instead, and it runs in an invocation that never saw the request. Writing
 * both is what makes one stop button work whichever transport is carrying the
 * turn. Absent run: the turn is running inline, and the turn flag is the whole
 * story.
 */
export async function mirrorCloudCodeStopOntoDurableRun(
  db: DatabaseAdapter,
  owner: CloudCodeDurableRunOwner,
  idempotencyKey: string,
): Promise<boolean> {
  const runId = await findCloudCodeDurableRunId(db, owner, idempotencyKey);
  if (!runId) return false;
  await requestCloudAgentRunCancellation(db, { userId: owner.userId, runId });
  return true;
}

/**
 * True when either side has been asked to stop. The Code surface writes the
 * turn flag and the durable machinery writes the run flag, and a turn must
 * honour a stop recorded by either.
 */
export async function isCloudCodeDurableStopRequested(
  db: DatabaseAdapter,
  owner: CloudCodeDurableRunOwner,
  input: { runId: string; turnId: string },
): Promise<boolean> {
  const [runStopped, turnRows] = await Promise.all([
    isCloudAgentRunCancellationRequested(db, { userId: owner.userId, runId: input.runId }),
    db.query<{ cancel_requested_at: string | Date | null }>(
      `select cancel_requested_at
         from cloud_code_agent_turns
        where id = $1 and user_id = $2 and organization_id is not distinct from $3
        limit 1`,
      [input.turnId, owner.userId, owner.organizationId],
    ),
  ]);
  return runStopped || Boolean(turnRows[0]?.cancel_requested_at);
}
