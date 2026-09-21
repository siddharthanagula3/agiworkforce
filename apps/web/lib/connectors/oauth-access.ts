import 'server-only';

import { logger } from '@/lib/logger';
import {
  ConnectorOAuthTokenError,
  refreshAccessToken,
  revokeTokenAtProvider,
} from '@/lib/connectors/oauth-client';
import {
  ConnectorGrantDecryptionError,
  getConnectorOAuthGrant,
  listRevocableConnectorTokens,
  revokeConnectorOAuthGrant,
  updateConnectorOAuthGrantTokens,
} from '@/lib/connectors/oauth-store';
import {
  getConnectorOAuthProvider,
  type ConnectorOAuthProvider,
} from '@/lib/connectors/oauth-registry';
import { getMcpEndpoint } from '@/lib/connectors/mcp-endpoints';
import { refreshDiscoveredGrant } from '@/lib/connectors/mcp-discovery';
import { getNeonDb } from '@/lib/server/neon-db';
import { recordNotification } from '@/lib/services/notification-service';

const EXPIRY_SKEW_MS = 60_000;

async function dropUnusableGrant(
  userId: string,
  connectorId: string,
  provider: ConnectorOAuthProvider | null,
): Promise<void> {
  const revoked = await revokeConnectorOAuthGrant(userId, connectorId);
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

  const expiresSoon =
    grant.accessTokenExpiresAt !== null &&
    grant.accessTokenExpiresAt.getTime() - EXPIRY_SKEW_MS <= Date.now();

  if (!options.forceRefresh && !expiresSoon) {
    return {
      status: 'ready',
      accessToken: grant.accessToken,
      tokenType: grant.tokenType,
      grantedScopes: grant.grantedScopes,
    };
  }

  const refreshToken = grant.refreshToken;
  if (!refreshToken) {
    await dropUnusableGrant(userId, connectorId, provider);
    return { status: 'reauthorization-required', reason: 'expired' };
  }

  if (grant.mcpUrl) {
    const outcome = await refreshDiscoveredGrant({
      mcpUrl: grant.mcpUrl,
      issuer: grant.issuer,
      refreshToken,
      tokenType: grant.tokenType,
      grantedScopes: grant.grantedScopes,
    });

    if (outcome.status === 'authorization-server-changed') {
      await dropUnusableGrant(userId, connectorId, provider);
      return { status: 'reauthorization-required', reason: 'refresh-failed' };
    }
    if (outcome.status === 'failed') {
      logger.warn({ connectorId }, '[connector-oauth] discovered-connector token refresh failed');
      return { status: 'reauthorization-required', reason: 'refresh-failed' };
    }

    await updateConnectorOAuthGrantTokens(userId, connectorId, {
      accessToken: outcome.accessToken,
      refreshToken: outcome.refreshToken,
      tokenType: outcome.tokenType,
      grantedScopes: outcome.grantedScopes,
      accessTokenExpiresAt: outcome.accessTokenExpiresAt,
    });
    return {
      status: 'ready',
      accessToken: outcome.accessToken,
      tokenType: outcome.tokenType,
      grantedScopes: outcome.grantedScopes,
    };
  }

  if (!provider) {
    return { status: 'reauthorization-required', reason: 'expired' };
  }

  try {
    const refreshed = await refreshAccessToken({
      provider,
      refreshToken,
      tokenEndpoint: grant.tokenEndpoint,
      grantedScopes: grant.grantedScopes,
    });
    await updateConnectorOAuthGrantTokens(userId, connectorId, {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      tokenType: refreshed.tokenType,
      grantedScopes: refreshed.grantedScopes,
      accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
    });
    return {
      status: 'ready',
      accessToken: refreshed.accessToken,
      tokenType: refreshed.tokenType,
      grantedScopes: refreshed.grantedScopes,
    };
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
    if (isDead) await dropUnusableGrant(userId, connectorId, provider);
    return { status: 'reauthorization-required', reason: 'refresh-failed' };
  }
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
