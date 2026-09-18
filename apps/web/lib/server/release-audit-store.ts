import 'server-only';

import { getNeonDb } from '@/lib/server/neon-db';

export const RELEASE_AUDIT_RETENTION_DAYS = 400;

export const RELEASE_EVENTS = [
  'promoted',
  'rolled_back',
  'verification_failed',
  'rollback_drill',
] as const;

export const RELEASE_SURFACES = ['web', 'gateway', 'sandbox'] as const;
export const RELEASE_ENVIRONMENTS = ['production', 'staging'] as const;
export const RELEASE_OUTCOMES = ['succeeded', 'failed'] as const;
export const RELEASE_SOURCES = ['deploy_workflow', 'rollback_workflow', 'operator'] as const;

export type ReleaseEventName = (typeof RELEASE_EVENTS)[number];
export type ReleaseSurface = (typeof RELEASE_SURFACES)[number];
export type ReleaseEnvironment = (typeof RELEASE_ENVIRONMENTS)[number];
export type ReleaseOutcome = (typeof RELEASE_OUTCOMES)[number];
export type ReleaseSource = (typeof RELEASE_SOURCES)[number];

export const GENESIS_HASH = '0'.repeat(64);

export interface ReleaseEventInput {
  event: ReleaseEventName;
  surface: ReleaseSurface;
  environment: ReleaseEnvironment;
  outcome: ReleaseOutcome;
  actor: string;
  source: ReleaseSource;
  commitSha?: string | null;
  deploymentId?: string | null;
  previousDeploymentId?: string | null;
  reason?: string | null;
  runUrl?: string | null;
  detail?: Record<string, unknown>;
}

export interface ReleaseEvent extends Omit<ReleaseEventInput, 'detail'> {
  id: number;
  commitSha: string | null;
  deploymentId: string | null;
  previousDeploymentId: string | null;
  reason: string | null;
  runUrl: string | null;
  detail: Record<string, unknown>;
  recordedAt: string;
  previousHash: string;
  entryHash: string;
}

interface ReleaseEventRow {
  id: number | string;
  event: string;
  surface: string;
  environment: string;
  outcome: string;
  commit_sha: string | null;
  deployment_id: string | null;
  previous_deployment_id: string | null;
  actor: string;
  source: string;
  reason: string | null;
  run_url: string | null;
  detail: Record<string, unknown> | string | null;
  recorded_at: Date | string;
  previous_hash: string;
  entry_hash: string;
}

const SELECTED_COLUMNS = `id, event, surface, environment, outcome, commit_sha, deployment_id,
            previous_deployment_id, actor, source, reason, run_url, detail,
            recorded_at, previous_hash, entry_hash`;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toDetail(value: ReleaseEventRow['detail']): Record<string, unknown> {
  if (value === null) return {};
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return value;
}

export function toReleaseEvent(row: ReleaseEventRow): ReleaseEvent {
  return {
    id: Number(row.id),
    event: row.event as ReleaseEventName,
    surface: row.surface as ReleaseSurface,
    environment: row.environment as ReleaseEnvironment,
    outcome: row.outcome as ReleaseOutcome,
    commitSha: row.commit_sha,
    deploymentId: row.deployment_id,
    previousDeploymentId: row.previous_deployment_id,
    actor: row.actor,
    source: row.source as ReleaseSource,
    reason: row.reason,
    runUrl: row.run_url,
    detail: toDetail(row.detail),
    recordedAt: toIsoString(row.recorded_at),
    previousHash: row.previous_hash,
    entryHash: row.entry_hash,
  };
}

export interface ReleaseChainVerdict {
  intact: boolean;
  brokenAt: number | null;
}

// A window of the trail, not necessarily the whole of it, so the genesis link
// is only asserted when the oldest event in hand is the first one written.
export function verifyReleaseChain(events: readonly ReleaseEvent[]): ReleaseChainVerdict {
  const oldestFirst = [...events].sort((left, right) => left.id - right.id);
  const oldest = oldestFirst[0];
  if (oldest && oldest.id === 1 && oldest.previousHash !== GENESIS_HASH) {
    return { intact: false, brokenAt: oldest.id };
  }
  for (let index = 1; index < oldestFirst.length; index += 1) {
    const current = oldestFirst[index];
    const previous = oldestFirst[index - 1];
    if (!current || !previous) continue;
    if (current.previousHash !== previous.entryHash) {
      return { intact: false, brokenAt: current.id };
    }
  }
  return { intact: true, brokenAt: null };
}

export async function recordReleaseEvent(input: ReleaseEventInput): Promise<ReleaseEvent> {
  const rows = await getNeonDb().query<ReleaseEventRow>(
    `select ${SELECTED_COLUMNS}
       from public.append_release_event($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)`,
    [
      input.event,
      input.surface,
      input.environment,
      input.outcome,
      input.actor,
      input.source,
      input.commitSha ?? null,
      input.deploymentId ?? null,
      input.previousDeploymentId ?? null,
      input.reason ?? null,
      input.runUrl ?? null,
      JSON.stringify(input.detail ?? {}),
    ],
  );
  const row = rows[0];
  if (!row) throw new Error('The release event was not appended');
  return toReleaseEvent(row);
}

export interface ReleaseEventQuery {
  surface?: ReleaseSurface;
  environment?: ReleaseEnvironment;
  limit?: number;
}

export async function readReleaseEvents(query: ReleaseEventQuery = {}): Promise<ReleaseEvent[]> {
  const limit = Math.min(
    Math.max(Number.isInteger(query.limit) ? (query.limit as number) : DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  );
  const rows = await getNeonDb().query<ReleaseEventRow>(
    `select ${SELECTED_COLUMNS}
       from public.release_events
      where ($1::text is null or surface = $1)
        and ($2::text is null or environment = $2)
      order by recorded_at desc, id desc
      limit $3`,
    [query.surface ?? null, query.environment ?? null, limit],
  );
  return rows.map(toReleaseEvent);
}
