import { Pool, type QueryResult } from '@neondatabase/serverless';
import {
  DB_CONNECTION_TIMEOUT_MS,
  DB_PROBE_TIMEOUT_MS,
  DB_QUERY_TIMEOUT_MS,
  DB_STATEMENT_TIMEOUT_MS,
} from './constants.js';
import { queryWithStatementTimeout } from './db-query.js';
import { withinDeadline } from './deadline.js';
import { logger } from './logger.js';
import { pairCredentialKey, type PairCredential, type PairTokenRole } from './pair-token.js';
import { pairingDeviceKey } from './pairing-device.js';

export type SignalingDatabasePool = Pool;
export type SignalingDatabaseQueryResult = QueryResult;

interface DbError {
  code?: string;
  message: string;
}

interface QueryResultWrapper<T> {
  data: T | null;
  error: DbError | null;
}

export interface SignalingSession {
  code: string;
  created_at: number;
  expires_at: number;
  metadata: Record<string, unknown> | null;
}

type RawDbError = { code?: string; message?: string };

const databaseUrl = process.env['NEON_DATABASE_URL'] ?? process.env['DATABASE_URL'];

if (!databaseUrl) {
  throw new Error(
    'SIGNALING service requires NEON_DATABASE_URL (or DATABASE_URL) for pairing persistence.',
  );
}

const IDLE_TIMEOUT_MS = 5_000;

const reportedTransportErrors = new WeakSet<object>();

function reportTransportError(error: unknown): void {
  if (typeof error === 'object' && error !== null) {
    if (reportedTransportErrors.has(error)) return;
    reportedTransportErrors.add(error);
  }
  logger.error({ error }, 'Neon connection transport error');
}

function guardTransportErrors(candidate: Pool): Pool {
  candidate.on('error', reportTransportError);
  return candidate;
}

const pool = guardTransportErrors(
  new Pool({
    connectionString: databaseUrl,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS,
    query_timeout: DB_QUERY_TIMEOUT_MS,
  }),
);

function normalizeTimestamp(value: string | number | null): number {
  if (value === null) {
    return Number.NaN;
  }
  return typeof value === 'number' ? value : Number.parseInt(value, 10);
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function toRow(raw: Record<string, unknown>): SignalingSession {
  return {
    code: String(raw['code']),
    created_at: normalizeTimestamp(raw['created_at'] as string | number | null),
    expires_at: normalizeTimestamp(raw['expires_at'] as string | number | null),
    metadata: normalizeMetadata(raw['metadata']),
  };
}

function toDbError(error: unknown): DbError {
  const maybe = error as RawDbError;
  return {
    code: maybe?.code,
    message: maybe?.message ?? 'Unknown Neon query error',
  };
}

async function queryOne<T>(sql: string, params: unknown[] = []): Promise<QueryResultWrapper<T>> {
  try {
    const result = await queryWithStatementTimeout(
      pool,
      sql,
      params,
      DB_STATEMENT_TIMEOUT_MS,
      reportTransportError,
    );
    const row = result.rows?.[0] as T | undefined;
    return { data: (row as T) ?? null, error: null };
  } catch (error) {
    return { data: null, error: toDbError(error) };
  }
}

async function queryRows<T>(sql: string, params: unknown[] = []): Promise<QueryResultWrapper<T[]>> {
  try {
    const result = await queryWithStatementTimeout(
      pool,
      sql,
      params,
      DB_STATEMENT_TIMEOUT_MS,
      reportTransportError,
    );
    return { data: (result.rows ?? []) as T[], error: null };
  } catch (error) {
    return { data: null, error: toDbError(error) };
  }
}

async function queryNoReturn(
  sql: string,
  params: unknown[] = [],
): Promise<{ error: DbError | null }> {
  try {
    await queryWithStatementTimeout(
      pool,
      sql,
      params,
      DB_STATEMENT_TIMEOUT_MS,
      reportTransportError,
    );
    return { error: null };
  } catch (error) {
    return { error: toDbError(error) };
  }
}

export async function getSessionByCode(
  code: string,
): Promise<QueryResultWrapper<SignalingSession>> {
  const sql =
    'SELECT code, created_at, expires_at, metadata FROM signaling_sessions WHERE code = $1 LIMIT 1';
  const { data, error } = await queryOne<Record<string, unknown>>(sql, [code]);
  if (error || !data) {
    return { data: null, error };
  }
  return { data: toRow(data), error: null };
}

export async function deleteSessionByCode(code: string): Promise<{ error: DbError | null }> {
  return queryNoReturn('DELETE FROM signaling_sessions WHERE code = $1', [code]);
}

export async function rotatePairCredential(
  session: Pick<SignalingSession, 'code' | 'created_at'>,
  role: PairTokenRole,
  accountId: string,
  previous: PairCredential | null,
  replacement: PairCredential,
  registeredDeviceId: string | null,
): Promise<QueryResultWrapper<{ metadata: Record<string, unknown> }>> {
  const sql =
    "UPDATE signaling_sessions SET metadata = jsonb_set(CASE WHEN $8::text IS NULL THEN coalesce(metadata, '{}'::jsonb) ELSE jsonb_set(coalesce(metadata, '{}'::jsonb), ARRAY[$7::text], to_jsonb($8::text), true) END, ARRAY[$4::text], $6::jsonb, true) WHERE code = $1 AND created_at = $2 AND expires_at > $9 AND metadata ->> 'userId' = $3 AND metadata -> $4::text IS NOT DISTINCT FROM $5::jsonb AND (metadata ->> $7::text IS NULL OR metadata ->> $7::text = $8::text) RETURNING metadata";
  return queryOne(sql, [
    session.code,
    session.created_at,
    accountId,
    pairCredentialKey(role),
    previous === null ? null : JSON.stringify(previous),
    JSON.stringify(replacement),
    pairingDeviceKey(role),
    registeredDeviceId,
    Date.now(),
  ]);
}

export async function deleteSessionsForDevice(
  deviceId: string,
): Promise<QueryResultWrapper<string[]>> {
  const sql =
    'DELETE FROM signaling_sessions WHERE metadata ->> $2::text = $1::text OR metadata ->> $3::text = $1::text RETURNING code';
  const { data, error } = await queryRows<{ code: string }>(sql, [
    deviceId,
    pairingDeviceKey('desktop'),
    pairingDeviceKey('mobile'),
  ]);
  if (error || !data) return { data: null, error };
  return { data: data.map((row) => String(row.code)), error: null };
}

export async function listStoredSessionCodes(
  codes: readonly string[],
): Promise<QueryResultWrapper<string[]>> {
  const { data, error } = await queryRows<{ code: string }>(
    'SELECT code FROM signaling_sessions WHERE code = ANY($1::text[])',
    [codes],
  );
  if (error || !data) return { data: null, error };
  return { data: data.map((row) => String(row.code)), error: null };
}

export async function extendSessionExpiry(
  code: string,
  expiresAt: number,
): Promise<{ error: DbError | null }> {
  const sql = 'UPDATE signaling_sessions SET expires_at = $2 WHERE code = $1 AND expires_at < $2';
  return queryNoReturn(sql, [code, expiresAt]);
}

export async function insertSession(
  code: string,
  createdAt: number,
  expiresAt: number,
  metadata: Record<string, unknown>,
): Promise<{ error: DbError | null }> {
  const insertSql =
    'INSERT INTO signaling_sessions (code, created_at, expires_at, metadata) VALUES ($1, $2, $3, $4)';
  return queryNoReturn(insertSql, [code, createdAt, expiresAt, metadata]);
}

export type DatabaseProbe = { ok: true; latencyMs: number } | { ok: false; reason: string };

const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/;

export async function probeDatabase(
  timeoutMs: number = DB_PROBE_TIMEOUT_MS,
): Promise<DatabaseProbe> {
  const startedAt = Date.now();
  const outcome = await withinDeadline(
    queryNoReturn('SELECT 1 FROM signaling_sessions LIMIT 1'),
    timeoutMs,
  );
  if (outcome.kind === 'timeout') return { ok: false, reason: 'timeout' };
  if (outcome.kind === 'failed') return { ok: false, reason: 'unreachable' };
  const { error } = outcome.value;
  if (error) {
    return {
      ok: false,
      reason: error.code && SQLSTATE_PATTERN.test(error.code) ? error.code : 'unreachable',
    };
  }
  return { ok: true, latencyMs: Date.now() - startedAt };
}
