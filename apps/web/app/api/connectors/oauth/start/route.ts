import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { getClerkAuthUser } from '@/lib/api-auth';
import { unauthorizedResponseFor } from '@/lib/api-auth-response';
import { isMfaRequiredError } from '@/lib/mfa-policy-gate';
import { isIpNotAllowedError } from '@/lib/ip-allow-list-gate';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import {
  buildAuthorizationUrl,
  getConnectorOAuthProvider,
  getConnectorOAuthRedirectUri,
  sanitizeConnectorReturnPath,
} from '@/lib/connectors/oauth-registry';
import { generateOAuthState, generatePkcePair } from '@/lib/connectors/pkce';
import {
  beginMcpAuthorization,
  type McpAuthorizationFailure,
  type McpAuthorizationStart,
} from '@/lib/connectors/mcp-discovery';
import { getMcpEndpoint } from '@/lib/connectors/mcp-endpoints';
import { resolveDirectoryTarget } from '@/lib/connectors/mcp-directory-targets';
import {
  describeConnectorSetup,
  describeDiscoveredConnectorSetup,
} from '@/lib/connectors/oauth-setup';
import {
  CONNECTOR_TOKEN_STORAGE_UNAVAILABLE,
  isConnectorTokenStorageAvailable,
} from '@/lib/custom-connector-crypto';
import {
  ConnectorOAuthStoreUnavailableError,
  createPendingAuthorization,
} from '@/lib/connectors/oauth-store';

export const OAUTH_START_STATUS_NOT_CONFIGURED = 'not_configured';
export const OAUTH_START_STATUS_REGISTRATION_REJECTED = 'registration_rejected';
export const OAUTH_START_STATUS_REAUTHORIZE = 'reauthorize';
export const OAUTH_START_STATUS_ERROR = 'error';
export const OAUTH_START_STATUS_OPEN = 'open';
export const OAUTH_START_STATUS_UNAVAILABLE = 'unavailable';

const FAILURE_STATUS: Record<McpAuthorizationFailure, string> = {
  'no-client-identity': OAUTH_START_STATUS_NOT_CONFIGURED,
  'registration-rejected': OAUTH_START_STATUS_REGISTRATION_REJECTED,
  'authorization-server-changed': OAUTH_START_STATUS_REAUTHORIZE,
  'discovery-failed': OAUTH_START_STATUS_ERROR,
  unexpected: OAUTH_START_STATUS_ERROR,
};

const NOT_CONFIGURED_MESSAGE =
  'This connector has no OAuth application configured in this deployment.';
const BROKER_UNAVAILABLE_MESSAGE = 'Connector authorization is not available in this environment.';
const OPEN_SERVER_MESSAGE = 'This connector needs no authorization.';

interface DiscoveredServer {
  readonly mcpUrl: string;
  readonly name: string;
  readonly documentationUrl: string | null;
}

export function registrationRejectedMessage(serverName: string): string {
  return `${serverName} refused to register this app, so it cannot be connected here.`;
}

function failureMessage(
  started: Extract<McpAuthorizationStart, { status: 'error' }>,
  connectorId: string,
  server: DiscoveredServer,
): string {
  if (started.reason === 'registration-rejected') return registrationRejectedMessage(server.name);
  if (started.reason === 'no-client-identity') {
    return describeDiscoveredConnectorSetup(connectorId, server.name)?.message ?? started.message;
  }
  return started.message;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  const url = new URL(request.url);
  const connectorId = url.searchParams.get('connectorId')?.trim() ?? '';
  const returnPath = sanitizeConnectorReturnPath(url.searchParams.get('returnPath'));
  const wantsJson = url.searchParams.get('mode') === 'json';

  let userId: string;
  try {
    ({ userId } = await getClerkAuthUser(request));
  } catch (authError) {
    if (isMfaRequiredError(authError) || isIpNotAllowedError(authError)) {
      return unauthorizedResponseFor(authError);
    }
    if (wantsJson) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirectTo', returnPath);
    return NextResponse.redirect(loginUrl);
  }

  const provider = getConnectorOAuthProvider(connectorId);
  const redirectUri = getConnectorOAuthRedirectUri();
  const endpoint = provider ? null : getMcpEndpoint(connectorId);
  const directory = provider || endpoint ? null : await resolveDirectoryTarget(connectorId);
  const discovered: DiscoveredServer | null = endpoint
    ? { mcpUrl: endpoint.url, name: connectorId, documentationUrl: null }
    : directory
      ? {
          mcpUrl: directory.mcpUrl,
          name: directory.name,
          documentationUrl: directory.documentationUrl,
        }
      : null;

  const fail = (status: string, httpStatus: number, message: string): NextResponse => {
    if (wantsJson) {
      return NextResponse.json(
        {
          error: message,
          message,
          connectorId,
          status,
          ...(discovered
            ? { connectorName: discovered.name, documentationUrl: discovered.documentationUrl }
            : {}),
        },
        { status: httpStatus },
      );
    }
    const target = new URL(returnPath, request.url);
    target.searchParams.set('connector', connectorId);
    target.searchParams.set('status', status);
    return NextResponse.redirect(target);
  };

  if ((provider || discovered) && !isConnectorTokenStorageAvailable()) {
    return fail(OAUTH_START_STATUS_UNAVAILABLE, 503, CONNECTOR_TOKEN_STORAGE_UNAVAILABLE);
  }

  if (!provider && discovered) {
    const started = await beginMcpAuthorization({
      userId,
      connectorId,
      mcpUrl: discovered.mcpUrl,
      returnPath,
    });

    if (started.status === 'redirect') {
      if (wantsJson) {
        return NextResponse.json({ connectorId, authorizeUrl: started.authorizationUrl });
      }
      return NextResponse.redirect(started.authorizationUrl);
    }

    if (started.status === 'no-authorization-required') {
      return fail(OAUTH_START_STATUS_OPEN, 200, OPEN_SERVER_MESSAGE);
    }

    return fail(
      FAILURE_STATUS[started.reason],
      502,
      failureMessage(started, connectorId, discovered),
    );
  }

  if (!provider || !redirectUri) {
    return fail(
      OAUTH_START_STATUS_NOT_CONFIGURED,
      501,
      describeConnectorSetup(connectorId)?.message ?? NOT_CONFIGURED_MESSAGE,
    );
  }

  const state = generateOAuthState();
  const pkce = provider.usePkce ? generatePkcePair() : null;

  try {
    await createPendingAuthorization({
      userId,
      connectorId,
      state,
      codeVerifier: pkce?.verifier ?? '',
      codeChallengeMethod: pkce ? 'S256' : 'plain',
      redirectUri,
      requestedScopes: provider.scopes,
      returnPath,
    });
  } catch (error) {
    if (error instanceof ConnectorOAuthStoreUnavailableError) {
      logger.warn(
        { connectorId },
        '[connector-oauth] broker tables are not migrated; refusing to start a flow',
      );
      return fail(OAUTH_START_STATUS_UNAVAILABLE, 503, BROKER_UNAVAILABLE_MESSAGE);
    }
    throw error;
  }

  const authorizeUrl = buildAuthorizationUrl({
    provider,
    redirectUri,
    state,
    codeChallenge: pkce?.challenge ?? null,
  });

  if (wantsJson) return NextResponse.json({ connectorId, authorizeUrl });
  return NextResponse.redirect(authorizeUrl);
}
