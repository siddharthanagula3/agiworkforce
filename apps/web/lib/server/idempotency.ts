import 'server-only';

import { createHash } from 'node:crypto';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { createError } from '@/lib/errors';

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

const MIN_KEY_LENGTH = 8;
const MAX_KEY_LENGTH = 255;
const KEY_PATTERN = /^[A-Za-z0-9._:-]+$/;

export interface IdempotentWriteScope {
  organizationId: string;
  scope: string;
  actorId: string;
  key: string;
  requestBody: unknown;
}

export interface IdempotentReplay<T> {
  replayed: boolean;
  status: number;
  body: T;
}

interface IdempotencyRow {
  status: string;
  request_fingerprint: string;
  response_status: number | string | null;
  response_body: unknown;
}

export function readIdempotencyKey(request: Request): string | null {
  const raw = request.headers.get(IDEMPOTENCY_KEY_HEADER);
  if (raw === null) return null;
  const key = raw.trim();
  if (key.length < MIN_KEY_LENGTH || key.length > MAX_KEY_LENGTH || !KEY_PATTERN.test(key)) {
    throw createError
      .validation(
        `Idempotency-Key must be ${MIN_KEY_LENGTH} to ${MAX_KEY_LENGTH} characters of letters, digits, dot, underscore, colon or hyphen.`,
      )
      .asUserSafe();
  }
  return key;
}

export function fingerprintRequestBody(body: unknown): string {
  return createHash('sha256').update(stableStringify(body), 'utf8').digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, item]) => `${JSON.stringify(k)}:${stableStringify(item)}`).join(',')}}`;
}

function toStatus(value: number | string | null): number {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : 200;
}

/**
 * Runs `write` at most once per (workspace, scope, Idempotency-Key). A repeat of
 * a completed call replays the stored response; a repeat with a different body,
 * or one that arrives while the first is still running, is a conflict.
 */
export async function withIdempotentWrite<T>(
  db: DatabaseAdapter,
  scope: IdempotentWriteScope,
  write: () => Promise<IdempotentReplay<T>>,
): Promise<IdempotentReplay<T>> {
  const fingerprint = fingerprintRequestBody(scope.requestBody);
  const claimed = await db.query<{ organization_id: string }>(
    `insert into public.admin_request_idempotency
       (organization_id, scope, idempotency_key, request_fingerprint, actor_id)
     values ($1, $2, $3, $4, $5)
     on conflict (organization_id, scope, idempotency_key) do nothing
     returning organization_id`,
    [scope.organizationId, scope.scope, scope.key, fingerprint, scope.actorId],
  );

  if (claimed.length === 0) {
    return replayExisting<T>(db, scope, fingerprint);
  }

  try {
    const result = await write();
    await db.query(
      `update public.admin_request_idempotency
          set status = 'completed',
              response_status = $4,
              response_body = $5::jsonb,
              completed_at = now()
        where organization_id = $1 and scope = $2 and idempotency_key = $3`,
      [
        scope.organizationId,
        scope.scope,
        scope.key,
        result.status,
        JSON.stringify(result.body ?? null),
      ],
    );
    return result;
  } catch (error) {
    // A failed write leaves no record, so the caller may retry the same key with
    // the same body rather than being told it conflicts with its own failure.
    await db
      .query(
        `delete from public.admin_request_idempotency
          where organization_id = $1 and scope = $2 and idempotency_key = $3
            and status = 'in_progress'`,
        [scope.organizationId, scope.scope, scope.key],
      )
      .catch(() => undefined);
    throw error;
  }
}

async function replayExisting<T>(
  db: DatabaseAdapter,
  scope: IdempotentWriteScope,
  fingerprint: string,
): Promise<IdempotentReplay<T>> {
  const [row] = await db.query<IdempotencyRow>(
    `select status, request_fingerprint, response_status, response_body
       from public.admin_request_idempotency
      where organization_id = $1 and scope = $2 and idempotency_key = $3`,
    [scope.organizationId, scope.scope, scope.key],
  );
  if (!row) {
    throw createError
      .conflict('This Idempotency-Key is being used by another request. Retry in a moment.')
      .asUserSafe();
  }
  if (row.request_fingerprint !== fingerprint) {
    throw createError
      .conflict(
        'This Idempotency-Key was already used for a different request. Use a new key for a new change.',
      )
      .asUserSafe();
  }
  if (row.status !== 'completed') {
    throw createError
      .conflict('The first request with this Idempotency-Key is still running. Retry in a moment.')
      .asUserSafe();
  }
  return {
    replayed: true,
    status: toStatus(row.response_status),
    body: row.response_body as T,
  };
}
