import 'server-only';

import { randomBytes, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import type { ScimTokenRow } from '@/lib/server/neon-types';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

export const SCIM_TOKEN_PREFIX = 'scim_';

export const SCIM_TOKEN_PATTERN = /^scim_([0-9a-f]{16})_([0-9a-f]{48})$/;

export interface GeneratedScimToken {
  raw: string;
  prefix: string;
  hash: string;
}

export async function generateScimToken(): Promise<GeneratedScimToken> {
  const prefix = randomBytes(8).toString('hex');
  const secret = randomBytes(24).toString('hex');
  const raw = `${SCIM_TOKEN_PREFIX}${prefix}_${secret}`;
  const hash = await argon2.hash(raw, ARGON2_OPTIONS);
  return { raw, prefix, hash };
}

export function parseScimTokenPrefix(rawToken: string): string | null {
  const match = SCIM_TOKEN_PATTERN.exec(rawToken);
  return match?.[1] ?? null;
}

function prefixesMatch(presented: string, stored: string): boolean {
  const a = Buffer.from(presented, 'utf8');
  const b = Buffer.from(stored, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface VerifiedScimToken {
  tokenId: string;
  connectionId: string;
  organizationId: string;
  createdByUserId: string;
}

export async function verifyScimToken(
  db: DatabaseAdapter,
  rawToken: string,
): Promise<VerifiedScimToken | null> {
  const prefix = parseScimTokenPrefix(rawToken);
  if (!prefix) return null;

  let rows: ScimTokenRow[];
  try {
    rows = await db.query<ScimTokenRow>(
      `select id, connection_id, organization_id, name, token_prefix, token_hash,
              created_by_user_id, last_used_at, expires_at, revoked_at, created_at, updated_at
         from scim_tokens
        where token_prefix = $1
          and revoked_at is null
          and (expires_at is null or expires_at > now())
        limit 1`,
      [prefix],
    );
  } catch (error) {
    logger.error({ error }, 'SCIM token lookup failed');
    return null;
  }

  const row = rows[0];
  if (!row) return null;
  if (!prefixesMatch(prefix, row.token_prefix)) return null;

  let valid = false;
  try {
    valid = await argon2.verify(row.token_hash, rawToken);
  } catch (error) {
    logger.error({ error, tokenId: row.id }, 'SCIM token hash verification threw');
    return null;
  }
  if (!valid) return null;

  void db
    .execute('update scim_tokens set last_used_at = now() where id = $1', [row.id])
    .catch((error: unknown) => {
      logger.error({ error, tokenId: row.id }, 'Failed to record SCIM token usage');
    });

  return {
    tokenId: row.id,
    connectionId: row.connection_id,
    organizationId: row.organization_id,
    createdByUserId: row.created_by_user_id,
  };
}

export type ScimTokenSummary = Omit<ScimTokenRow, 'token_hash'>;

export async function createScimToken(
  db: DatabaseAdapter,
  input: {
    connectionId: string;
    organizationId: string;
    name: string;
    createdByUserId: string;
    expiresAt?: string | null;
  },
): Promise<{ token: ScimTokenSummary; rawToken: string }> {
  const { raw, prefix, hash } = await generateScimToken();

  const rows = await db.query<ScimTokenSummary>(
    `insert into scim_tokens
       (connection_id, organization_id, name, token_prefix, token_hash, created_by_user_id, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id, connection_id, organization_id, name, token_prefix, created_by_user_id,
               last_used_at, expires_at, revoked_at, created_at, updated_at`,
    [
      input.connectionId,
      input.organizationId,
      input.name,
      prefix,
      hash,
      input.createdByUserId,
      input.expiresAt ?? null,
    ],
  );

  const token = rows[0];
  if (!token) {
    throw new Error('Failed to create SCIM token: no row returned');
  }

  return { token, rawToken: raw };
}

export async function listScimTokens(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<ScimTokenSummary[]> {
  return db.query<ScimTokenSummary>(
    `select id, connection_id, organization_id, name, token_prefix, created_by_user_id,
            last_used_at, expires_at, revoked_at, created_at, updated_at
       from scim_tokens
      where organization_id = $1
      order by created_at desc`,
    [organizationId],
  );
}

export async function revokeScimToken(
  db: DatabaseAdapter,
  tokenId: string,
  organizationId: string,
): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
    `update scim_tokens
        set revoked_at = now()
      where id = $1
        and organization_id = $2
        and revoked_at is null
      returning id`,
    [tokenId, organizationId],
  );
  return rows.length > 0;
}
