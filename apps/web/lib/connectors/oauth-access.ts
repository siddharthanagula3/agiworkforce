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
  type RevocableConnectorToken,
} from '@/lib/connectors/oauth-store';
import {
  getConnectorOAuthProvider,
  type ConnectorOAuthProvider,
} from '@/lib/connectors/oauth-registry';
import { getMcpEndpoint } from '@/lib/connectors/mcp-endpoints';
import { removeBankAccountsItem } from '@/lib/connectors/bank-accounts';
import { BANK_ACCOUNTS_CONNECTOR_ID } from '@/lib/connectors/plaid-config';
import { refreshDiscoveredGrant, revokeDiscoveredGrant } from '@/lib/connectors/mcp-discovery';
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
  | { status: 'reauthorization-required'; reason: 'expired' | 'refresh-failed' | 'undecryptable' }
  /**
   * The grant is intact, but refreshing it timed out, hit a network failure or
   * a server error. Reconnecting would not help; trying again later may.
   */
  | { status: 'unreachable' };

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

const UNREACHABLE: ConnectorAccessOutcome = { status: 'unreachable' };

const TRANSIENT_CLIENT_STATUSES = new Set([408, 429]);

function isTransientRefreshFailure(error: unknown): boolean {
  if (!(error instanceof ConnectorOAuthTokenError)) return true;
  return error.status >= 500 || TRANSIENT_CLIENT_STATUSES.has(error.status);
}

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
      return UNREACHABLE;
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
      return { outcome: UNREACHABLE, dropped: false };
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
    if (isDead) return { outcome: REFRESH_FAILED, dropped: await locked.revoke() };
    return {
      outcome: isTransientRefreshFailure(error) ? UNREACHABLE : REFRESH_FAILED,
      dropped: false,
    };
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

export type ConnectorVendorRevocation =
  | { status: 'revoked' }
  | { status: 'nothing-to-revoke' }
  | {
      status: 'not-revoked';
      reason: 'no-revocation-endpoint' | 'failed';
      /** Where the provider says its users manage access, when it publishes one. */
      manageUrl: string | null;
    };

export interface ConnectorDisconnectOutcome {
  disconnected: boolean;
  vendorRevocation: ConnectorVendorRevocation;
}

type CredentialRevocation = Exclude<ConnectorVendorRevocation, { status: 'nothing-to-revoke' }>;

const NO_REVOCATION_ENDPOINT: CredentialRevocation = {
  status: 'not-revoked',
  reason: 'no-revocation-endpoint',
  manageUrl: null,
};

const REVOCATION_FAILED: CredentialRevocation = {
  status: 'not-revoked',
  reason: 'failed',
  manageUrl: null,
};

async function revokeCredentialAtVendor(
  userId: string,
  connectorId: string,
  provider: ConnectorOAuthProvider | null,
  credential: RevocableConnectorToken,
): Promise<CredentialRevocation> {
  if (credential.mcpUrl) {
    const outcome = await revokeDiscoveredGrant({
      issuer: credential.issuer,
      client: await getCustomConnectorOAuthClient(userId, connectorId).catch(() => null),
      tokens: [
        { token: credential.token, tokenTypeHint: credential.tokenTypeHint },
        ...(credential.companionAccessToken
          ? [{ token: credential.companionAccessToken, tokenTypeHint: 'access_token' as const }]
          : []),
      ],
    });
    if (outcome.status === 'revoked') return outcome;
    return {
      status: 'not-revoked',
      reason: outcome.status === 'unsupported' ? 'no-revocation-endpoint' : 'failed',
      manageUrl: outcome.manageUrl,
    };
  }
  if (!provider?.revocationUrl) return NO_REVOCATION_ENDPOINT;
  return (await revokeTokenAtProvider(provider, credential.token, credential.tokenTypeHint))
    ? { status: 'revoked' }
    : REVOCATION_FAILED;
}

function summarizeRevocations(
  outcomes: readonly CredentialRevocation[],
): ConnectorVendorRevocation {
  const kept = outcomes.filter(
    (outcome): outcome is Extract<CredentialRevocation, { status: 'not-revoked' }> =>
      outcome.status === 'not-revoked',
  );
  if (outcomes.length === 0) return { status: 'nothing-to-revoke' };
  if (kept.length === 0) return { status: 'revoked' };
  return {
    status: 'not-revoked',
    reason: kept.some((outcome) => outcome.reason === 'failed')
      ? 'failed'
      : 'no-revocation-endpoint',
    manageUrl: kept.find((outcome) => outcome.manageUrl)?.manageUrl ?? null,
  };
}

/**
 * Hands every credential back to the provider that issued it, through RFC 7009
 * revocation where the provider offers it. Never throws: a provider that
 * refuses, times out or offers no endpoint is reported, and the caller still
 * destroys its own copy.
 */
async function revokeCredentialsAtVendor(
  userId: string,
  connectorId: string,
  ...accountKey: [] | [string | null | undefined]
): Promise<{ revocation: ConnectorVendorRevocation; outcomes: CredentialRevocation[] }> {
  let revocable: RevocableConnectorToken[];
  try {
    revocable = await listRevocableConnectorTokens(userId, connectorId, ...accountKey);
  } catch (error) {
    logger.warn(
      { connectorId, error: error instanceof Error ? error.name : 'unknown' },
      '[connector-oauth] provider-side revocation could not be attempted; revoking locally',
    );
    return { revocation: REVOCATION_FAILED, outcomes: [] };
  }
  const provider = getConnectorOAuthProvider(connectorId);
  const outcomes: CredentialRevocation[] = [];
  for (const credential of revocable) {
    outcomes.push(await revokeCredentialAtVendor(userId, connectorId, provider, credential));
  }
  const revocation = summarizeRevocations(outcomes);
  if (revocation.status === 'not-revoked') {
    logger.warn(
      { connectorId, reason: revocation.reason },
      '[connector-oauth] the provider did not confirm revocation; access may remain there',
    );
  }
  return { revocation, outcomes };
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
    const { outcomes } = await revokeCredentialsAtVendor(userId, connectorId);
    for (const outcome of outcomes) {
      if (outcome.status === 'not-revoked' && outcome.reason === 'no-revocation-endpoint') continue;
      attempted += 1;
      if (outcome.status === 'revoked') revoked += 1;
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
): Promise<ConnectorDisconnectOutcome> {
  if (connectorId === BANK_ACCOUNTS_CONNECTOR_ID) await removeBankAccountsItem(userId);
  const { revocation } = await revokeCredentialsAtVendor(userId, connectorId, accountKey);
  return {
    disconnected: await revokeConnectorOAuthGrant(userId, connectorId, accountKey),
    vendorRevocation: revocation,
  };
}

export function connectorUnreachableMessage(label: string): string {
  return `Couldn't reach ${label} just now. It is still connected, so try again in a moment.`;
}

/** The grant is intact but its token could not be refreshed just now. */
export class ConnectorUnreachableError extends Error {
  constructor(label: string) {
    super(connectorUnreachableMessage(label));
    this.name = 'ConnectorUnreachableError';
  }
}

export function vendorRevocationNotice(
  label: string,
  revocation: ConnectorVendorRevocation,
): string | null {
  if (revocation.status !== 'not-revoked') return null;
  const cause =
    revocation.reason === 'failed'
      ? `${label} did not confirm that it revoked access`
      : `access was not revoked at ${label}`;
  const where = revocation.manageUrl
    ? `at ${revocation.manageUrl}`
    : `in your ${label} account settings`;
  return `Disconnected here, but ${cause}, so access may remain until you remove it ${where}.`;
}

export function vendorRevocationAuditStatus(revocation: ConnectorVendorRevocation): string {
  if (revocation.status === 'revoked') return 'vendor_revoked';
  if (revocation.status === 'nothing-to-revoke') return 'vendor_nothing_to_revoke';
  return revocation.reason === 'failed'
    ? 'vendor_revocation_failed'
    : 'vendor_offers_no_revocation';
}
