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

export async function mcpServerRequiresAuthorization(mcpUrl: string): Promise<boolean> {
  try {
    const info = await discoverOAuthServerInfo(mcpUrl);
    return Boolean(info.resourceMetadata ?? info.authorizationServerMetadata);
  } catch {
    return true;
  }
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
  const state = generateOAuthState();
  const provider = new McpOAuthClientProvider({ mcpUrl, state });

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
    requestedScopes: [],
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
    | NonNullable<McpOAuthProviderSeed['discoveryState']>
    | null
    | undefined;

  if (!discoveryState) {
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
      ...(input.iss ? { iss: input.iss } : {}),
    });
  } catch (error) {
    const described = describeFailure(error);
    if (described.reason === 'registration-rejected' && pending.issuer) {
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
    grantedScopes,
    accessTokenExpiresAt:
      typeof tokens.expires_in === 'number'
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : null,
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
   * stale, it is addressed to a party that is no longer the right audience, so
   * it must be discarded rather than refreshed.
   */
  | { status: 'authorization-server-changed' }
  | { status: 'failed'; message: string };

export async function refreshDiscoveredGrant(input: {
  mcpUrl: string;
  issuer: string | null;
  refreshToken: string;
  tokenType: string;
  grantedScopes: string[];
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
