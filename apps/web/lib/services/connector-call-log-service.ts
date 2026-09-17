import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { logger } from '@/lib/logger';

export type ConnectorCallOutcome = 'succeeded' | 'failed' | 'blocked';

export interface ConnectorCallEntry {
  connectorId: string;
  toolName: string;
  outcome: ConnectorCallOutcome;
  durationMs: number | null;
  occurredAt: string;
}

export interface ConnectorCallRecord {
  userId: string;
  organizationId?: string | null;
  connectorId: string;
  toolName: string;
  outcome: ConnectorCallOutcome;
  durationMs?: number | null;
  surface?: string | null;
}

/**
 * How many consecutive failures make a connector "not responding", and how
 * recent the last of them has to be.
 *
 * One failure is a bad argument or a rejected request, which says nothing about
 * the provider. A run of them with no success in between is the only evidence
 * this side of the connection has that the other side has stopped answering,
 * and it expires: a connector nobody has called since yesterday is unknown, not
 * broken, so an old streak must never keep a working connector marked down.
 */
export const CONNECTOR_FAILURE_STREAK_THRESHOLD = 3;
export const CONNECTOR_FAILURE_RECENCY_MS = 30 * 60 * 1000;

const MAX_LOG_ENTRIES = 100;
const PG_UNDEFINED_TABLE = '42P01';

function isMissingRelation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  return (
    record['code'] === PG_UNDEFINED_TABLE ||
    String(record['message'] ?? '').includes('does not exist')
  );
}

function clampDuration(durationMs: number | null | undefined): number | null {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 0) return null;
  return Math.round(durationMs);
}

/**
 * Never awaited by the call it records and never able to fail it. A connector
 * tool that worked must not report an error because its own log line did not
 * land, and a deployment that has not applied 0223 yet keeps working without
 * the log rather than losing the connector.
 */
export function recordConnectorCallOutcome(db: DatabaseAdapter, record: ConnectorCallRecord): void {
  if (!record.userId) return;
  void db
    .query(
      `insert into public.connector_call_events
         (user_id, organization_id, connector_id, tool_name, outcome, duration_ms, surface)
       values ($1, $2::uuid, $3, $4, $5, $6, $7)`,
      [
        record.userId,
        record.organizationId ?? null,
        record.connectorId,
        record.toolName,
        record.outcome,
        clampDuration(record.durationMs),
        record.surface ?? null,
      ],
    )
    .catch((error: unknown) => {
      if (isMissingRelation(error)) return;
      logger.warn({ error }, '[connector-call-log] a connector call was not logged');
    });
}

interface CallRow {
  connector_id: string;
  tool_name: string;
  outcome: ConnectorCallOutcome;
  duration_ms: number | string | null;
  occurred_at: string | Date;
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toEntry(row: CallRow): ConnectorCallEntry {
  const duration = row.duration_ms === null ? null : Number(row.duration_ms);
  return {
    connectorId: row.connector_id,
    toolName: row.tool_name,
    outcome: row.outcome,
    durationMs: duration === null || Number.isNaN(duration) ? null : duration,
    occurredAt: toIso(row.occurred_at),
  };
}

export async function readConnectorCallLog(
  db: DatabaseAdapter,
  userId: string,
  options: { connectorId?: string | null; limit?: number } = {},
): Promise<ConnectorCallEntry[]> {
  const limit = Math.min(
    Math.max(1, Math.trunc(options.limit ?? MAX_LOG_ENTRIES)),
    MAX_LOG_ENTRIES,
  );
  const connectorId = options.connectorId?.trim() || null;
  try {
    const rows = await db.query<CallRow>(
      `select connector_id, tool_name, outcome, duration_ms, occurred_at
         from public.connector_call_events
        where user_id = $1
          and ($2::text is null or connector_id = $2::text)
        order by occurred_at desc
        limit ${limit}`,
      [userId, connectorId],
    );
    return rows.map(toEntry);
  } catch (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
}

/**
 * The verdict is computed here rather than in SQL so the rule stays one
 * readable thing that a test can drive with rows instead of a database: a
 * connector is down when its most recent calls, ignoring the ones this platform
 * blocked before they left, are all failures and the newest of them is inside
 * the recency window.
 */
export function connectorsNotResponding(
  entries: readonly ConnectorCallEntry[],
  nowMs: number = Date.now(),
): Set<string> {
  const byConnector = new Map<string, ConnectorCallEntry[]>();
  for (const entry of entries) {
    if (entry.outcome === 'blocked') continue;
    const bucket = byConnector.get(entry.connectorId);
    if (bucket) bucket.push(entry);
    else byConnector.set(entry.connectorId, [entry]);
  }

  const down = new Set<string>();
  for (const [connectorId, calls] of byConnector) {
    const recent = [...calls].sort(
      (left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt),
    );
    const newest = recent[0];
    if (!newest) continue;
    if (nowMs - Date.parse(newest.occurredAt) > CONNECTOR_FAILURE_RECENCY_MS) continue;
    const streak = recent.slice(0, CONNECTOR_FAILURE_STREAK_THRESHOLD);
    if (streak.length < CONNECTOR_FAILURE_STREAK_THRESHOLD) continue;
    if (streak.every((call) => call.outcome === 'failed')) down.add(connectorId);
  }
  return down;
}

export async function readConnectorsNotResponding(
  db: DatabaseAdapter,
  userId: string,
  nowMs: number = Date.now(),
): Promise<Set<string>> {
  const since = new Date(nowMs - CONNECTOR_FAILURE_RECENCY_MS).toISOString();
  try {
    const rows = await db.query<CallRow>(
      `select connector_id, tool_name, outcome, duration_ms, occurred_at
         from public.connector_call_events
        where user_id = $1
          and occurred_at >= $2::timestamptz
        order by occurred_at desc
        limit ${MAX_LOG_ENTRIES * 5}`,
      [userId, since],
    );
    return connectorsNotResponding(rows.map(toEntry), nowMs);
  } catch (error) {
    if (isMissingRelation(error)) return new Set();
    throw error;
  }
}
