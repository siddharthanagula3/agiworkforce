import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  CONNECTOR_OAUTH_RESULT_CONNECTOR_PARAM,
  CONNECTOR_OAUTH_RESULT_STATUS_PARAM,
  type ConnectorOAuthCallbackStatus,
} from '@agiworkforce/cloud-contracts';

import { getClerkAuthUser } from '@/lib/api-auth';
import { isAuthGateRefusal, unauthorizedResponseFor } from '@/lib/api-auth-response';
import { logger } from '@/lib/logger';
import { withPrivateNoStore } from '@/lib/private-cache-policy';
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
import { authorizationResponseIssuerMatches } from '@/lib/connectors/authorization-response';
import { canonicalResourceUri } from '@/lib/connectors/registry-authorization';

const MAX_CODE_LENGTH = 2048;
const COMPLETION_FAILURE_STATUS: Partial<
  Record<McpAuthorizationFailure, ConnectorOAuthCallbackStatus>
> = {
  'authorization-server-changed': 'reauthorize',
  'registration-rejected': 'registration_rejected',
};
const DEFAULT_COMPLETION_FAILURE_STATUS: ConnectorOAuthCallbackStatus = 'failed';

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  const providerError = url.searchParams.get('error');

  const redirectTo = (
    returnPath: string,
    connectorId: string,
    status: ConnectorOAuthCallbackStatus,
  ): NextResponse => {
    const target = new URL(sanitizeConnectorReturnPath(returnPath), request.url);
    if (connectorId) target.searchParams.set(CONNECTOR_OAUTH_RESULT_CONNECTOR_PARAM, connectorId);
    target.searchParams.set(CONNECTOR_OAUTH_RESULT_STATUS_PARAM, status);
    return NextResponse.redirect(target);
  };

  let userId: string;
  try {
    ({ userId } = await getClerkAuthUser(request));
  } catch (authError) {
    if (isAuthGateRefusal(authError)) {
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

  const iss = url.searchParams.get('iss') ?? undefined;
  if (!authorizationResponseIssuerMatches(pending, iss)) {
    logger.warn(
      { connectorId: pending.connectorId },
      '[connector-oauth] callback rejected: the response names a different issuer than the one recorded',
    );
    return redirectTo(pending.returnPath, pending.connectorId, 'failed');
  }

  if (providerError) {
    return redirectTo(pending.returnPath, pending.connectorId, 'denied');
  }
  if (!code || code.length > MAX_CODE_LENGTH) {
    return redirectTo(pending.returnPath, pending.connectorId, 'failed');
  }

  if (pending.mcpUrl) {
    const completion = await completeMcpAuthorization({ pending, state, code, iss });

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

  const resource = pending.resourceUrl ?? canonicalResourceUri(provider.mcpUrl);
  let grantedScopes: string[];
  try {
    const tokens = await exchangeAuthorizationCode({
      provider,
      code,
      codeVerifier: pending.codeVerifier || null,
      redirectUri: pending.redirectUri,
      requestedScopes: pending.requestedScopes,
      resource,
    });
    await upsertConnectorOAuthGrant(
      userId,
      pending.connectorId,
      {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenType: tokens.tokenType,
        grantedScopes: tokens.grantedScopes,
        accessTokenExpiresAt: tokens.accessTokenExpiresAt,
        tokenEndpoint: provider.tokenUrl,
        issuer: pending.issuer ?? null,
        resourceUrl: resource,
      },
      { accountLabel: tokens.accountLabel },
    );
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

export const GET = withPrivateNoStore(handleGet);
