import type { QueryResult } from '@neondatabase/serverless';
import { Pool } from '@neondatabase/serverless';
import { logger } from './logger.js';

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
  new Pool({ connectionString: databaseUrl, idleTimeoutMillis: IDLE_TIMEOUT_MS }),
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
    const result = (await pool.query(sql, params)) as QueryResult;
    const row = result.rows?.[0] as T | undefined;
    return { data: (row as T) ?? null, error: null };
  } catch (error) {
    return { data: null, error: toDbError(error) };
  }
}

async function queryNoReturn(
  sql: string,
  params: unknown[] = [],
): Promise<{ error: DbError | null }> {
  try {
    await pool.query(sql, params);
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

export async function getSessionExpiresAtByCode(
  code: string,
): Promise<QueryResultWrapper<{ expires_at: number }>> {
  const sql = 'SELECT expires_at FROM signaling_sessions WHERE code = $1 LIMIT 1';
  const { data, error } = await queryOne<{ expires_at: number | string }>(sql, [code]);
  if (error || !data) {
    return { data: null, error };
  }
  return {
    data: { expires_at: normalizeTimestamp(data.expires_at) },
    error: null,
  };
}

export async function deleteSessionByCode(code: string): Promise<{ error: DbError | null }> {
  return queryNoReturn('DELETE FROM signaling_sessions WHERE code = $1', [code]);
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
