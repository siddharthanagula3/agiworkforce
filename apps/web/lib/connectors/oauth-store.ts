/**
 * @file Persistence for the connector OAuth broker (migration 0097).
 *
 * Two stores, both server-only:
 *   - `connector_oauth_authorizations` — the in-flight leg. Holds the PKCE
 *     verifier (encrypted, server-side, never a cookie) and the SHA-256 of the
 *     state. Consumption is a conditional UPDATE, so a replayed callback loses
 *     the race and is rejected rather than exchanging the code twice.
 *   - `connector_oauth_grants` — the settled leg. Holds the user's encrypted
 *     access/refresh tokens, the scopes the provider actually granted, expiry,
 *     and revocation.
 *
 * WHY THE PRIVILEGED CONNECTION. Both tables carry RLS policies (0097) shaped
 * exactly like `user_custom_connectors` (0052) and
 * `connector_tool_permissions` (0069). Reads here still run through
 * `getNeonDb()` because the chat tool loop must decrypt a token outside any
 * request that carries a Clerk session (cloud-agent workflows included) — the
 * same regime every other credentialed connector read already uses. The tenant
 * boundary on this path is therefore the bound `user_id` predicate on every
 * statement, with the RLS policy as the database-level backstop for callers
 * that do come in user-scoped.
 *
 * WHY custom-connector-crypto FOR REFRESH TOKENS. `encryptConnectorToken` is
 * AES-256-GCM with a random 96-bit IV per value and an authentication tag,
 * keyed by `CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY` and fail-closed in
 * production. Nothing about it is specific to bearer headers, and both secrets
 * live in the same trust domain (a user's connector credentials), so reusing it
 * keeps one key to rotate rather than two. Refresh tokens are long-lived, so
 * the production fail-closed guard in that module is what makes the reuse safe:
 * a per-process random key would render every stored grant permanently
 * unreadable after a redeploy.
 */

import 'server-only';

import { getNeonDb } from '@/lib/server/neon-db';
import { logger } from '@/lib/logger';
import { decryptConnectorToken, encryptConnectorToken } from '@/lib/custom-connector-crypto';
import { hashOAuthState } from '@/lib/connectors/pkce';

const PG_UNDEFINED_TABLE = '42P01';

function isUndefinedTable(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    ((error as Record<string, unknown>)['code'] === PG_UNDEFINED_TABLE ||
      String((error as Record<string, unknown>)['message'] ?? '').includes('does not exist'))
  );
}

/**
 * Raised when the broker tables are not present in this deployment. The routes
 * translate it into an honest "not available in this environment" response
 * instead of pretending a flow started.
 */
export class ConnectorOAuthStoreUnavailableError extends Error {
  constructor() {
    super('Connector OAuth storage is not available in this environment');
    this.name = 'ConnectorOAuthStoreUnavailableError';
  }
}

/** In-flight authorization lifetime. Matches the GitHub install-state window. */
export const PENDING_AUTHORIZATION_TTL_SECONDS = 600;

// ─── In-flight authorizations ───────────────────────────────────────────────

export interface PendingAuthorizationInput {
  userId: string;
  connectorId: string;
  /** Raw state — hashed here, never stored or logged in the clear. */
  state: string;
  codeVerifier: string;
  codeChallengeMethod: 'S256' | 'plain';
  redirectUri: string;
  requestedScopes: string[];
  returnPath: string;
}

export interface PendingAuthorization {
  userId: string;
  connectorId: string;
  codeVerifier: string;
  redirectUri: string;
  requestedScopes: string[];
  returnPath: string;
}

export async function createPendingAuthorization(input: PendingAuthorizationInput): Promise<void> {
  const db = getNeonDb();
  const expiresAt = new Date(Date.now() + PENDING_AUTHORIZATION_TTL_SECONDS * 1000).toISOString();
  try {
    // Opportunistic sweep: a started-but-abandoned flow leaves a row holding an
    // encrypted verifier, and nothing else ever deletes it.
    await db.execute(
      `delete from public.connector_oauth_authorizations
        where user_id = $1
          and (expires_at < now() or consumed_at is not null or connector_id = $2)`,
      [input.userId, input.connectorId],
    );
    await db.execute(
      `insert into public.connector_oauth_authorizations (
         user_id, connector_id, state_hash, code_verifier_enc, code_challenge_method,
         redirect_uri, requested_scopes, return_path, expires_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        input.userId,
        input.connectorId,
        hashOAuthState(input.state),
        encryptConnectorToken(input.codeVerifier),
        input.codeChallengeMethod,
        input.redirectUri,
        input.requestedScopes,
        input.returnPath,
        expiresAt,
      ],
    );
  } catch (error) {
    if (isUndefinedTable(error)) throw new ConnectorOAuthStoreUnavailableError();
    throw error;
  }
}

interface PendingAuthorizationRow {
  user_id: string;
  connector_id: string;
  code_verifier_enc: string;
  redirect_uri: string;
  requested_scopes: string[] | null;
  return_path: string;
}

/**
 * Atomically claim a pending authorization by its state.
 *
 * The `consumed_at is null and expires_at > now()` predicate lives in the
 * UPDATE, so single-use is enforced by the database rather than by a
 * read-then-write window two concurrent callbacks could both pass.
 *
 * Returns null for an unknown, already-used, or expired state — the caller
 * must not distinguish those to the browser.
 */
export async function consumePendingAuthorization(
  state: string,
): Promise<PendingAuthorization | null> {
  const db = getNeonDb();
  let rows: PendingAuthorizationRow[];
  try {
    rows = await db.query<PendingAuthorizationRow>(
      `update public.connector_oauth_authorizations
          set consumed_at = now()
        where state_hash = $1
          and consumed_at is null
          and expires_at > now()
        returning user_id, connector_id, code_verifier_enc, redirect_uri,
                  requested_scopes, return_path`,
      [hashOAuthState(state)],
    );
  } catch (error) {
    if (isUndefinedTable(error)) throw new ConnectorOAuthStoreUnavailableError();
    throw error;
  }

  const row = rows[0];
  if (!row) return null;

  let codeVerifier: string;
  try {
    codeVerifier = decryptConnectorToken(row.code_verifier_enc);
  } catch (error) {
    // The row is already consumed at this point, so the flow cannot be
    // resumed — the user must start over. Fail closed rather than attempting a
    // non-PKCE exchange, which would silently drop the binding.
    logger.warn(
      { connectorId: row.connector_id, error: error instanceof Error ? error.message : 'unknown' },
      '[connector-oauth] stored PKCE verifier could not be decrypted — refusing the exchange',
    );
    return null;
  }

  return {
    userId: row.user_id,
    connectorId: row.connector_id,
    codeVerifier,
    redirectUri: row.redirect_uri,
    requestedScopes: row.requested_scopes ?? [],
    returnPath: row.return_path,
  };
}

// ─── Settled grants ─────────────────────────────────────────────────────────

export interface StoredGrantTokens {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  grantedScopes: string[];
  /** Absolute expiry, or null when the provider issued no `expires_in`. */
  accessTokenExpiresAt: Date | null;
  tokenEndpoint: string;
}

export async function upsertConnectorOAuthGrant(
  userId: string,
  connectorId: string,
  tokens: StoredGrantTokens,
): Promise<void> {
  const db = getNeonDb();
  try {
    await db.execute(
      `insert into public.connector_oauth_grants (
         user_id, connector_id, access_token_enc, refresh_token_enc, token_type,
         granted_scopes, access_token_expires_at, token_endpoint,
         connected_at, revoked_at, updated_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, now(), null, now())
       on conflict (user_id, connector_id) do update set
         access_token_enc = excluded.access_token_enc,
         refresh_token_enc = excluded.refresh_token_enc,
         token_type = excluded.token_type,
         granted_scopes = excluded.granted_scopes,
         access_token_expires_at = excluded.access_token_expires_at,
         token_endpoint = excluded.token_endpoint,
         connected_at = now(),
         revoked_at = null,
         updated_at = now()`,
      [
        userId,
        connectorId,
        encryptConnectorToken(tokens.accessToken),
        tokens.refreshToken ? encryptConnectorToken(tokens.refreshToken) : null,
        tokens.tokenType,
        tokens.grantedScopes,
        tokens.accessTokenExpiresAt?.toISOString() ?? null,
        tokens.tokenEndpoint,
      ],
    );
  } catch (error) {
    if (isUndefinedTable(error)) throw new ConnectorOAuthStoreUnavailableError();
    throw error;
  }
}

/** Persist the result of a refresh without touching connected_at. */
export async function updateConnectorOAuthGrantTokens(
  userId: string,
  connectorId: string,
  tokens: Omit<StoredGrantTokens, 'tokenEndpoint'>,
): Promise<void> {
  const db = getNeonDb();
  try {
    await db.execute(
      `update public.connector_oauth_grants
          set access_token_enc = $3,
              refresh_token_enc = coalesce($4, refresh_token_enc),
              token_type = $5,
              granted_scopes = $6,
              access_token_expires_at = $7,
              refreshed_at = now(),
              updated_at = now()
        where user_id = $1 and connector_id = $2 and revoked_at is null`,
      [
        userId,
        connectorId,
        encryptConnectorToken(tokens.accessToken),
        tokens.refreshToken ? encryptConnectorToken(tokens.refreshToken) : null,
        tokens.tokenType,
        tokens.grantedScopes,
        tokens.accessTokenExpiresAt?.toISOString() ?? null,
      ],
    );
  } catch (error) {
    if (isUndefinedTable(error)) throw new ConnectorOAuthStoreUnavailableError();
    throw error;
  }
}

export interface ConnectorOAuthGrant {
  connectorId: string;
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  grantedScopes: string[];
  accessTokenExpiresAt: Date | null;
  tokenEndpoint: string;
  connectedAt: string;
  updatedAt: string;
}

interface GrantRow {
  connector_id: string;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  token_type: string;
  granted_scopes: string[] | null;
  access_token_expires_at: string | null;
  token_endpoint: string;
  connected_at: string;
  updated_at: string;
}

/**
 * Raised when a stored grant exists but its ciphertext cannot be decrypted.
 * Distinct from "no grant" so the caller tells the user to reconnect rather
 * than silently treating an encrypted-but-unreadable credential as absent.
 */
export class ConnectorGrantDecryptionError extends Error {
  constructor() {
    super('Stored authorization for this connector could not be decrypted');
    this.name = 'ConnectorGrantDecryptionError';
  }
}

export async function getConnectorOAuthGrant(
  userId: string,
  connectorId: string,
): Promise<ConnectorOAuthGrant | null> {
  const db = getNeonDb();
  let rows: GrantRow[];
  try {
    rows = await db.query<GrantRow>(
      `select connector_id, access_token_enc, refresh_token_enc, token_type,
              granted_scopes, access_token_expires_at, token_endpoint,
              connected_at, updated_at
         from public.connector_oauth_grants
        where user_id = $1 and connector_id = $2 and revoked_at is null`,
      [userId, connectorId],
    );
  } catch (error) {
    if (isUndefinedTable(error)) return null;
    throw error;
  }

  const row = rows[0];
  if (!row?.access_token_enc) return null;
  return decodeGrantRow(row);
}

function decodeGrantRow(row: GrantRow): ConnectorOAuthGrant {
  try {
    return {
      connectorId: row.connector_id,
      accessToken: decryptConnectorToken(row.access_token_enc as string),
      refreshToken: row.refresh_token_enc ? decryptConnectorToken(row.refresh_token_enc) : null,
      tokenType: row.token_type,
      grantedScopes: row.granted_scopes ?? [],
      accessTokenExpiresAt: row.access_token_expires_at
        ? new Date(row.access_token_expires_at)
        : null,
      tokenEndpoint: row.token_endpoint,
      connectedAt: row.connected_at,
      updatedAt: row.updated_at,
    };
  } catch {
    throw new ConnectorGrantDecryptionError();
  }
}

/** Auth-material-free view for API responses. Never returns a token. */
export interface ConnectorOAuthGrantSummary {
  connectorId: string;
  grantedScopes: string[];
  connectedAt: string;
  updatedAt: string;
  /** True when the access token is past its expiry and no refresh token exists. */
  needsReauthorization: boolean;
}

export async function getUserConnectorOAuthGrantSummaries(
  userId: string,
): Promise<ConnectorOAuthGrantSummary[]> {
  const db = getNeonDb();
  try {
    const rows = await db.query<{
      connector_id: string;
      granted_scopes: string[] | null;
      access_token_expires_at: string | null;
      refresh_token_enc: string | null;
      connected_at: string;
      updated_at: string;
    }>(
      `select connector_id, granted_scopes, access_token_expires_at,
              refresh_token_enc, connected_at, updated_at
         from public.connector_oauth_grants
        where user_id = $1 and revoked_at is null
        order by connected_at desc`,
      [userId],
    );
    const now = Date.now();
    return rows.map((row) => ({
      connectorId: row.connector_id,
      grantedScopes: row.granted_scopes ?? [],
      connectedAt: row.connected_at,
      updatedAt: row.updated_at,
      needsReauthorization:
        !row.refresh_token_enc &&
        row.access_token_expires_at !== null &&
        new Date(row.access_token_expires_at).getTime() <= now,
    }));
  } catch (error) {
    if (isUndefinedTable(error)) return [];
    throw error;
  }
}

/**
 * Revoke a grant locally: flag it AND drop both ciphertext columns in the same
 * statement (0097 constrains the pair, so a revoked row physically cannot hand
 * a token back). Returns true when a live grant was actually revoked.
 *
 * Provider-side revocation is attempted separately by the caller when the
 * registry declares a revocation endpoint; local revocation must succeed
 * regardless, so a provider outage can never leave a user unable to disconnect.
 */
export async function revokeConnectorOAuthGrant(
  userId: string,
  connectorId: string,
): Promise<boolean> {
  const db = getNeonDb();
  try {
    const rows = await db.query<{ connector_id: string }>(
      `update public.connector_oauth_grants
          set revoked_at = now(),
              access_token_enc = null,
              refresh_token_enc = null,
              updated_at = now()
        where user_id = $1 and connector_id = $2 and revoked_at is null
        returning connector_id`,
      [userId, connectorId],
    );
    return rows.length > 0;
  } catch (error) {
    if (isUndefinedTable(error)) return false;
    throw error;
  }
}
