import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { getClerkAuthUser } from '@/lib/api-auth';
import { unauthorizedResponseFor } from '@/lib/api-auth-response';
import { isMfaRequiredError } from '@/lib/mfa-policy-gate';
import { isIpNotAllowedError } from '@/lib/ip-allow-list-gate';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import {
  getConnectorOAuthProvider,
  isAllowedConnectorOAuthRedirectUri,
  sanitizeConnectorReturnPath,
} from '@/lib/connectors/oauth-registry';
import { OAUTH_STATE_RE } from '@/lib/connectors/pkce';
import {
  ConnectorOAuthStoreUnavailableError,
  consumePendingAuthorization,
  upsertConnectorOAuthGrant,
} from '@/lib/connectors/oauth-store';
import { ConnectorOAuthTokenError, exchangeAuthorizationCode } from '@/lib/connectors/oauth-client';
import {
  completeMcpAuthorization,
  type McpAuthorizationFailure,
} from '@/lib/connectors/mcp-discovery';

const MAX_CODE_LENGTH = 2048;
const COMPLETION_FAILURE_STATUS: Partial<Record<McpAuthorizationFailure, string>> = {
  'authorization-server-changed': 'reauthorize',
  'registration-rejected': 'registration_rejected',
};
const DEFAULT_COMPLETION_FAILURE_STATUS = 'failed';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  const providerError = url.searchParams.get('error');

  const redirectTo = (returnPath: string, connectorId: string, status: string): NextResponse => {
    const target = new URL(sanitizeConnectorReturnPath(returnPath), request.url);
    if (connectorId) target.searchParams.set('connector', connectorId);
    target.searchParams.set('status', status);
    return NextResponse.redirect(target);
  };

  let userId: string;
  try {
    ({ userId } = await getClerkAuthUser(request));
  } catch (authError) {
    if (isMfaRequiredError(authError) || isIpNotAllowedError(authError)) {
      return unauthorizedResponseFor(authError);
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirectTo', '/connectors');
    return NextResponse.redirect(loginUrl);
  }

  if (!state || !OAUTH_STATE_RE.test(state)) {
    logger.warn('[connector-oauth] callback rejected: malformed or missing state');
    return redirectTo('/connectors', '', 'invalid_state');
  }

  let pending;
  try {
    pending = await consumePendingAuthorization(state);
  } catch (error) {
    if (error instanceof ConnectorOAuthStoreUnavailableError) {
      return redirectTo('/connectors', '', 'unavailable');
    }
    throw error;
  }
  if (!pending) {
    logger.warn('[connector-oauth] callback rejected: unknown, expired, or replayed state');
    return redirectTo('/connectors', '', 'invalid_state');
  }

  if (pending.userId !== userId) {
    logger.warn(
      { connectorId: pending.connectorId },
      '[connector-oauth] callback rejected: state belongs to a different account',
    );
    return redirectTo(pending.returnPath, pending.connectorId, 'invalid_state');
  }

  if (providerError) {
    return redirectTo(pending.returnPath, pending.connectorId, 'denied');
  }
  if (!code || code.length > MAX_CODE_LENGTH) {
    return redirectTo(pending.returnPath, pending.connectorId, 'failed');
  }

  if (pending.mcpUrl) {
    const completion = await completeMcpAuthorization({
      pending,
      state,
      code,
      iss: url.searchParams.get('iss') ?? undefined,
    });

    if (completion.status === 'error') {
      logger.warn(
        { connectorId: pending.connectorId, reason: completion.reason },
        '[connector-oauth] discovered-connector exchange failed',
      );
      return redirectTo(
        pending.returnPath,
        pending.connectorId,
        COMPLETION_FAILURE_STATUS[completion.reason] ?? DEFAULT_COMPLETION_FAILURE_STATUS,
      );
    }

    await recordAuditEvent({
      userId,
      eventType: 'connector_added',
      request,
      detail: {
        resourceType: 'connector',
        connectorId: pending.connectorId,
        source: 'mcp-discovery',
        status: 'connected',
        scopes: completion.grantedScopes,
      },
    });

    return redirectTo(pending.returnPath, pending.connectorId, 'connected');
  }

  const provider = getConnectorOAuthProvider(pending.connectorId);
  if (!provider || !isAllowedConnectorOAuthRedirectUri(pending.redirectUri)) {
    logger.warn(
      { connectorId: pending.connectorId },
      '[connector-oauth] callback rejected: provider configuration changed mid-flow',
    );
    return redirectTo(pending.returnPath, pending.connectorId, 'unavailable');
  }

  let grantedScopes: string[];
  try {
    const tokens = await exchangeAuthorizationCode({
      provider,
      code,
      codeVerifier: pending.codeVerifier || null,
      redirectUri: pending.redirectUri,
      requestedScopes: pending.requestedScopes,
    });
    await upsertConnectorOAuthGrant(userId, pending.connectorId, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenType: tokens.tokenType,
      grantedScopes: tokens.grantedScopes,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      tokenEndpoint: provider.tokenUrl,
    });
    grantedScopes = tokens.grantedScopes;
  } catch (error) {
    if (error instanceof ConnectorOAuthStoreUnavailableError) {
      return redirectTo(pending.returnPath, pending.connectorId, 'unavailable');
    }
    logger.warn(
      {
        connectorId: pending.connectorId,
        status: error instanceof ConnectorOAuthTokenError ? error.status : undefined,
        oauthError: error instanceof ConnectorOAuthTokenError ? error.oauthError : undefined,
      },
      '[connector-oauth] authorization code exchange failed',
    );
    return redirectTo(pending.returnPath, pending.connectorId, 'failed');
  }

  await recordAuditEvent({
    userId,
    eventType: 'connector_added',
    request,
    detail: {
      resourceType: 'connector',
      connectorId: pending.connectorId,
      source: 'oauth',
      status: 'connected',
      scopes: grantedScopes,
    },
  });

  return redirectTo(pending.returnPath, pending.connectorId, 'connected');
}
