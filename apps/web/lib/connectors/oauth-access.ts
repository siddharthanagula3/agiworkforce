import 'server-only';

import { logger } from '@/lib/logger';
import {
  ConnectorOAuthTokenError,
  refreshAccessToken,
  revokeTokenAtProvider,
  type OAuthTokenResult,
} from '@/lib/connectors/oauth-client';
import {
  ConnectorGrantDecryptionError,
  ConnectorGrantLockTimeoutError,
  getConnectorOAuthGrant,
  listRevocableConnectorTokens,
  revokeConnectorOAuthGrant,
  withLockedConnectorOAuthGrant,
  type ConnectorOAuthGrant,
  type LockedConnectorOAuthGrant,
} from '@/lib/connectors/oauth-store';
import {
  getConnectorOAuthProvider,
  type ConnectorOAuthProvider,
} from '@/lib/connectors/oauth-registry';
import { getMcpEndpoint } from '@/lib/connectors/mcp-endpoints';
import { removeBankAccountsItem } from '@/lib/connectors/bank-accounts';
import { BANK_ACCOUNTS_CONNECTOR_ID } from '@/lib/connectors/plaid-config';
import { refreshDiscoveredGrant } from '@/lib/connectors/mcp-discovery';
import { getCustomConnectorOAuthClient } from '@/lib/connectors/mcp-custom-connections';
import { canonicalResourceUri } from '@/lib/connectors/registry-authorization';
import { getNeonDb } from '@/lib/server/neon-db';
import { recordNotification } from '@/lib/services/notification-service';

const EXPIRY_SKEW_MS = 60_000;

const refreshesInFlight = new Map<string, Promise<ConnectorAccessOutcome>>();

async function notifyReconnectRequired(
  userId: string,
  connectorId: string,
  provider: ConnectorOAuthProvider | null,
): Promise<void> {
  const name = provider?.displayName ?? connectorId;
  await recordNotification(getNeonDb(), {
    userId,
    category: 'connector',
    severity: 'warning',
    title: `Reconnect ${name}`,
    message: `The ${name} authorization expired or was revoked, so its tools stop working until you connect it again.`,
    target: { kind: 'settings', id: 'connectors' },
    dedupeKey: `connector-expired:${connectorId}:${new Date().toISOString().slice(0, 10)}`,
  });
}

export type ConnectorAccessOutcome =
  | {
      status: 'ready';
      accessToken: string;
      tokenType: string;
      grantedScopes: string[];
      accountKey: string;
    }
  /** No provider configured for this connector id in this deployment. */
  | { status: 'not-configured' }
  /** Configured, but this user has never authorized it (or has disconnected). */
  | { status: 'not-connected' }
  /** Authorized once, but the stored credential can no longer be used. */
  | { status: 'reauthorization-required'; reason: 'expired' | 'refresh-failed' | 'undecryptable' };

export type ReadyConnectorAccess = Extract<ConnectorAccessOutcome, { status: 'ready' }>;

export interface ResolveConnectorAccessOptions {
  forceRefresh?: boolean;
  /** The connector is a directory record whose grant was minted by MCP discovery. */
  discovered?: boolean;
}

export async function resolveConnectorAccessToken(
  userId: string,
  connectorId: string,
  options: ResolveConnectorAccessOptions = {},
): Promise<ConnectorAccessOutcome> {
  const provider = getConnectorOAuthProvider(connectorId);

  if (!provider && !getMcpEndpoint(connectorId) && !options.discovered) {
    return { status: 'not-configured' };
  }

  let grant;
  try {
    grant = await getConnectorOAuthGrant(userId, connectorId);
  } catch (error) {
    if (error instanceof ConnectorGrantDecryptionError) {
      logger.warn(
        { connectorId },
        '[connector-oauth] stored grant could not be decrypted, asking the user to reconnect',
      );
      return { status: 'reauthorization-required', reason: 'undecryptable' };
    }
    throw error;
  }
  if (!grant) return { status: 'not-connected' };
  if (options.discovered && !grant.mcpUrl) return { status: 'not-configured' };

  if (!options.forceRefresh && !expiresSoon(grant)) return ready(grant, grant.accountKey);

  return refreshOnce(userId, connectorId, grant, provider);
}

function expiresSoon(grant: ConnectorOAuthGrant): boolean {
  return (
    grant.accessTokenExpiresAt !== null &&
    grant.accessTokenExpiresAt.getTime() - EXPIRY_SKEW_MS <= Date.now()
  );
}

function ready(
  tokens: Pick<ConnectorOAuthGrant, 'accessToken' | 'tokenType' | 'grantedScopes'>,
  accountKey: string,
): ConnectorAccessOutcome {
  return {
    status: 'ready',
    accessToken: tokens.accessToken,
    tokenType: tokens.tokenType,
    grantedScopes: tokens.grantedScopes,
    accountKey,
  };
}

function refreshOnce(
  userId: string,
  connectorId: string,
  seen: ConnectorOAuthGrant,
  provider: ConnectorOAuthProvider | null,
): Promise<ConnectorAccessOutcome> {
  const key = JSON.stringify([userId, connectorId, seen.accountKey]);
  const inFlight = refreshesInFlight.get(key);
  if (inFlight) return inFlight;
  const refresh = refreshUnderLock(userId, connectorId, seen, provider).finally(() => {
    refreshesInFlight.delete(key);
  });
  refreshesInFlight.set(key, refresh);
  return refresh;
}

interface LockedRefresh {
  outcome: ConnectorAccessOutcome;
  dropped: boolean;
}

const REFRESH_FAILED: ConnectorAccessOutcome = {
  status: 'reauthorization-required',
  reason: 'refresh-failed',
};

const EXPIRED: ConnectorAccessOutcome = { status: 'reauthorization-required', reason: 'expired' };

async function refreshUnderLock(
  userId: string,
  connectorId: string,
  seen: ConnectorOAuthGrant,
  provider: ConnectorOAuthProvider | null,
): Promise<ConnectorAccessOutcome> {
  let result: LockedRefresh;
  try {
    result = await withLockedConnectorOAuthGrant(userId, connectorId, seen.accountKey, (locked) =>
      refreshLockedGrant(locked, seen, provider, userId, connectorId),
    );
  } catch (error) {
    if (error instanceof ConnectorGrantLockTimeoutError) {
      logger.warn(
        { connectorId },
        '[connector-oauth] a concurrent refresh held the grant too long',
      );
      return REFRESH_FAILED;
    }
    if (error instanceof ConnectorGrantDecryptionError) {
      return { status: 'reauthorization-required', reason: 'undecryptable' };
    }
    throw error;
  }
  if (result.dropped) await notifyReconnectRequired(userId, connectorId, provider);
  return result.outcome;
}

async function refreshLockedGrant(
  locked: LockedConnectorOAuthGrant,
  seen: ConnectorOAuthGrant,
  provider: ConnectorOAuthProvider | null,
  userId: string,
  connectorId: string,
): Promise<LockedRefresh> {
  const current = locked.grant;
  if (!current) return { outcome: REFRESH_FAILED, dropped: false };
  if (current.accessToken !== seen.accessToken && !expiresSoon(current)) {
    return { outcome: ready(current, current.accountKey), dropped: false };
  }

  const refreshToken = current.refreshToken;
  if (!refreshToken) return { outcome: EXPIRED, dropped: await locked.revoke() };

  if (current.mcpUrl) {
    const client = await getCustomConnectorOAuthClient(userId, connectorId);
    const outcome = await refreshDiscoveredGrant({
      mcpUrl: current.mcpUrl,
      issuer: current.issuer,
      refreshToken,
      tokenType: current.tokenType,
      grantedScopes: current.grantedScopes,
      ...(client ? { client } : {}),
    });

    if (outcome.status === 'authorization-server-changed' || outcome.status === 'rejected') {
      return { outcome: REFRESH_FAILED, dropped: await locked.revoke() };
    }
    if (outcome.status === 'failed') {
      logger.warn({ connectorId }, '[connector-oauth] discovered-connector token refresh failed');
      return { outcome: REFRESH_FAILED, dropped: false };
    }

    await locked.saveTokens({
      accessToken: outcome.accessToken,
      refreshToken: outcome.refreshToken,
      tokenType: outcome.tokenType,
      grantedScopes: outcome.grantedScopes,
      accessTokenExpiresAt: outcome.accessTokenExpiresAt,
    });
    return { outcome: ready(outcome, current.accountKey), dropped: false };
  }

  if (!provider) return { outcome: EXPIRED, dropped: false };

  let refreshed: OAuthTokenResult;
  try {
    refreshed = await refreshAccessToken({
      provider,
      refreshToken,
      tokenEndpoint: current.tokenEndpoint,
      grantedScopes: current.grantedScopes,
      resource: current.resourceUrl ?? canonicalResourceUri(provider.mcpUrl),
    });
  } catch (error) {
    const isDead = error instanceof ConnectorOAuthTokenError && error.isInvalidGrant;
    logger.warn(
      {
        connectorId,
        status: error instanceof ConnectorOAuthTokenError ? error.status : undefined,
        oauthError: error instanceof ConnectorOAuthTokenError ? error.oauthError : undefined,
      },
      '[connector-oauth] token refresh failed',
    );
    return { outcome: REFRESH_FAILED, dropped: isDead ? await locked.revoke() : false };
  }

  await locked.saveTokens({
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    tokenType: refreshed.tokenType,
    grantedScopes: refreshed.grantedScopes,
    accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
  });
  return { outcome: ready(refreshed, current.accountKey), dropped: false };
}

/**
 * Account erasure hands every live connector credential back to its provider
 * before the grant rows are deleted, the same way disconnect does, so a
 * deleted account leaves no refresh token live upstream. Best effort: a
 * provider that refuses or times out is logged and never blocks the erasure.
 */
export async function revokeAllConnectorTokensAtProviders(
  userId: string,
): Promise<{ attempted: number; revoked: number }> {
  let connectorIds: string[];
  try {
    const rows = await getNeonDb().query<{ connector_id: string }>(
      `select distinct connector_id from public.connector_oauth_grants
        where user_id = $1 and revoked_at is null`,
      [userId],
    );
    connectorIds = rows.map((row) => row.connector_id);
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.name : 'unknown' },
      '[connector-oauth] erasure could not list grants to revoke upstream',
    );
    return { attempted: 0, revoked: 0 };
  }

  let attempted = 0;
  let revoked = 0;
  for (const connectorId of connectorIds) {
    const provider = getConnectorOAuthProvider(connectorId);
    if (!provider?.revocationUrl) continue;
    try {
      const revocable = await listRevocableConnectorTokens(userId, connectorId);
      for (const credential of revocable) {
        attempted += 1;
        if (await revokeTokenAtProvider(provider, credential.token, credential.tokenTypeHint)) {
          revoked += 1;
        }
      }
    } catch (error) {
      logger.warn(
        { connectorId, error: error instanceof Error ? error.name : 'unknown' },
        '[connector-oauth] erasure could not revoke a grant upstream; erasing locally',
      );
    }
  }
  return { attempted, revoked };
}

/**
 * With no account key this disconnects every account of the connector, so every
 * one of their credentials is handed back to the provider before the local rows
 * are destroyed. Revoking only the default would leave a second mailbox's
 * refresh token live upstream with nothing left here to revoke it with.
 */
export async function disconnectConnectorOAuthGrant(
  userId: string,
  connectorId: string,
  accountKey?: string | null,
): Promise<boolean> {
  if (connectorId === BANK_ACCOUNTS_CONNECTOR_ID) await removeBankAccountsItem(userId);
  const provider: ConnectorOAuthProvider | null = getConnectorOAuthProvider(connectorId);
  if (provider?.revocationUrl) {
    try {
      const revocable = await listRevocableConnectorTokens(userId, connectorId, accountKey);
      for (const credential of revocable) {
        await revokeTokenAtProvider(provider, credential.token, credential.tokenTypeHint);
      }
    } catch (error) {
      logger.warn(
        { connectorId, error: error instanceof Error ? error.name : 'unknown' },
        '[connector-oauth] provider-side revocation could not be attempted; revoking locally',
      );
    }
  }
  return revokeConnectorOAuthGrant(userId, connectorId, accountKey);
}
