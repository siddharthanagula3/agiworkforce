import 'server-only';

import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import { logger } from '@/lib/logger';
import {
  ConnectorOAuthTokenError,
  refreshAccessToken,
  revokeTokenAtProvider,
} from '@/lib/connectors/oauth-client';
import {
  claimConnectorGrantRefresh,
  completeConnectorGrantRefresh,
  ConnectorGrantDecryptionError,
  getConnectorOAuthGrant,
  listRevocableConnectorTokens,
  releaseConnectorGrantRefresh,
  revokeConnectorOAuthGrant,
  updateConnectorOAuthGrantTokens,
  type ConnectorOAuthGrant,
  type ConnectorRefreshLease,
  type StoredGrantTokens,
} from '@/lib/connectors/oauth-store';
import {
  getConnectorOAuthProvider,
  type ConnectorOAuthProvider,
} from '@/lib/connectors/oauth-registry';
import { getMcpEndpoint } from '@/lib/connectors/mcp-endpoints';
import { refreshDiscoveredGrant } from '@/lib/connectors/mcp-discovery';
import { canonicalResourceUri } from '@/lib/connectors/registry-authorization';
import { getNeonDb } from '@/lib/server/neon-db';
import { recordNotification } from '@/lib/services/notification-service';

const EXPIRY_SKEW_MS = 60_000;
const REFRESH_LEASE_MS = 75_000;
const REFRESH_WAIT_LIMIT_MS = REFRESH_LEASE_MS + 5_000;
const REFRESH_POLL_INITIAL_MS = 100;
const REFRESH_POLL_MAX_MS = 1_000;

async function dropUnusableGrant(
  userId: string,
  connectorId: string,
  accountKey: string,
  provider: ConnectorOAuthProvider | null,
): Promise<void> {
  const revoked = await revokeConnectorOAuthGrant(userId, connectorId, accountKey);
  if (!revoked) return;
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
  | { status: 'ready'; accessToken: string; tokenType: string; grantedScopes: string[] }
  /** No provider configured for this connector id in this deployment. */
  | { status: 'not-configured' }
  /** Configured, but this user has never authorized it (or has disconnected). */
  | { status: 'not-connected' }
  /** Authorized once, but the stored credential can no longer be used. */
  | { status: 'reauthorization-required'; reason: 'expired' | 'refresh-failed' | 'undecryptable' };

export interface ResolveConnectorAccessOptions {
  forceRefresh?: boolean;
  /** The connector is a directory record whose grant was minted by MCP discovery. */
  discovered?: boolean;
}

type GrantRead = { grant: ConnectorOAuthGrant } | { outcome: ConnectorAccessOutcome };

type RefreshAttempt =
  | { kind: 'refreshed'; tokens: Omit<StoredGrantTokens, 'tokenEndpoint'> }
  | { kind: 'dead' }
  | { kind: 'failed' };

const REFRESH_FAILED: ConnectorAccessOutcome = {
  status: 'reauthorization-required',
  reason: 'refresh-failed',
};

async function readGrant(
  userId: string,
  connectorId: string,
  accountKey?: string,
): Promise<GrantRead> {
  try {
    const grant = await getConnectorOAuthGrant(userId, connectorId, accountKey);
    return grant ? { grant } : { outcome: { status: 'not-connected' } };
  } catch (error) {
    if (error instanceof ConnectorGrantDecryptionError) {
      logger.warn(
        { connectorId },
        '[connector-oauth] stored grant could not be decrypted, asking the user to reconnect',
      );
      return { outcome: { status: 'reauthorization-required', reason: 'undecryptable' } };
    }
    throw error;
  }
}

function ready(grant: {
  accessToken: string;
  tokenType: string;
  grantedScopes: string[];
}): ConnectorAccessOutcome {
  return {
    status: 'ready',
    accessToken: grant.accessToken,
    tokenType: grant.tokenType,
    grantedScopes: grant.grantedScopes,
  };
}

function expiresSoon(grant: ConnectorOAuthGrant): boolean {
  return (
    grant.accessTokenExpiresAt !== null &&
    grant.accessTokenExpiresAt.getTime() - EXPIRY_SKEW_MS <= Date.now()
  );
}

async function attemptDiscoveredRefresh(
  grant: ConnectorOAuthGrant,
  mcpUrl: string,
  refreshToken: string,
): Promise<RefreshAttempt> {
  const outcome = await refreshDiscoveredGrant({
    mcpUrl,
    issuer: grant.issuer,
    refreshToken,
    tokenType: grant.tokenType,
    grantedScopes: grant.grantedScopes,
  });
  if (outcome.status === 'refreshed') {
    return {
      kind: 'refreshed',
      tokens: {
        accessToken: outcome.accessToken,
        refreshToken: outcome.refreshToken,
        tokenType: outcome.tokenType,
        grantedScopes: outcome.grantedScopes,
        accessTokenExpiresAt: outcome.accessTokenExpiresAt,
      },
    };
  }
  if (outcome.status === 'failed') {
    logger.warn(
      { connectorId: grant.connectorId },
      '[connector-oauth] discovered-connector token refresh failed',
    );
    return { kind: 'failed' };
  }
  return { kind: 'dead' };
}

async function attemptRegisteredRefresh(
  grant: ConnectorOAuthGrant,
  provider: ConnectorOAuthProvider,
  refreshToken: string,
): Promise<RefreshAttempt> {
  try {
    const refreshed = await refreshAccessToken({
      provider,
      refreshToken,
      tokenEndpoint: grant.tokenEndpoint,
      grantedScopes: grant.grantedScopes,
      resource: grant.resourceUrl ?? canonicalResourceUri(provider.mcpUrl),
    });
    return {
      kind: 'refreshed',
      tokens: {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        tokenType: refreshed.tokenType,
        grantedScopes: refreshed.grantedScopes,
        accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
      },
    };
  } catch (error) {
    logger.warn(
      {
        connectorId: grant.connectorId,
        status: error instanceof ConnectorOAuthTokenError ? error.status : undefined,
        oauthError: error instanceof ConnectorOAuthTokenError ? error.oauthError : undefined,
      },
      '[connector-oauth] token refresh failed',
    );
    return error instanceof ConnectorOAuthTokenError && error.isInvalidGrant
      ? { kind: 'dead' }
      : { kind: 'failed' };
  }
}

async function refreshGrant(
  userId: string,
  grant: ConnectorOAuthGrant,
  refreshToken: string,
  provider: ConnectorOAuthProvider | null,
  lease: ConnectorRefreshLease | null,
): Promise<ConnectorAccessOutcome> {
  let stored = false;
  try {
    let attempt: RefreshAttempt;
    if (grant.mcpUrl) {
      attempt = await attemptDiscoveredRefresh(grant, grant.mcpUrl, refreshToken);
    } else if (provider) {
      attempt = await attemptRegisteredRefresh(grant, provider, refreshToken);
    } else {
      return { status: 'reauthorization-required', reason: 'expired' };
    }

    if (attempt.kind === 'refreshed') {
      if (lease) {
        stored = await completeConnectorGrantRefresh(lease, attempt.tokens);
        if (!stored) {
          logger.warn(
            { connectorId: grant.connectorId },
            '[connector-oauth] refresh lease lapsed before the rotated token was stored',
          );
        }
      } else {
        await updateConnectorOAuthGrantTokens(
          userId,
          grant.connectorId,
          attempt.tokens,
          grant.accountKey,
        );
      }
      return ready(attempt.tokens);
    }

    if (attempt.kind === 'dead') {
      await dropUnusableGrant(userId, grant.connectorId, grant.accountKey, provider);
    }
    return REFRESH_FAILED;
  } finally {
    if (lease && !stored) await releaseConnectorGrantRefresh(lease);
  }
}

async function refreshSingleFlight(
  userId: string,
  grant: ConnectorOAuthGrant,
  refreshToken: string,
  provider: ConnectorOAuthProvider | null,
): Promise<ConnectorAccessOutcome> {
  const lease: ConnectorRefreshLease = {
    userId,
    connectorId: grant.connectorId,
    accountKey: grant.accountKey,
    leaseId: randomUUID(),
  };
  const deadline = Date.now() + REFRESH_WAIT_LIMIT_MS;
  let observed = { grant, refreshToken };
  let pollMs = REFRESH_POLL_INITIAL_MS;

  for (;;) {
    const claim = await claimConnectorGrantRefresh(
      lease,
      observed.grant.credentialVersion,
      REFRESH_LEASE_MS,
    );
    if (claim !== 'busy') {
      return refreshGrant(
        userId,
        observed.grant,
        observed.refreshToken,
        provider,
        claim === 'claimed' ? lease : null,
      );
    }

    const read = await readGrant(userId, grant.connectorId, grant.accountKey);
    if ('outcome' in read) {
      return read.outcome.status === 'not-connected' ? REFRESH_FAILED : read.outcome;
    }
    if (read.grant.credentialVersion !== observed.grant.credentialVersion) return ready(read.grant);
    if (!read.grant.refreshToken) return REFRESH_FAILED;
    observed = { grant: read.grant, refreshToken: read.grant.refreshToken };

    if (Date.now() >= deadline) {
      logger.warn(
        { connectorId: grant.connectorId },
        '[connector-oauth] another instance held the refresh lease past the wait limit',
      );
      return REFRESH_FAILED;
    }
    await delay(pollMs);
    pollMs = Math.min(pollMs * 2, REFRESH_POLL_MAX_MS);
  }
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

  const read = await readGrant(userId, connectorId);
  if ('outcome' in read) return read.outcome;
  const { grant } = read;
  if (options.discovered && !grant.mcpUrl) return { status: 'not-configured' };

  if (!options.forceRefresh && !expiresSoon(grant)) return ready(grant);

  if (!grant.refreshToken) {
    await dropUnusableGrant(userId, connectorId, grant.accountKey, provider);
    return { status: 'reauthorization-required', reason: 'expired' };
  }

  return refreshSingleFlight(userId, grant, grant.refreshToken, provider);
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
