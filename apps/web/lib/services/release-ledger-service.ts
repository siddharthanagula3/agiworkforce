import 'server-only';

import { logger } from '@/lib/logger';
import { deployEnvironment, deploymentId, deployRegion, releaseSha } from '@/lib/server/hosting';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  RELEASE_AUDIT_RETENTION_DAYS,
  readReleaseEvents,
  verifyReleaseChain,
  type ReleaseChainVerdict,
  type ReleaseEvent,
} from '@/lib/server/release-audit-store';

export interface ReleaseLedgerEntry {
  surface: string;
  target: string;
  commitSha: string;
  deploymentRef: string | null;
  headSequence: number;
  headFilename: string;
  appliedCount: number;
  verifiedAt: string;
}

export interface ServingVersion {
  commit: string | null;
  environment: string | null;
  deploymentId: string | null;
  region: string | null;
}

export interface ReleaseDashboard {
  serving: ServingVersion;
  ledger: ReleaseLedgerEntry[];
  events: ReleaseEvent[];
  chain: ReleaseChainVerdict;
  lastRollback: ReleaseEvent | null;
  lastDrill: ReleaseEvent | null;
  drillAgeDays: number | null;
  ledgerMatchesServing: boolean | null;
  retentionDays: number;
  unreadable: string[];
}

interface LedgerRow {
  surface: string;
  target: string;
  commit_sha: string;
  deployment_ref: string | null;
  head_sequence: number | string;
  head_filename: string;
  applied_count: number | string;
  verified_at: Date | string;
}

const LEDGER_LIMIT = 20;
const EVENT_LIMIT = 50;
const DAY_MS = 86_400_000;

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

// The ledger table is created by the migration runner rather than a migration,
// so a deployment that has never recorded one has no relation to read.
export async function readReleaseLedger(
  limit: number = LEDGER_LIMIT,
): Promise<ReleaseLedgerEntry[]> {
  const relation = await getNeonDb().query<{ relation: string | null }>(
    "select to_regclass('public.schema_migration_deployments') as relation",
    [],
  );
  if (!relation[0]?.relation) return [];

  const rows = await getNeonDb().query<LedgerRow>(
    `select surface, target, commit_sha, deployment_ref, head_sequence, head_filename,
            applied_count, verified_at
       from public.schema_migration_deployments
      where target = 'production'
      order by verified_at desc, id desc
      limit $1`,
    [limit],
  );
  return rows.map((row) => ({
    surface: row.surface,
    target: row.target,
    commitSha: row.commit_sha,
    deploymentRef: row.deployment_ref,
    headSequence: Number(row.head_sequence),
    headFilename: row.head_filename,
    appliedCount: Number(row.applied_count),
    verifiedAt: toIsoString(row.verified_at),
  }));
}

export function servingVersion(): ServingVersion {
  return {
    commit: releaseSha() ?? null,
    environment: deployEnvironment() ?? null,
    deploymentId: deploymentId() ?? null,
    region: deployRegion() ?? null,
  };
}

function ageDays(isoTimestamp: string, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - Date.parse(isoTimestamp)) / DAY_MS));
}

// Whether the commit this instance runs is the one the ledger last recorded for
// its own surface. Null rather than false when either side is silent: an
// unrecorded deployment is not a mismatch, it is an unanswered question.
function ledgerAgreesWithServing(
  ledger: readonly ReleaseLedgerEntry[],
  serving: ServingVersion,
): boolean | null {
  const head = ledger.find((entry) => entry.surface === 'web');
  if (!head || !serving.commit) return null;
  return head.commitSha.startsWith(serving.commit) || serving.commit.startsWith(head.commitSha);
}

export async function readReleaseDashboard(nowMs: number = Date.now()): Promise<ReleaseDashboard> {
  const unreadable: string[] = [];
  const [ledger, events] = await Promise.all([
    readReleaseLedger().catch((error: unknown) => {
      logger.warn({ error }, '[releases] the migration ledger could not be read');
      unreadable.push('ledger');
      return [] as ReleaseLedgerEntry[];
    }),
    readReleaseEvents({ limit: EVENT_LIMIT }).catch((error: unknown) => {
      logger.warn({ error }, '[releases] the release audit trail could not be read');
      unreadable.push('events');
      return [] as ReleaseEvent[];
    }),
  ]);
  const serving = servingVersion();
  const lastRollback = events.find((event) => event.event === 'rolled_back') ?? null;
  const lastDrill =
    events.find((event) => event.event === 'rollback_drill' && event.outcome === 'succeeded') ??
    null;

  return {
    serving,
    ledger,
    events,
    chain: verifyReleaseChain(events),
    lastRollback,
    lastDrill,
    drillAgeDays: lastDrill ? ageDays(lastDrill.recordedAt, nowMs) : null,
    ledgerMatchesServing: ledgerAgreesWithServing(ledger, serving),
    retentionDays: RELEASE_AUDIT_RETENTION_DAYS,
    unreadable,
  };
}
