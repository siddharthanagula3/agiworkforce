/**
 * @file Per-user access-token resolution for OAuth connectors.
 *
 * The one place the chat tool loop asks "can I call this connector as this
 * user right now?". Owns refresh-on-expiry, and owns the decision to give up
 * and ask for reconnection.
 *
 * Refresh is pre-emptive (a token expiring inside the skew window is refreshed
 * before the call) AND reactive (`forceRefresh` after a 401), because a
 * provider can invalidate a token before its stated expiry — the lazy-auth path
 * in lib/user-connector-tools.ts depends on the reactive form.
 */

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
  revokeConnectorOAuthGrant,
  updateConnectorOAuthGrantTokens,
} from '@/lib/connectors/oauth-store';
import {
  getConnectorOAuthProvider,
  type ConnectorOAuthProvider,
} from '@/lib/connectors/oauth-registry';
import { getMcpEndpoint } from '@/lib/connectors/mcp-endpoints';
import { refreshDiscoveredGrant } from '@/lib/connectors/mcp-discovery';

/** Refresh a token that expires within this window rather than racing the call. */
const EXPIRY_SKEW_MS = 60_000;

export type ConnectorAccessOutcome =
  | { status: 'ready'; accessToken: string; tokenType: string; grantedScopes: string[] }
  /** No provider configured for this connector id in this deployment. */
  | { status: 'not-configured' }
  /** Configured, but this user has never authorized it (or has disconnected). */
  | { status: 'not-connected' }
  /** Authorized once, but the stored credential can no longer be used. */
  | { status: 'reauthorization-required'; reason: 'expired' | 'refresh-failed' | 'undecryptable' };

/**
 * Resolve a usable access token for (`userId`, `connectorId`).
 *
 * Never throws for an expected failure — every branch is a status the caller
 * can turn into an honest tool result. Only a genuinely unexpected error (a
 * database fault) propagates.
 */
export async function resolveConnectorAccessToken(
  userId: string,
  connectorId: string,
  options: { forceRefresh?: boolean } = {},
): Promise<ConnectorAccessOutcome> {
  const provider = getConnectorOAuthProvider(connectorId);

  // A connector with no operator-registered provider is NOT automatically
  // unconfigured any more: it may have been authorized through discovery
  // against the vendor's own MCP endpoint, in which case a real grant exists
  // and reporting `not-configured` would tell the user to set up something that
  // is already working. `getMcpEndpoint` is the cheap static check; the grant
  // read below is what actually decides.
  if (!provider && !getMcpEndpoint(connectorId)) return { status: 'not-configured' };

  let grant;
  try {
    grant = await getConnectorOAuthGrant(userId, connectorId);
  } catch (error) {
    if (error instanceof ConnectorGrantDecryptionError) {
      logger.warn(
        { connectorId },
        '[connector-oauth] stored grant could not be decrypted — asking the user to reconnect',
      );
      return { status: 'reauthorization-required', reason: 'undecryptable' };
    }
    throw error;
  }
  if (!grant) return { status: 'not-connected' };

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
    // Nothing to refresh WITH, and we only get here because the token is
    // expiring or was just rejected. A grant that cannot produce a usable token
    // must not keep reading as connected.
    await revokeConnectorOAuthGrant(userId, connectorId);
    return { status: 'reauthorization-required', reason: 'expired' };
  }

  // DISCOVERED GRANTS refresh through `auth()`, not through the registry: their
  // client identity lives in `mcp_oauth_clients` keyed by issuer, and there is
  // no provider descriptor holding a client id and secret to pass here.
  if (grant.mcpUrl) {
    const outcome = await refreshDiscoveredGrant({
      mcpUrl: grant.mcpUrl,
      issuer: grant.issuer,
      refreshToken,
      tokenType: grant.tokenType,
      grantedScopes: grant.grantedScopes,
    });

    if (outcome.status === 'authorization-server-changed') {
      // SEP-2352. The credential is addressed to a party that no longer serves
      // this resource; dropping it is the point, not a side effect.
      await revokeConnectorOAuthGrant(userId, connectorId);
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
    // A grant exists but there is neither a registry provider nor a recorded
    // MCP URL to refresh against — the shape a pre-0115 discovered grant would
    // have. Nothing can renew it, so ask for a clean reconnect.
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
    // A dead refresh token can never recover; drop the grant so the UI and the
    // tool loop both stop claiming the connector is usable. A transient failure
    // (5xx, timeout) leaves the grant in place to retry on the next turn.
    if (isDead) await revokeConnectorOAuthGrant(userId, connectorId);
    return { status: 'reauthorization-required', reason: 'refresh-failed' };
  }
}

/**
 * Disconnect: revoke at the provider when it exposes an endpoint, then drop the
 * local ciphertext. Provider revocation is attempted FIRST because it needs the
 * token that local revocation destroys, and it is best-effort so an outage
 * cannot block the disconnect.
 */
export async function disconnectConnectorOAuthGrant(
  userId: string,
  connectorId: string,
): Promise<boolean> {
  const provider: ConnectorOAuthProvider | null = getConnectorOAuthProvider(connectorId);
  if (provider?.revocationUrl) {
    try {
      const grant = await getConnectorOAuthGrant(userId, connectorId);
      if (grant) {
        await revokeTokenAtProvider(
          provider,
          grant.refreshToken ?? grant.accessToken,
          grant.refreshToken ? 'refresh_token' : 'access_token',
        );
      }
    } catch (error) {
      logger.warn(
        { connectorId, error: error instanceof Error ? error.name : 'unknown' },
        '[connector-oauth] provider-side revocation could not be attempted; revoking locally',
      );
    }
  }
  return revokeConnectorOAuthGrant(userId, connectorId);
}
