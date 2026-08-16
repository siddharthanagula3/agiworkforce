import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { getClerkAuthUser } from '@/lib/api-auth';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import {
  buildAuthorizationUrl,
  getConnectorOAuthProvider,
  getConnectorOAuthRedirectUri,
  sanitizeConnectorReturnPath,
} from '@/lib/connectors/oauth-registry';
import { generateOAuthState, generatePkcePair } from '@/lib/connectors/pkce';
import { beginMcpAuthorization } from '@/lib/connectors/mcp-discovery';
import { getMcpEndpoint } from '@/lib/connectors/mcp-endpoints';
import {
  ConnectorOAuthStoreUnavailableError,
  createPendingAuthorization,
} from '@/lib/connectors/oauth-store';

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
  } catch {
    if (wantsJson) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirectTo', returnPath);
    return NextResponse.redirect(loginUrl);
  }

  const fail = (status: string, httpStatus: number, message: string): NextResponse => {
    if (wantsJson) {
      return NextResponse.json({ error: message, connectorId, status }, { status: httpStatus });
    }
    const target = new URL(returnPath, request.url);
    target.searchParams.set('connector', connectorId);
    target.searchParams.set('status', status);
    return NextResponse.redirect(target);
  };

  const provider = getConnectorOAuthProvider(connectorId);
  const redirectUri = getConnectorOAuthRedirectUri();

  if (!provider) {
    const endpoint = getMcpEndpoint(connectorId);
    if (endpoint) {
      const started = await beginMcpAuthorization({
        userId,
        connectorId,
        mcpUrl: endpoint.url,
        returnPath,
      });

      if (started.status === 'redirect') {
        if (wantsJson) {
          return NextResponse.json({ connectorId, authorizeUrl: started.authorizationUrl });
        }
        return NextResponse.redirect(started.authorizationUrl);
      }

      if (started.status === 'no-authorization-required') {
        return fail('open', 200, 'This connector needs no authorization.');
      }

      return fail(
        started.reason === 'registration-rejected' || started.reason === 'no-client-identity'
          ? 'unavailable'
          : 'error',
        502,
        started.message,
      );
    }
  }

  if (!provider || !redirectUri) {
    return fail(
      'unavailable',
      501,
      'This connector has no OAuth application configured in this deployment.',
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
      return fail(
        'unavailable',
        503,
        'Connector authorization is not available in this environment.',
      );
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
