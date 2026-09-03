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

export class ConnectorOAuthStoreUnavailableError extends Error {
  constructor() {
    super('Connector OAuth storage is not available in this environment');
    this.name = 'ConnectorOAuthStoreUnavailableError';
  }
}

export const PENDING_AUTHORIZATION_TTL_SECONDS = 600;

export interface DiscoveredAuthorizationFacts {
  issuer?: string | null;
  authorizationEndpoint?: string | null;
  tokenEndpoint?: string | null;
  resourceUrl?: string | null;
  mcpUrl?: string | null;
  clientId?: string | null;
  discoveryState?: unknown;
}

export interface PendingAuthorizationInput extends DiscoveredAuthorizationFacts {
  userId: string;
  connectorId: string;
  state: string;
  codeVerifier: string;
  codeChallengeMethod: 'S256' | 'plain';
  redirectUri: string;
  requestedScopes: string[];
  returnPath: string;
}

export interface PendingAuthorization extends DiscoveredAuthorizationFacts {
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
    await db.execute(
      `delete from public.connector_oauth_authorizations
        where user_id = $1
          and (expires_at < now() or consumed_at is not null or connector_id = $2)`,
      [input.userId, input.connectorId],
    );
    await db.execute(
      `insert into public.connector_oauth_authorizations (
         user_id, connector_id, state_hash, code_verifier_enc, code_challenge_method,
         redirect_uri, requested_scopes, return_path, expires_at,
         issuer, authorization_endpoint, token_endpoint, resource_url, mcp_url, client_id,
         discovery_state
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        input.userId,
        input.connectorId,
        hashOAuthState(input.state),
        encryptConnectorToken(input.codeVerifier, 'oauth-code-verifier'),
        input.codeChallengeMethod,
        input.redirectUri,
        input.requestedScopes,
        input.returnPath,
        expiresAt,
        input.issuer ?? null,
        input.authorizationEndpoint ?? null,
        input.tokenEndpoint ?? null,
        input.resourceUrl ?? null,
        input.mcpUrl ?? null,
        input.clientId ?? null,
        input.discoveryState === undefined ? null : JSON.stringify(input.discoveryState),
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
  issuer: string | null;
  authorization_endpoint: string | null;
  token_endpoint: string | null;
  resource_url: string | null;
  mcp_url: string | null;
  client_id: string | null;
  discovery_state: unknown;
}

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
                  requested_scopes, return_path, issuer, authorization_endpoint,
                  token_endpoint, resource_url, mcp_url, client_id, discovery_state`,
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
    codeVerifier = decryptConnectorToken(row.code_verifier_enc, 'oauth-code-verifier');
  } catch (error) {
    logger.warn(
      { connectorId: row.connector_id, error: error instanceof Error ? error.message : 'unknown' },
      '[connector-oauth] stored PKCE verifier could not be decrypted, refusing the exchange',
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
    issuer: row.issuer,
    authorizationEndpoint: row.authorization_endpoint,
    tokenEndpoint: row.token_endpoint,
    resourceUrl: row.resource_url,
    mcpUrl: row.mcp_url,
    clientId: row.client_id,
    discoveryState:
      typeof row.discovery_state === 'string'
        ? (JSON.parse(row.discovery_state) as unknown)
        : row.discovery_state,
  };
}

export interface StoredGrantTokens {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  grantedScopes: string[];
  accessTokenExpiresAt: Date | null;
  tokenEndpoint: string;
  issuer?: string | null;
  resourceUrl?: string | null;
  mcpUrl?: string | null;
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
         issuer, resource_url, mcp_url,
         connected_at, revoked_at, updated_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), null, now())
       on conflict (user_id, connector_id) do update set
         access_token_enc = excluded.access_token_enc,
         refresh_token_enc = excluded.refresh_token_enc,
         token_type = excluded.token_type,
         granted_scopes = excluded.granted_scopes,
         access_token_expires_at = excluded.access_token_expires_at,
         token_endpoint = excluded.token_endpoint,
         issuer = excluded.issuer,
         resource_url = excluded.resource_url,
         mcp_url = excluded.mcp_url,
         connected_at = now(),
         revoked_at = null,
         updated_at = now()`,
      [
        userId,
        connectorId,
        encryptConnectorToken(tokens.accessToken, 'oauth-access-token'),
        tokens.refreshToken
          ? encryptConnectorToken(tokens.refreshToken, 'oauth-refresh-token')
          : null,
        tokens.tokenType,
        tokens.grantedScopes,
        tokens.accessTokenExpiresAt?.toISOString() ?? null,
        tokens.tokenEndpoint,
        tokens.issuer ?? null,
        tokens.resourceUrl ?? null,
        tokens.mcpUrl ?? null,
      ],
    );
  } catch (error) {
    if (isUndefinedTable(error)) throw new ConnectorOAuthStoreUnavailableError();
    throw error;
  }
}

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
        encryptConnectorToken(tokens.accessToken, 'oauth-access-token'),
        tokens.refreshToken
          ? encryptConnectorToken(tokens.refreshToken, 'oauth-refresh-token')
          : null,
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
  issuer: string | null;
  resourceUrl: string | null;
  mcpUrl: string | null;
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
  issuer: string | null;
  resource_url: string | null;
  mcp_url: string | null;
  connected_at: string;
  updated_at: string;
}

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
              issuer, resource_url, mcp_url,
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
      accessToken: decryptConnectorToken(row.access_token_enc as string, 'oauth-access-token'),
      refreshToken: row.refresh_token_enc
        ? decryptConnectorToken(row.refresh_token_enc, 'oauth-refresh-token')
        : null,
      tokenType: row.token_type,
      grantedScopes: row.granted_scopes ?? [],
      accessTokenExpiresAt: row.access_token_expires_at
        ? new Date(row.access_token_expires_at)
        : null,
      tokenEndpoint: row.token_endpoint,
      issuer: row.issuer,
      resourceUrl: row.resource_url,
      mcpUrl: row.mcp_url,
      connectedAt: row.connected_at,
      updatedAt: row.updated_at,
    };
  } catch {
    throw new ConnectorGrantDecryptionError();
  }
}

export interface ConnectorOAuthGrantSummary {
  connectorId: string;
  grantedScopes: string[];
  connectedAt: string;
  updatedAt: string;
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
