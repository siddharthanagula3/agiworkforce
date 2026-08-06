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
import {
  ConnectorOAuthStoreUnavailableError,
  createPendingAuthorization,
} from '@/lib/connectors/oauth-store';

/**
 * Start the hosted per-user OAuth flow for one connector.
 *
 * Browser-navigation endpoint (the directory's Connect button points here), so
 * failures redirect back to the connectors surface with a status flag rather
 * than returning JSON — the same shape /api/github/install/start uses. Native
 * clients that cannot follow a redirect chain pass `?mode=json` and receive
 * `{ authorizeUrl }` to open themselves.
 *
 * SECURITY PROPERTIES
 * - `state` is 32 random bytes, stored ONLY as its SHA-256 and bound to the
 *   signed-in user id at insert time. The callback compares the authenticated
 *   caller against the stored user.
 * - The PKCE `code_verifier` never leaves the server: it is encrypted into
 *   `connector_oauth_authorizations`, not into a cookie of any kind.
 * - `redirect_uri` comes from server-side configuration
 *   (`getConnectorOAuthRedirectUri`), never from this request's Host header, so
 *   a host-header injection cannot re-point the authorization code.
 * - A pending row is single-use and expires in 10 minutes.
 */
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
  if (!provider || !redirectUri) {
    // Honest unavailability: no OAuth app is registered for this provider in
    // this deployment (or the callback origin is unset), so there is nothing to
    // authorize against. Never start a flow that cannot complete.
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
      // A non-PKCE provider still gets a stored verifier row so the schema stays
      // uniform; it is simply never sent to the token endpoint.
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

  // The URL carries `state`; it is logged nowhere and only ever handed to the
  // authenticated user who owns the pending row.
  if (wantsJson) return NextResponse.json({ connectorId, authorizeUrl });
  return NextResponse.redirect(authorizeUrl);
}
