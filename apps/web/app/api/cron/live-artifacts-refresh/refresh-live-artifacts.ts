import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import { liveArtifactMissingConnectors } from '@/lib/services/artifact-runtime-service';

export const LIVE_ARTIFACT_REFRESH_BATCH = 50;
export const LIVE_ARTIFACT_REFRESH_BUDGET_MS = 240_000;

const CLAIM_LEASE = '15 minutes';
const READY_RECHECK = '24 hours';
const NEEDS_CONNECTION_RECHECK = '6 hours';
const FAILURE_BACKOFF_BASE = '15 minutes';
const FAILURE_BACKOFF_CEILING = '24 hours';
const FAILURE_BACKOFF_MAX_EXPONENT = 7;

interface ClaimedLiveArtifact {
  user_id: string;
  artifact_id: string;
  connectors: string[];
}

export interface LiveArtifactRefreshSummary {
  claimed: number;
  ready: number;
  needsConnection: number;
  failed: number;
  deferred: number;
}

export interface LiveArtifactRefreshDeps {
  missingConnectors: typeof liveArtifactMissingConnectors;
  now: () => number;
}

const DEFAULT_DEPS: LiveArtifactRefreshDeps = {
  missingConnectors: liveArtifactMissingConnectors,
  now: () => Date.now(),
};

async function claimDue(db: DatabaseAdapter, limit: number): Promise<ClaimedLiveArtifact[]> {
  return db.query<ClaimedLiveArtifact>(
    `with due as (
       select user_id, artifact_id
         from public.live_artifacts
        where next_check_at <= now()
        order by next_check_at
        limit $1::integer
        for update skip locked
     )
     update public.live_artifacts live
        set next_check_at = now() + $2::interval
       from due
      where live.user_id = due.user_id
        and live.artifact_id = due.artifact_id
      returning live.user_id, live.artifact_id, live.connectors`,
    [limit, CLAIM_LEASE],
  );
}

async function recordReadiness(
  db: DatabaseAdapter,
  row: ClaimedLiveArtifact,
  missing: readonly string[],
): Promise<void> {
  await db.execute(
    `update public.live_artifacts
        set readiness = case when cardinality($3::text[]) = 0 then 'ready' else 'needs_connection' end,
            missing_connectors = $3::text[],
            check_failures = 0,
            checked_at = now(),
            next_check_at = now() + case when cardinality($3::text[]) = 0
                                         then $4::interval
                                         else $5::interval end
      where user_id = $1::text
        and artifact_id = $2::uuid
        and connectors = $6::text[]`,
    [
      row.user_id,
      row.artifact_id,
      [...missing],
      READY_RECHECK,
      NEEDS_CONNECTION_RECHECK,
      row.connectors,
    ],
  );
}

async function recordFailure(db: DatabaseAdapter, row: ClaimedLiveArtifact): Promise<void> {
  await db.execute(
    `update public.live_artifacts
        set check_failures = check_failures + 1,
            next_check_at = now() + least(
              $3::interval,
              $4::interval * power(2, least(check_failures, $5::integer))
            )
      where user_id = $1::text
        and artifact_id = $2::uuid`,
    [
      row.user_id,
      row.artifact_id,
      FAILURE_BACKOFF_CEILING,
      FAILURE_BACKOFF_BASE,
      FAILURE_BACKOFF_MAX_EXPONENT,
    ],
  );
}

export async function refreshLiveArtifacts(
  db: DatabaseAdapter,
  deps: LiveArtifactRefreshDeps = DEFAULT_DEPS,
): Promise<LiveArtifactRefreshSummary> {
  const started = deps.now();
  const claimed = await claimDue(db, LIVE_ARTIFACT_REFRESH_BATCH);
  const summary: LiveArtifactRefreshSummary = {
    claimed: claimed.length,
    ready: 0,
    needsConnection: 0,
    failed: 0,
    deferred: 0,
  };
  for (const row of claimed) {
    if (deps.now() - started > LIVE_ARTIFACT_REFRESH_BUDGET_MS) {
      summary.deferred += 1;
      continue;
    }
    try {
      const missing = await deps.missingConnectors({
        db,
        userId: row.user_id,
        connectors: row.connectors,
      });
      await recordReadiness(db, row, missing);
      if (missing.length === 0) summary.ready += 1;
      else summary.needsConnection += 1;
    } catch (error) {
      summary.failed += 1;
      logger.warn(
        {
          artifactId: row.artifact_id,
          error: error instanceof Error ? error.message : String(error),
        },
        'Live artifact readiness check failed; backing off',
      );
      await recordFailure(db, row).catch((recordError: unknown) => {
        logger.error(
          { artifactId: row.artifact_id, error: recordError },
          'Live artifact readiness backoff could not be saved',
        );
      });
    }
  }
  return summary;
}
