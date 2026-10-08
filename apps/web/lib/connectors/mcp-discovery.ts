import 'server-only';

import {
  auth,
  AuthorizationServerMismatchError,
  discoverAuthorizationServerMetadata,
  discoverOAuthProtectedResourceMetadata,
  discoverOAuthServerInfo,
  IssuerMismatchError,
  OAuthError,
  RegistrationRejectedError,
  selectClientAuthMethod,
  type AuthorizationServerMetadata,
  type FetchLike,
} from '@modelcontextprotocol/client';

import { logger } from '@/lib/logger';
import { createDeadline } from '@/lib/url-fetch/guarded-fetch';
import { TOKEN_REQUEST_TIMEOUT_MS } from '@/lib/connectors/oauth-client';
import { generateOAuthState } from '@/lib/connectors/pkce';
import { getCustomConnectorOAuthClient } from '@/lib/connectors/mcp-custom-connections';
import { accountLabelFromIdToken } from '@/lib/connectors/accounts';
import {
  McpOAuthClientProvider,
  McpPkceUnsupportedError,
  type McpOAuthProviderSeed,
  type McpSuppliedOAuthClient,
} from '@/lib/connectors/mcp-oauth-provider';
import { McpOAuthEgressRefusedError, mcpOAuthFetch } from '@/lib/connectors/mcp-oauth-fetch';
import { deleteMcpOAuthClient, getMcpOAuthClient } from '@/lib/connectors/mcp-oauth-clients';
import {
  createPendingAuthorization,
  upsertConnectorOAuthGrant,
  type PendingAuthorization,
} from '@/lib/connectors/oauth-store';
import {
  getConnectorScopeCeiling,
  isConnectorScopeCeilingEnforced,
} from '@/lib/connectors/oauth-scope-allowlist';

export type McpAuthorizationStart =
  | { status: 'redirect'; authorizationUrl: string; state: string }
  /**
   * Discovery ran but the server needs no authorization at all, an open MCP
   * server. The caller connects directly instead of showing a Connect button
   * that would send the user through a pointless consent screen.
   */
  | { status: 'no-authorization-required' }
  | { status: 'error'; reason: McpAuthorizationFailure; message: string };

export type McpAuthorizationFailure =
  | 'discovery-failed'
  /** No client identity could be obtained (no CIMD here, no DCR there). */
  | 'no-client-identity'
  /** The authorization server refused to register or recognise this client. */
  | 'registration-rejected'
  /** The MCP server moved to a different authorization server (SEP-2352). */
  | 'authorization-server-changed'
  | 'pkce-unsupported'
  | 'issuer-mismatch'
  | 'unexpected';

function describeFailure(error: unknown): {
  reason: McpAuthorizationFailure;
  message: string;
} {
  if (error instanceof AuthorizationServerMismatchError) {
    return {
      reason: 'authorization-server-changed',
      message:
        'This server now uses a different authorization server than the one your existing ' +
        'authorization was issued by. Reconnect to authorize against the new one.',
    };
  }
  if (error instanceof McpPkceUnsupportedError) {
    return { reason: 'pkce-unsupported', message: error.message };
  }
  if (error instanceof IssuerMismatchError) {
    return {
      reason: 'issuer-mismatch',
      message:
        'The authorization response did not come from the authorization server this connection ' +
        'was started with, so it was discarded. Connect again.',
    };
  }
  if (error instanceof McpOAuthEgressRefusedError) {
    return { reason: 'discovery-failed', message: error.message };
  }
  if (error instanceof RegistrationRejectedError) {
    return {
      reason: 'registration-rejected',
      message:
        'The provider refused to register this application. It may require a pre-registered ' +
        'OAuth app rather than accepting a client that registers itself.',
    };
  }
  if (error instanceof OAuthError) {
    return { reason: 'discovery-failed', message: error.message };
  }
  return {
    reason: 'unexpected',
    message: error instanceof Error ? error.message : 'Authorization could not be started.',
  };
}

export async function mcpServerPublishesProtectedResource(mcpUrl: string): Promise<boolean> {
  try {
    await discoverOAuthProtectedResourceMetadata(mcpUrl, undefined, mcpOAuthFetch);
    return true;
  } catch {
    return false;
  }
}

export async function mcpServerRequiresAuthorization(mcpUrl: string): Promise<boolean> {
  try {
    const info = await discoverOAuthServerInfo(mcpUrl, { fetchFn: mcpOAuthFetch });
    return Boolean(info.resourceMetadata ?? info.authorizationServerMetadata);
  } catch {
    return true;
  }
}

/**
 * Discovery hands the SDK the resource's whole advertised scope set, writes
 * included, so a connector with a documented ceiling was asking for more than
 * the ceiling permits on the only path this deployment can actually use. The
 * request is narrowed to the ceiling here; an enforced ceiling that intersects
 * nothing the resource advertises is a stale ceiling, and asking for everything
 * instead is the failure this exists to prevent, so it stops.
 */
async function ceilingScopeFor(
  connectorId: string,
  mcpUrl: string,
): Promise<{ scope: string } | { error: string } | null> {
  if (!isConnectorScopeCeilingEnforced(connectorId)) return null;
  const ceiling = getConnectorScopeCeiling(connectorId);
  if (ceiling === null || typeof ceiling === 'string') return null;
  if (ceiling.length === 0) return null;

  let advertised: readonly string[] | undefined;
  try {
    const info = await discoverOAuthServerInfo(mcpUrl, { fetchFn: mcpOAuthFetch });
    advertised =
      info.resourceMetadata?.scopes_supported ?? info.authorizationServerMetadata?.scopes_supported;
  } catch {
    advertised = undefined;
  }
  if (!advertised || advertised.length === 0) return { scope: ceiling.join(' ') };

  const permitted = new Set(ceiling);
  const granted = advertised.filter((scope) => permitted.has(scope));
  if (granted.length === 0) {
    return {
      error:
        'This connector has a documented permission ceiling that matches nothing the provider ' +
        'offers, so authorization would have to ask for more access than the ceiling allows.',
    };
  }
  return { scope: granted.join(' ') };
}

export interface BeginMcpAuthorizationParams {
  userId: string;
  connectorId: string;
  mcpUrl: string;
  returnPath: string;
  scope?: string;
}

export async function beginMcpAuthorization(
  params: BeginMcpAuthorizationParams,
): Promise<McpAuthorizationStart> {
  const { userId, connectorId, mcpUrl, returnPath } = params;
  let scope = params.scope;
  if (!scope) {
    const ceiling = await ceilingScopeFor(connectorId, mcpUrl);
    if (ceiling && 'error' in ceiling) {
      return { status: 'error', reason: 'no-client-identity', message: ceiling.error };
    }
    if (ceiling) scope = ceiling.scope;
  }
  const state = generateOAuthState();
  const provider = new McpOAuthClientProvider({
    mcpUrl,
    state,
    refuseWithoutPkce: true,
    client: await getCustomConnectorOAuthClient(userId, connectorId),
  });

  if (!provider.redirectUrl) {
    return {
      status: 'error',
      reason: 'no-client-identity',
      message:
        'This deployment has no public HTTPS origin configured, so it cannot publish a client ' +
        'identity or receive an OAuth callback. Set CONNECTOR_OAUTH_REDIRECT_BASE_URL to a public ' +
        'HTTPS URL.',
    };
  }

  let result: Awaited<ReturnType<typeof auth>>;
  try {
    result = await auth(provider, {
      serverUrl: mcpUrl,
      fetchFn: mcpOAuthFetch,
      ...(scope ? { scope } : {}),
    });
  } catch (error) {
    const described = describeFailure(error);
    logger.warn(
      { connectorId, reason: described.reason },
      '[mcp-discovery] could not start authorization',
    );
    return { status: 'error', ...described };
  }

  if (result === 'AUTHORIZED') {
    return { status: 'no-authorization-required' };
  }

  const draft = provider.pendingDraft;
  if (!draft) {
    return {
      status: 'error',
      reason: 'unexpected',
      message: 'Authorization was started but produced no URL to send you to.',
    };
  }

  const redirectUri = provider.redirectUrl;
  if (!redirectUri) {
    return {
      status: 'error',
      reason: 'no-client-identity',
      message:
        'This deployment has no HTTPS origin configured, so it cannot receive an OAuth callback. ' +
        'Set CONNECTOR_OAUTH_REDIRECT_BASE_URL.',
    };
  }

  await createPendingAuthorization({
    userId,
    connectorId,
    state: draft.state,
    codeVerifier: draft.codeVerifier,
    codeChallengeMethod: 'S256',
    redirectUri: String(redirectUri),
    requestedScopes: scope ? scope.split(/\s+/).filter(Boolean) : [],
    returnPath,
    issuer: draft.issuer,
    authorizationEndpoint: draft.authorizationEndpoint,
    tokenEndpoint: draft.tokenEndpoint,
    resourceUrl: draft.resourceUrl,
    mcpUrl,
    clientId: draft.clientId,
    discoveryState: provider.discoverySnapshot,
  });

  logger.info(
    { connectorId, issuer: draft.issuer, registrationMethod: provider.registrationMethod },
    '[mcp-discovery] authorization started from discovered metadata',
  );

  return { status: 'redirect', authorizationUrl: draft.authorizationUrl, state: draft.state };
}

export type McpAuthorizationCompletion =
  | { status: 'connected'; connectorId: string; grantedScopes: string[] }
  | { status: 'error'; reason: McpAuthorizationFailure; message: string };

export async function completeMcpAuthorization(input: {
  pending: PendingAuthorization;
  state: string;
  code: string;
  iss?: string | undefined;
}): Promise<McpAuthorizationCompletion> {
  const { pending } = input;
  const mcpUrl = pending.mcpUrl;
  if (!mcpUrl) {
    return {
      status: 'error',
      reason: 'unexpected',
      message: 'This authorization did not come from a discovered MCP server.',
    };
  }

  const discoveryState = pending.discoveryState as
    NonNullable<McpOAuthProviderSeed['discoveryState']> | null | undefined;

  if (!discoveryState) {
    return {
      status: 'error',
      reason: 'unexpected',
      message: 'This authorization was started before an upgrade. Please connect again.',
    };
  }

  const client = await getCustomConnectorOAuthClient(pending.userId, pending.connectorId);
  const seed: McpOAuthProviderSeed = {
    codeVerifier: pending.codeVerifier,
    issuer: pending.issuer ?? null,
    discoveryState,
  };
  const provider = new McpOAuthClientProvider({
    mcpUrl,
    state: input.state,
    seed,
    client,
  });

  try {
    await auth(provider, {
      serverUrl: mcpUrl,
      fetchFn: mcpOAuthFetch,
      authorizationCode: input.code,
      ...(input.iss === undefined ? {} : { iss: input.iss }),
    });
  } catch (error) {
    const described = describeFailure(error);
    if (described.reason === 'registration-rejected' && pending.issuer && !client) {
      await deleteMcpOAuthClient(pending.issuer).catch(() => undefined);
    }
    logger.warn(
      { connectorId: pending.connectorId, reason: described.reason },
      '[mcp-discovery] authorization could not be completed',
    );
    return { status: 'error', ...described };
  }

  const tokens = provider.resolvedTokens as
    | {
        access_token: string;
        refresh_token?: string;
        token_type?: string;
        expires_in?: number;
        scope?: string;
        id_token?: string;
      }
    | undefined;

  if (!tokens?.access_token) {
    return {
      status: 'error',
      reason: 'unexpected',
      message: 'The provider completed authorization without returning an access token.',
    };
  }

  const grantedScopes = tokens.scope ? tokens.scope.split(/\s+/).filter(Boolean) : [];

  await upsertConnectorOAuthGrant(
    pending.userId,
    pending.connectorId,
    {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      tokenType: tokens.token_type ?? 'Bearer',
      grantedScopes,
      accessTokenExpiresAt:
        typeof tokens.expires_in === 'number'
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : null,
      tokenEndpoint: pending.tokenEndpoint ?? '',
      issuer: provider.issuer ?? pending.issuer ?? null,
      resourceUrl: pending.resourceUrl ?? null,
      mcpUrl,
    },
    { accountLabel: accountLabelFromIdToken(tokens.id_token) },
  );

  logger.info(
    { connectorId: pending.connectorId, issuer: provider.issuer },
    '[mcp-discovery] connector authorized',
  );

  return { status: 'connected', connectorId: pending.connectorId, grantedScopes };
}

export type McpRefreshOutcome =
  | {
      status: 'refreshed';
      accessToken: string;
      refreshToken: string | null;
      tokenType: string;
      grantedScopes: string[];
      accessTokenExpiresAt: Date | null;
    }
  | { status: 'authorization-server-changed' }
  | { status: 'rejected' }
  | { status: 'failed'; message: string };

function sameIssuer(left: string, right: string): boolean {
  return left.replace(/\/$/, '') === right.replace(/\/$/, '');
}

export async function refreshDiscoveredGrant(input: {
  mcpUrl: string;
  issuer: string | null;
  refreshToken: string;
  tokenType: string;
  grantedScopes: string[];
  client?: McpSuppliedOAuthClient | null;
}): Promise<McpRefreshOutcome> {
  if (!input.issuer) {
    return {
      status: 'failed',
      message: 'This grant has no recorded issuer. Please connect again.',
    };
  }

  const provider = new McpOAuthClientProvider({
    mcpUrl: input.mcpUrl,
    state: generateOAuthState(),
    client: input.client ?? null,
    seed: {
      issuer: input.issuer,
      tokens: {
        issuer: input.issuer,
        access_token: '',
        refresh_token: input.refreshToken,
        token_type: input.tokenType,
        ...(input.grantedScopes.length > 0 ? { scope: input.grantedScopes.join(' ') } : {}),
      },
    },
  });

  const deadline = createDeadline(TOKEN_REQUEST_TIMEOUT_MS);
  let result: Awaited<ReturnType<typeof auth>>;
  try {
    result = await auth(provider, {
      serverUrl: input.mcpUrl,
      fetchFn: (url, init) =>
        mcpOAuthFetch(url, {
          ...init,
          signal: init?.signal ? AbortSignal.any([init.signal, deadline.signal]) : deadline.signal,
        }),
    });
  } catch (error) {
    if (error instanceof AuthorizationServerMismatchError) {
      logger.warn(
        { mcpUrl: input.mcpUrl },
        '[mcp-discovery] authorization server changed under a live grant; forcing reconnect',
      );
      return { status: 'authorization-server-changed' };
    }
    return {
      status: 'failed',
      message: error instanceof Error ? error.message : 'Token refresh failed.',
    };
  } finally {
    deadline.release();
  }

  if (provider.issuer !== null && !sameIssuer(provider.issuer, input.issuer)) {
    logger.warn(
      { mcpUrl: input.mcpUrl },
      '[mcp-discovery] authorization server changed under a live grant; forcing reconnect',
    );
    return { status: 'authorization-server-changed' };
  }

  const tokens = provider.resolvedTokens as
    | {
        access_token?: string;
        refresh_token?: string;
        token_type?: string;
        expires_in?: number;
        scope?: string;
      }
    | undefined;

  if (result !== 'AUTHORIZED' || !tokens?.access_token) {
    return tokens?.refresh_token
      ? { status: 'failed', message: 'The authorization server did not refresh the token.' }
      : { status: 'rejected' };
  }

  return {
    status: 'refreshed',
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    tokenType: tokens.token_type ?? input.tokenType,
    grantedScopes: tokens.scope ? tokens.scope.split(/\s+/).filter(Boolean) : input.grantedScopes,
    accessTokenExpiresAt:
      typeof tokens.expires_in === 'number'
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : null,
  };
}

const REVOCATION_TIMEOUT_MS = 5_000;

export interface DiscoveredRevocationToken {
  token: string;
  tokenTypeHint: 'access_token' | 'refresh_token';
}

export type DiscoveredRevocationOutcome =
  | { status: 'revoked' }
  | { status: 'unsupported'; manageUrl: string | null }
  | { status: 'failed'; manageUrl: string | null };

function httpsUrlOrNull(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

async function revocationClient(
  issuer: string,
  supplied: McpSuppliedOAuthClient | null,
): Promise<McpSuppliedOAuthClient | null> {
  if (supplied) return supplied;
  try {
    const stored = await getMcpOAuthClient(issuer);
    return stored ? { clientId: stored.clientId, clientSecret: stored.clientSecret } : null;
  } catch {
    return null;
  }
}

/**
 * The SDK parses both metadata shapes loosely, so RFC 7009 and RFC 8414 fields
 * survive on the OpenID variant too; only its declared type omits them.
 */
type RevocationServerMetadata = AuthorizationServerMetadata & {
  revocation_endpoint?: string;
  revocation_endpoint_auth_methods_supported?: string[];
  service_documentation?: string;
};

async function postRevocation(
  endpoint: string,
  metadata: RevocationServerMetadata,
  client: McpSuppliedOAuthClient,
  credential: DiscoveredRevocationToken,
  fetchFn: FetchLike,
): Promise<boolean> {
  const form = new URLSearchParams({
    token: credential.token,
    token_type_hint: credential.tokenTypeHint,
  });
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  const method = selectClientAuthMethod(
    {
      client_id: client.clientId,
      ...(client.clientSecret ? { client_secret: client.clientSecret } : {}),
    },
    metadata.revocation_endpoint_auth_methods_supported ??
      metadata.token_endpoint_auth_methods_supported ??
      [],
  );
  if (method === 'client_secret_basic' && client.clientSecret) {
    headers['Authorization'] = `Basic ${Buffer.from(
      `${encodeURIComponent(client.clientId)}:${encodeURIComponent(client.clientSecret)}`,
    ).toString('base64')}`;
  } else {
    form.set('client_id', client.clientId);
    if (method === 'client_secret_post' && client.clientSecret) {
      form.set('client_secret', client.clientSecret);
    }
  }
  try {
    const response = await fetchFn(endpoint, { method: 'POST', headers, body: form });
    await response.body?.cancel().catch(() => undefined);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * RFC 7009 revocation for a grant minted by MCP discovery. The first token is
 * the one that decides the outcome: revoking the refresh token ends the grant,
 * and an authorization server may refuse to revoke access tokens on their own
 * (RFC 7009 §2.2.1), so a refusal of the companion access token is not a
 * failure to disconnect.
 */
export async function revokeDiscoveredGrant(input: {
  issuer: string | null;
  client: McpSuppliedOAuthClient | null;
  tokens: readonly DiscoveredRevocationToken[];
}): Promise<DiscoveredRevocationOutcome> {
  const [primary, ...companions] = input.tokens;
  if (!input.issuer || !primary) return { status: 'failed', manageUrl: null };

  const deadline = createDeadline(REVOCATION_TIMEOUT_MS);
  const fetchFn: FetchLike = (url, init) =>
    mcpOAuthFetch(url, {
      ...init,
      signal: init?.signal ? AbortSignal.any([init.signal, deadline.signal]) : deadline.signal,
    });
  try {
    let metadata: RevocationServerMetadata | undefined;
    try {
      metadata = await discoverAuthorizationServerMetadata(input.issuer, { fetchFn });
    } catch {
      return { status: 'failed', manageUrl: null };
    }
    const manageUrl = httpsUrlOrNull(metadata?.service_documentation);
    const endpoint = httpsUrlOrNull(metadata?.revocation_endpoint);
    if (!metadata || !endpoint) return { status: 'unsupported', manageUrl };

    const client = await revocationClient(input.issuer, input.client);
    if (!client) return { status: 'failed', manageUrl };

    const revoked = await postRevocation(endpoint, metadata, client, primary, fetchFn);
    for (const companion of companions) {
      await postRevocation(endpoint, metadata, client, companion, fetchFn);
    }
    return revoked ? { status: 'revoked' } : { status: 'failed', manageUrl };
  } finally {
    deadline.release();
  }
}
