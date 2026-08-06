import 'server-only';

import { randomBytes, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import type { ScimTokenRow } from '@/lib/server/neon-types';

/**
 * SCIM bearer token lifecycle.
 *
 * A SCIM token is a long-lived machine credential handed to an identity
 * provider, so it is treated exactly like `api_keys`: generated with a CSPRNG,
 * stored only as an Argon2id hash, resolvable in one indexed lookup via an
 * embedded public prefix, revocable, and never logged.
 *
 * Format: `scim_<prefix16hex>_<secret48hex>`
 *   prefix — 8 random bytes, stored in `scim_tokens.token_prefix`, used purely
 *            as a lookup key so verification runs exactly one Argon2 pass
 *            instead of scanning every active token.
 *   secret — 24 random bytes (192 bits). Never persisted in any form.
 *
 * Both segments are hex, so the whole token matches `[a-z0-9_]` and cannot be
 * mangled by an IdP that trims or re-encodes header values.
 */

// OWASP-recommended Argon2id parameters, identical to lib/services/api-key-service.ts.
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

export const SCIM_TOKEN_PREFIX = 'scim_';

/** `scim_<16 hex>_<48 hex>` and nothing else. */
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

/**
 * Extract the lookup prefix from a presented token WITHOUT touching the
 * database. A token that does not match the format is rejected here, so a
 * malformed header costs no query and no Argon2 work.
 */
export function parseScimTokenPrefix(rawToken: string): string | null {
  const match = SCIM_TOKEN_PATTERN.exec(rawToken);
  return match?.[1] ?? null;
}

/**
 * Constant-time comparison of the presented prefix against the stored one.
 *
 * Argon2 verification is already timing-safe, but the prefix is compared
 * separately (it is the indexed lookup key) and a `===` there would leak the
 * prefix byte-by-byte to an attacker who can measure it.
 */
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

/**
 * Verify a presented bearer token.
 *
 * SERVICE CONTEXT: a SCIM request carries no app user, so this runs on the
 * service adapter and resolves the tenant FROM the credential. Every caller
 * must then carry the returned `connectionId`/`organizationId` as an explicit
 * predicate — RLS cannot help here.
 *
 * Returns `null` for every failure mode (unknown, revoked, expired, wrong
 * secret) so a caller cannot accidentally branch on why.
 */
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
    // A failed lookup must not authenticate. Log without the token.
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

  // Fire-and-forget last-used tracking: an admin needs to see whether their IdP
  // is actually calling, and a stale token is the first sign it is not.
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

/**
 * Mint a token for a connection. RETURNS THE RAW TOKEN EXACTLY ONCE — it is
 * not recoverable afterwards, by design.
 */
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

/** List tokens for an organization. The hash is never selected. */
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

/**
 * Revoke a token. Soft-delete (`revoked_at`) so the record of which credential
 * an IdP was using survives the revocation. Idempotent, and scoped by
 * organization so one tenant can never revoke another's credential.
 *
 * Returns false when nothing was revoked (unknown id, other tenant, or already
 * revoked) — the caller decides whether that is a 404.
 */
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
