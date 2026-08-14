/**
 * @file The two halves of a discovery-based connector authorization.
 *
 * `beginMcpAuthorization` runs discovery and produces the URL to send the user
 * to; `completeMcpAuthorization` redeems the code that comes back. Between them
 * sits one row in `connector_oauth_authorizations` holding the PKCE verifier and
 * the endpoints discovery settled on.
 *
 * Both delegate the protocol to `auth()` from `@modelcontextprotocol/client` and
 * confine themselves to storage, user identity, and translating failures into
 * outcomes a route can render. See `mcp-oauth-provider.ts` for why the SDK
 * drives rather than this module.
 */

import 'server-only';

import {
  auth,
  AuthorizationServerMismatchError,
  discoverOAuthServerInfo,
  OAuthError,
  RegistrationRejectedError,
} from '@modelcontextprotocol/client';

import { logger } from '@/lib/logger';
import { generateOAuthState } from '@/lib/connectors/pkce';
import {
  McpOAuthClientProvider,
  type McpOAuthProviderSeed,
} from '@/lib/connectors/mcp-oauth-provider';
import { deleteMcpOAuthClient } from '@/lib/connectors/mcp-oauth-clients';
import {
  createPendingAuthorization,
  upsertConnectorOAuthGrant,
  type PendingAuthorization,
} from '@/lib/connectors/oauth-store';

export type McpAuthorizationStart =
  | { status: 'redirect'; authorizationUrl: string; state: string }
  /**
   * Discovery ran but the server needs no authorization at all — an open MCP
   * server. The caller connects directly instead of showing a Connect button
   * that would send the user through a pointless consent screen.
   */
  | { status: 'no-authorization-required' }
  | { status: 'error'; reason: McpAuthorizationFailure; message: string };

export type McpAuthorizationFailure =
  /** The MCP server published no usable protected-resource / AS metadata. */
  | 'discovery-failed'
  /** No client identity could be obtained (no CIMD here, no DCR there). */
  | 'no-client-identity'
  /** The authorization server refused to register or recognise this client. */
  | 'registration-rejected'
  /** The MCP server moved to a different authorization server (SEP-2352). */
  | 'authorization-server-changed'
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

/**
 * Does this MCP server require authorization at all?
 *
 * Asked before starting a flow because an open server has no protected-resource
 * metadata and no `WWW-Authenticate` challenge; running `auth()` at one would
 * fail in a way that reads like a broken connector rather than "no login
 * needed". Returns false only on a clean "no authorization advertised" answer.
 */
export async function mcpServerRequiresAuthorization(mcpUrl: string): Promise<boolean> {
  try {
    const info = await discoverOAuthServerInfo(mcpUrl);
    return Boolean(info.resourceMetadata ?? info.authorizationServerMetadata);
  } catch {
    // Discovery failing is NOT evidence the server is open — a network fault
    // looks identical here. Assume authorization is required and let the real
    // flow produce a specific error.
    return true;
  }
}

export interface BeginMcpAuthorizationParams {
  userId: string;
  /** Catalog id, custom-connector id, or any stable per-server identifier. */
  connectorId: string;
  mcpUrl: string;
  /** Same-origin path to send the browser back to after the callback. */
  returnPath: string;
  /** Extra scopes to request beyond what the resource advertises. */
  scope?: string;
}

export async function beginMcpAuthorization(
  params: BeginMcpAuthorizationParams,
): Promise<McpAuthorizationStart> {
  const { userId, connectorId, mcpUrl, returnPath } = params;
  const state = generateOAuthState();
  const provider = new McpOAuthClientProvider({ mcpUrl, state });

  let result: Awaited<ReturnType<typeof auth>>;
  try {
    result = await auth(provider, {
      serverUrl: mcpUrl,
      ...(params.scope ? { scope: params.scope } : {}),
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
    // `auth()` reports AUTHORIZED without a redirect only when it already had a
    // usable token. This provider starts with none, so reaching here means the
    // server asked for nothing.
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
    // The SDK always uses S256; `plain` exists in the column only for the
    // registry path's older descriptors.
    codeChallengeMethod: 'S256',
    redirectUri: String(redirectUri),
    requestedScopes: [],
    returnPath,
    issuer: draft.issuer,
    authorizationEndpoint: draft.authorizationEndpoint,
    tokenEndpoint: draft.tokenEndpoint,
    resourceUrl: draft.resourceUrl,
    mcpUrl,
    clientId: draft.clientId,
    // Persisted so the callback leg can replay it. `auth()` refuses to redeem
    // an authorization code when it cannot read the issuer recorded here, so
    // omitting this fails every connector at the callback rather than at start.
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

/**
 * Redeem the authorization code for a discovered connector.
 *
 * Takes an ALREADY-CONSUMED pending row rather than consuming one itself. The
 * callback route owns that claim — it is where single-use is enforced and where
 * the row is checked against the signed-in account — and doing it twice would
 * either fail or, worse, split those checks across two places that could drift.
 */
export async function completeMcpAuthorization(input: {
  pending: PendingAuthorization;
  state: string;
  code: string;
  /** RFC 9207 `iss` from the callback query, when the server sent one. */
  iss?: string | undefined;
}): Promise<McpAuthorizationCompletion> {
  const { pending } = input;
  const mcpUrl = pending.mcpUrl;
  if (!mcpUrl) {
    // A pending row with no MCP URL belongs to the registry-configured broker,
    // not to discovery. Routing it here would exchange the code against the
    // wrong endpoints.
    return {
      status: 'error',
      reason: 'unexpected',
      message: 'This authorization did not come from a discovered MCP server.',
    };
  }

  const discoveryState = pending.discoveryState as
    | NonNullable<McpOAuthProviderSeed['discoveryState']>
    | null
    | undefined;

  if (!discoveryState) {
    // Pre-0116 rows carry no discovery state, and `auth()` will not redeem a
    // code without it. Saying so plainly beats surfacing the SDK's internal
    // "provider is broken" error to someone who just clicked Connect.
    return {
      status: 'error',
      reason: 'unexpected',
      message: 'This authorization was started before an upgrade. Please connect again.',
    };
  }

  const seed: McpOAuthProviderSeed = {
    codeVerifier: pending.codeVerifier,
    issuer: pending.issuer ?? null,
    discoveryState,
  };
  const provider = new McpOAuthClientProvider({ mcpUrl, state: input.state, seed });

  try {
    await auth(provider, {
      serverUrl: mcpUrl,
      authorizationCode: input.code,
      // Passed through to RFC 9207 §2.4 validation, which runs BEFORE the code
      // is redeemed. Omitting it would skip the authorization-server mix-up
      // defense entirely.
      ...(input.iss ? { iss: input.iss } : {}),
    });
  } catch (error) {
    const described = describeFailure(error);
    if (described.reason === 'registration-rejected' && pending.issuer) {
      // The client we presented is no longer recognised — most often a
      // dynamically registered client the vendor garbage-collected. Dropping it
      // makes the next attempt register afresh instead of failing identically
      // forever.
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

  await upsertConnectorOAuthGrant(pending.userId, pending.connectorId, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    tokenType: tokens.token_type ?? 'Bearer',
    // The scopes the server GRANTED, which may be narrower than requested.
    grantedScopes,
    accessTokenExpiresAt:
      typeof tokens.expires_in === 'number'
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : null,
    // Pinned from the start leg, not from a fresh discovery call: the endpoint
    // that issued this token is the only one a refresh may be sent to.
    tokenEndpoint: pending.tokenEndpoint ?? '',
    issuer: provider.issuer ?? pending.issuer ?? null,
    resourceUrl: pending.resourceUrl ?? null,
    mcpUrl,
  });

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
  /**
   * The MCP server now points at a DIFFERENT authorization server than the one
   * this grant was minted by (SEP-2352). The stored credential is not merely
   * stale — it is addressed to a party that is no longer the right audience, so
   * it must be discarded rather than refreshed.
   */
  | { status: 'authorization-server-changed' }
  | { status: 'failed'; message: string };

/**
 * Refresh a grant that was obtained through discovery.
 *
 * The registry path cannot do this: `refreshAccessToken` needs a provider
 * descriptor with a client id and secret, and a discovered connector has
 * neither — its client identity lives in `mcp_oauth_clients`, keyed by issuer.
 * Delegating to `auth()` means the refresh reuses exactly the client and issuer
 * the grant was created with, and gets the issuer-mismatch check for free.
 */
export async function refreshDiscoveredGrant(input: {
  mcpUrl: string;
  issuer: string | null;
  refreshToken: string;
  tokenType: string;
  grantedScopes: string[];
}): Promise<McpRefreshOutcome> {
  const provider = new McpOAuthClientProvider({
    mcpUrl: input.mcpUrl,
    // No redirect happens on a refresh, so this state is never presented
    // anywhere; it exists only to satisfy the provider's contract.
    state: generateOAuthState(),
    seed: {
      issuer: input.issuer,
      tokens: {
        access_token: '',
        refresh_token: input.refreshToken,
        token_type: input.tokenType,
        ...(input.grantedScopes.length > 0 ? { scope: input.grantedScopes.join(' ') } : {}),
      } as unknown as NonNullable<McpOAuthProviderSeed['tokens']>,
    },
  });

  try {
    await auth(provider, { serverUrl: input.mcpUrl });
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

  if (!tokens?.access_token) {
    return { status: 'failed', message: 'Refresh returned no access token.' };
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
