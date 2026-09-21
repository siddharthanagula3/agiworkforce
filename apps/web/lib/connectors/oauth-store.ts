import 'server-only';

import { getNeonDb } from '@/lib/server/neon-db';
import { logger } from '@/lib/logger';
import { decryptConnectorToken, encryptConnectorToken } from '@/lib/custom-connector-crypto';
import { hashOAuthState } from '@/lib/connectors/pkce';
import {
  DEFAULT_CONNECTOR_ACCOUNT_KEY,
  normalizeConnectorAccountKey,
  type ConnectorAccount,
  type ConnectorAccountScope,
} from '@/lib/connectors/accounts';

const PG_UNDEFINED_TABLE = '42P01';
const PG_UNDEFINED_COLUMN = '42703';

function isUndefinedTable(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    ((error as Record<string, unknown>)['code'] === PG_UNDEFINED_TABLE ||
      String((error as Record<string, unknown>)['message'] ?? '').includes('does not exist'))
  );
}

function isUndefinedColumn(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    (error as Record<string, unknown>)['code'] === PG_UNDEFINED_COLUMN
  );
}

/**
 * 0253 adds the account columns. Until it is applied every grant is the single
 * default personal account, which is exactly what the pre-0253 statements mean,
 * so the first undefined-column error switches this process over for good
 * rather than failing the connector.
 */
let accountColumnsAvailable = true;

async function withAccountColumns<T>(run: (accountAware: boolean) => Promise<T>): Promise<T> {
  if (!accountColumnsAvailable) return run(false);
  try {
    return await run(true);
  } catch (error) {
    if (!isUndefinedColumn(error)) throw error;
    accountColumnsAvailable = false;
    return run(false);
  }
}

export function __resetConnectorAccountColumnProbeForTests(): void {
  accountColumnsAvailable = true;
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

export interface ConnectorAccountFacts {
  accountKey?: string | null;
  accountLabel?: string | null;
  accountScope?: ConnectorAccountScope | null;
}

export interface PendingAuthorizationInput
  extends DiscoveredAuthorizationFacts, ConnectorAccountFacts {
  userId: string;
  connectorId: string;
  state: string;
  codeVerifier: string;
  codeChallengeMethod: 'S256' | 'plain';
  redirectUri: string;
  requestedScopes: string[];
  returnPath: string;
}

export interface PendingAuthorization extends DiscoveredAuthorizationFacts, ConnectorAccountFacts {
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
    const values = [
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
    ];
    await withAccountColumns(async (accountAware) => {
      await db.execute(
        `insert into public.connector_oauth_authorizations (
           user_id, connector_id, state_hash, code_verifier_enc, code_challenge_method,
           redirect_uri, requested_scopes, return_path, expires_at,
           issuer, authorization_endpoint, token_endpoint, resource_url, mcp_url, client_id,
           discovery_state${accountAware ? ', account_key, account_label, account_scope' : ''}
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16${
           accountAware ? ', $17, $18, $19' : ''
         })`,
        accountAware
          ? [
              ...values,
              normalizeConnectorAccountKey(input.accountKey),
              input.accountLabel ?? null,
              input.accountScope ?? 'personal',
            ]
          : values,
      );
    });
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
  account_key: string | null;
  account_label: string | null;
  account_scope: ConnectorAccountScope | null;
}

/**
 * The connectors an authorization was started for and never finished: a row
 * that has not been consumed and has not expired. `createPendingAuthorization`
 * writes it, `consumePendingAuthorization` clears it, so an unconsumed row is
 * the whole of the evidence that someone walked away mid-flow.
 */
export async function listPendingConnectorIds(userId: string): Promise<string[]> {
  const db = getNeonDb();
  try {
    const rows = await db.query<{ connector_id: string }>(
      `select distinct connector_id
         from public.connector_oauth_authorizations
        where user_id = $1
          and consumed_at is null
          and expires_at > now()`,
      [userId],
    );
    return rows.map((row) => row.connector_id);
  } catch (error) {
    if (isUndefinedTable(error)) return [];
    throw error;
  }
}

export async function consumePendingAuthorization(
  state: string,
): Promise<PendingAuthorization | null> {
  const db = getNeonDb();
  let rows: PendingAuthorizationRow[];
  try {
    rows = await withAccountColumns((accountAware) =>
      db.query<PendingAuthorizationRow>(
        `update public.connector_oauth_authorizations
            set consumed_at = now()
          where state_hash = $1
            and consumed_at is null
            and expires_at > now()
          returning user_id, connector_id, code_verifier_enc, redirect_uri,
                    requested_scopes, return_path, issuer, authorization_endpoint,
                    token_endpoint, resource_url, mcp_url, client_id, discovery_state,
                    ${
                      accountAware
                        ? 'account_key, account_label, account_scope'
                        : `'${DEFAULT_CONNECTOR_ACCOUNT_KEY}' as account_key, ` +
                          `null as account_label, 'personal' as account_scope`
                    }`,
        [hashOAuthState(state)],
      ),
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
    accountKey: normalizeConnectorAccountKey(row.account_key),
    accountLabel: row.account_label ?? null,
    accountScope: row.account_scope ?? 'personal',
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

export interface ConnectorAccountIdentity {
  accountKey?: string | null;
  accountLabel?: string | null;
  accountScope?: ConnectorAccountScope | null;
  makeDefault?: boolean;
}

export async function upsertConnectorOAuthGrant(
  userId: string,
  connectorId: string,
  tokens: StoredGrantTokens,
  account: ConnectorAccountIdentity = {},
): Promise<void> {
  const db = getNeonDb();
  const accountKey = normalizeConnectorAccountKey(account.accountKey);
  const values = [
    userId,
    connectorId,
    encryptConnectorToken(tokens.accessToken, 'oauth-access-token'),
    tokens.refreshToken ? encryptConnectorToken(tokens.refreshToken, 'oauth-refresh-token') : null,
    tokens.tokenType,
    tokens.grantedScopes,
    tokens.accessTokenExpiresAt?.toISOString() ?? null,
    tokens.tokenEndpoint,
    tokens.issuer ?? null,
    tokens.resourceUrl ?? null,
    tokens.mcpUrl ?? null,
  ];
  try {
    await withAccountColumns(async (accountAware) => {
      if (!accountAware) {
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
          values,
        );
        return;
      }
      // A new account is the default only when nothing else holds that place,
      // so connecting a second mailbox never silently redirects existing calls.
      const isDefault = account.makeDefault === true;
      if (isDefault) {
        await db.execute(
          `update public.connector_oauth_grants
              set is_default = false, updated_at = now()
            where user_id = $1 and connector_id = $2 and account_key <> $3`,
          [userId, connectorId, accountKey],
        );
      }
      await db.execute(
        `insert into public.connector_oauth_grants (
           user_id, connector_id, access_token_enc, refresh_token_enc, token_type,
           granted_scopes, access_token_expires_at, token_endpoint,
           issuer, resource_url, mcp_url,
           account_key, account_label, account_scope, is_default,
           connected_at, revoked_at, updated_at
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                   $15 or not exists (
                     select 1 from public.connector_oauth_grants existing
                      where existing.user_id = $1
                        and existing.connector_id = $2
                        and existing.account_key <> $12
                        and existing.revoked_at is null
                        and existing.is_default
                   ),
                   now(), null, now())
         on conflict (user_id, connector_id, account_key) do update set
           access_token_enc = excluded.access_token_enc,
           refresh_token_enc = excluded.refresh_token_enc,
           token_type = excluded.token_type,
           granted_scopes = excluded.granted_scopes,
           access_token_expires_at = excluded.access_token_expires_at,
           token_endpoint = excluded.token_endpoint,
           issuer = excluded.issuer,
           resource_url = excluded.resource_url,
           mcp_url = excluded.mcp_url,
           account_label = coalesce(excluded.account_label, public.connector_oauth_grants.account_label),
           account_scope = excluded.account_scope,
           is_default = excluded.is_default or public.connector_oauth_grants.is_default,
           connected_at = now(),
           revoked_at = null,
           updated_at = now()`,
        [
          ...values,
          accountKey,
          account.accountLabel ?? null,
          account.accountScope ?? 'personal',
          isDefault,
        ],
      );
    });
  } catch (error) {
    if (isUndefinedTable(error)) throw new ConnectorOAuthStoreUnavailableError();
    throw error;
  }
}

export async function updateConnectorOAuthGrantTokens(
  userId: string,
  connectorId: string,
  tokens: Omit<StoredGrantTokens, 'tokenEndpoint'>,
  accountKey?: string | null,
): Promise<void> {
  const db = getNeonDb();
  const values = [
    userId,
    connectorId,
    encryptConnectorToken(tokens.accessToken, 'oauth-access-token'),
    tokens.refreshToken ? encryptConnectorToken(tokens.refreshToken, 'oauth-refresh-token') : null,
    tokens.tokenType,
    tokens.grantedScopes,
    tokens.accessTokenExpiresAt?.toISOString() ?? null,
  ];
  try {
    await withAccountColumns(async (accountAware) => {
      const scoped = accountAware && accountKey !== undefined && accountKey !== null;
      await db.execute(
        `update public.connector_oauth_grants
            set access_token_enc = $3,
                refresh_token_enc = coalesce($4, refresh_token_enc),
                token_type = $5,
                granted_scopes = $6,
                access_token_expires_at = $7,
                refreshed_at = now(),
                updated_at = now()
          where user_id = $1 and connector_id = $2 and revoked_at is null${
            scoped ? ' and account_key = $8' : ''
          }`,
        scoped ? [...values, normalizeConnectorAccountKey(accountKey)] : values,
      );
    });
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
  accountKey: string;
  accountLabel: string | null;
  accountScope: ConnectorAccountScope;
  isDefault: boolean;
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
  account_key: string | null;
  account_label: string | null;
  account_scope: ConnectorAccountScope | null;
  is_default: boolean | null;
}

const GRANT_ACCOUNT_COLUMNS = 'account_key, account_label, account_scope, is_default';
const GRANT_ACCOUNT_DEFAULTS =
  `'${DEFAULT_CONNECTOR_ACCOUNT_KEY}' as account_key, null as account_label, ` +
  `'personal' as account_scope, true as is_default`;

export class ConnectorGrantDecryptionError extends Error {
  constructor() {
    super('Stored authorization for this connector could not be decrypted');
    this.name = 'ConnectorGrantDecryptionError';
  }
}

export async function getConnectorOAuthGrant(
  userId: string,
  connectorId: string,
  accountKey?: string | null,
): Promise<ConnectorOAuthGrant | null> {
  const db = getNeonDb();
  let rows: GrantRow[];
  try {
    rows = await withAccountColumns((accountAware) => {
      const scoped = accountAware && accountKey !== undefined && accountKey !== null;
      return db.query<GrantRow>(
        `select connector_id, access_token_enc, refresh_token_enc, token_type,
                granted_scopes, access_token_expires_at, token_endpoint,
                issuer, resource_url, mcp_url,
                connected_at, updated_at,
                ${accountAware ? GRANT_ACCOUNT_COLUMNS : GRANT_ACCOUNT_DEFAULTS}
           from public.connector_oauth_grants
          where user_id = $1 and connector_id = $2 and revoked_at is null${
            scoped ? ' and account_key = $3' : ''
          }
          ${accountAware ? 'order by is_default desc, connected_at desc' : ''}
          limit 1`,
        scoped
          ? [userId, connectorId, normalizeConnectorAccountKey(accountKey)]
          : [userId, connectorId],
      );
    });
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
      accountKey: normalizeConnectorAccountKey(row.account_key),
      accountLabel: row.account_label ?? null,
      accountScope: row.account_scope ?? 'personal',
      isDefault: row.is_default ?? true,
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
  accountKey: string;
  accountLabel: string | null;
  accountScope: ConnectorAccountScope;
  isDefault: boolean;
}

interface GrantSummaryRow {
  connector_id: string;
  granted_scopes: string[] | null;
  access_token_expires_at: string | null;
  refresh_token_enc: string | null;
  connected_at: string;
  updated_at: string;
  account_key: string | null;
  account_label: string | null;
  account_scope: ConnectorAccountScope | null;
  is_default: boolean | null;
}

function toGrantSummary(row: GrantSummaryRow, nowMs: number): ConnectorOAuthGrantSummary {
  return {
    connectorId: row.connector_id,
    grantedScopes: row.granted_scopes ?? [],
    connectedAt: row.connected_at,
    updatedAt: row.updated_at,
    needsReauthorization:
      !row.refresh_token_enc &&
      row.access_token_expires_at !== null &&
      new Date(row.access_token_expires_at).getTime() <= nowMs,
    accountKey: normalizeConnectorAccountKey(row.account_key),
    accountLabel: row.account_label ?? null,
    accountScope: row.account_scope ?? 'personal',
    isDefault: row.is_default ?? true,
  };
}

async function queryGrantSummaries(
  userId: string,
  connectorId?: string | null,
): Promise<ConnectorOAuthGrantSummary[]> {
  const db = getNeonDb();
  try {
    const rows = await withAccountColumns((accountAware) =>
      db.query<GrantSummaryRow>(
        `select connector_id, granted_scopes, access_token_expires_at,
                refresh_token_enc, connected_at, updated_at,
                ${accountAware ? GRANT_ACCOUNT_COLUMNS : GRANT_ACCOUNT_DEFAULTS}
           from public.connector_oauth_grants
          where user_id = $1 and revoked_at is null
            and ($2::text is null or connector_id = $2::text)
          order by connected_at desc`,
        [userId, connectorId ?? null],
      ),
    );
    const now = Date.now();
    return rows.map((row) => toGrantSummary(row, now));
  } catch (error) {
    if (isUndefinedTable(error)) return [];
    throw error;
  }
}

export async function getUserConnectorOAuthGrantSummaries(
  userId: string,
): Promise<ConnectorOAuthGrantSummary[]> {
  return queryGrantSummaries(userId);
}

/**
 * Every account connected for one connector, or for all of them. This is what
 * a selector renders and what `selectConnectorAccount` resolves a call against.
 */
export async function listConnectorAccounts(
  userId: string,
  connectorId?: string | null,
): Promise<ConnectorAccount[]> {
  const summaries = await queryGrantSummaries(userId, connectorId ?? null);
  return summaries.map((summary) => ({
    connectorId: summary.connectorId,
    accountKey: summary.accountKey,
    accountLabel: summary.accountLabel,
    scope: summary.accountScope,
    isDefault: summary.isDefault,
    grantedScopes: summary.grantedScopes,
    connectedAt: summary.connectedAt,
    updatedAt: summary.updatedAt,
    needsReauthorization: summary.needsReauthorization,
  }));
}

export interface RevocableConnectorToken {
  accountKey: string;
  token: string;
  tokenTypeHint: 'access_token' | 'refresh_token';
}

/**
 * Every live credential a disconnect has to hand back to the provider, one per
 * connected account. Reading a single grant would leave the accounts that are
 * not the default live upstream after the local rows are destroyed. A row whose
 * ciphertext no longer opens is skipped rather than failing the disconnect,
 * since a credential nobody can read is also one nobody can present.
 */
export async function listRevocableConnectorTokens(
  userId: string,
  connectorId: string,
  accountKey?: string | null,
): Promise<RevocableConnectorToken[]> {
  const db = getNeonDb();
  let rows: Array<Pick<GrantRow, 'access_token_enc' | 'refresh_token_enc' | 'account_key'>>;
  try {
    rows = await withAccountColumns((accountAware) => {
      const scoped = accountAware && accountKey !== undefined && accountKey !== null;
      return db.query<Pick<GrantRow, 'access_token_enc' | 'refresh_token_enc' | 'account_key'>>(
        `select access_token_enc, refresh_token_enc,
                ${accountAware ? 'account_key' : `'${DEFAULT_CONNECTOR_ACCOUNT_KEY}' as account_key`}
           from public.connector_oauth_grants
          where user_id = $1 and connector_id = $2 and revoked_at is null${
            scoped ? ' and account_key = $3' : ''
          }`,
        scoped
          ? [userId, connectorId, normalizeConnectorAccountKey(accountKey)]
          : [userId, connectorId],
      );
    });
  } catch (error) {
    if (isUndefinedTable(error)) return [];
    throw error;
  }

  const tokens: RevocableConnectorToken[] = [];
  for (const row of rows) {
    const sealed = row.refresh_token_enc ?? row.access_token_enc;
    if (!sealed) continue;
    const purpose = row.refresh_token_enc ? 'oauth-refresh-token' : 'oauth-access-token';
    let token: string;
    try {
      token = decryptConnectorToken(sealed, purpose);
    } catch {
      logger.warn(
        { connectorId },
        '[connector-oauth] a stored credential could not be decrypted for revocation',
      );
      continue;
    }
    tokens.push({
      accountKey: normalizeConnectorAccountKey(row.account_key),
      token,
      tokenTypeHint: row.refresh_token_enc ? 'refresh_token' : 'access_token',
    });
  }
  return tokens;
}

/**
 * Both statements run together: clearing the old default first is what keeps
 * the one-live-default index from rejecting the new one.
 */
export async function setDefaultConnectorAccount(
  userId: string,
  connectorId: string,
  accountKey: string,
): Promise<boolean> {
  const db = getNeonDb();
  const key = normalizeConnectorAccountKey(accountKey);
  try {
    return await withAccountColumns(async (accountAware) => {
      if (!accountAware) return false;
      await db.execute(
        `update public.connector_oauth_grants
            set is_default = false, updated_at = now()
          where user_id = $1 and connector_id = $2 and account_key <> $3 and is_default`,
        [userId, connectorId, key],
      );
      const rows = await db.query<{ account_key: string }>(
        `update public.connector_oauth_grants
            set is_default = true, updated_at = now()
          where user_id = $1 and connector_id = $2 and account_key = $3 and revoked_at is null
          returning account_key`,
        [userId, connectorId, key],
      );
      return rows.length > 0;
    });
  } catch (error) {
    if (isUndefinedTable(error)) return false;
    throw error;
  }
}

/**
 * With no account key this revokes every account of the connector, which is
 * what disconnecting a connector has always meant. Naming one revokes only it
 * and promotes the newest survivor so the connector keeps a default.
 */
export async function revokeConnectorOAuthGrant(
  userId: string,
  connectorId: string,
  accountKey?: string | null,
): Promise<boolean> {
  const db = getNeonDb();
  try {
    return await withAccountColumns(async (accountAware) => {
      const scoped = accountAware && accountKey !== undefined && accountKey !== null;
      const values = scoped
        ? [userId, connectorId, normalizeConnectorAccountKey(accountKey)]
        : [userId, connectorId];
      const rows = await db.query<{ connector_id: string }>(
        `update public.connector_oauth_grants
            set revoked_at = now(),
                access_token_enc = null,
                refresh_token_enc = null,
                ${accountAware ? 'is_default = false,' : ''}
                updated_at = now()
          where user_id = $1 and connector_id = $2 and revoked_at is null${
            scoped ? ' and account_key = $3' : ''
          }
          returning connector_id`,
        values,
      );
      if (rows.length === 0 || !accountAware) return rows.length > 0;
      await db.execute(
        `update public.connector_oauth_grants
            set is_default = true, updated_at = now()
          where id = (
            select id from public.connector_oauth_grants
             where user_id = $1 and connector_id = $2 and revoked_at is null
             order by connected_at desc
             limit 1
          )
            and not exists (
              select 1 from public.connector_oauth_grants live
               where live.user_id = $1 and live.connector_id = $2
                 and live.revoked_at is null and live.is_default
            )`,
        [userId, connectorId],
      );
      return true;
    });
  } catch (error) {
    if (isUndefinedTable(error)) return false;
    throw error;
  }
}
