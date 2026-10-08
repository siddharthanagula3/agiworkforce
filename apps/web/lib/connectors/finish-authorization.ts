import 'server-only';

import type { NextRequest } from 'next/server';
import type { ConnectorOAuthCallbackStatus } from '@agiworkforce/cloud-contracts';
import { connectorsReleased } from '@agiworkforce/types';

import { logger } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/security-audit';
import {
  getConnectorOAuthProvider,
  isAllowedConnectorOAuthRedirectUri,
} from '@/lib/connectors/oauth-registry';
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

export interface ConnectorAuthorizationOutcome {
  returnPath: string;
  connectorId: string;
  status: ConnectorOAuthCallbackStatus;
}

export async function finishConnectorAuthorization(input: {
  request: NextRequest;
  userId: string;
  state: string;
  code: string | null;
  iss: string | undefined;
  providerError: string | null;
}): Promise<ConnectorAuthorizationOutcome> {
  const { request, userId, state, code, iss, providerError } = input;
  let pending;
  try {
    pending = await consumePendingAuthorization(state, userId);
  } catch (error) {
    if (error instanceof ConnectorOAuthStoreUnavailableError) {
      return { returnPath: '/connectors', connectorId: '', status: 'unavailable' };
    }
    throw error;
  }
  if (!pending) {
    logger.warn(
      '[connector-oauth] callback rejected: unknown, expired, replayed, or another account state',
    );
    return { returnPath: '/connectors', connectorId: '', status: 'invalid_state' };
  }

  if (!connectorsReleased()) {
    return {
      returnPath: pending.returnPath,
      connectorId: pending.connectorId,
      status: 'unavailable',
    };
  }

  if (!authorizationResponseIssuerMatches(pending, iss)) {
    logger.warn(
      { connectorId: pending.connectorId },
      '[connector-oauth] callback rejected: the response names a different issuer than the one recorded',
    );
    return { returnPath: pending.returnPath, connectorId: pending.connectorId, status: 'failed' };
  }

  if (providerError) {
    return { returnPath: pending.returnPath, connectorId: pending.connectorId, status: 'denied' };
  }
  if (!code || code.length > MAX_CODE_LENGTH) {
    return { returnPath: pending.returnPath, connectorId: pending.connectorId, status: 'failed' };
  }

  if (pending.mcpUrl) {
    const completion = await completeMcpAuthorization({ pending, state, code, iss });

    if (completion.status === 'error') {
      logger.warn(
        { connectorId: pending.connectorId, reason: completion.reason },
        '[connector-oauth] discovered-connector exchange failed',
      );
      return {
        returnPath: pending.returnPath,
        connectorId: pending.connectorId,
        status: COMPLETION_FAILURE_STATUS[completion.reason] ?? DEFAULT_COMPLETION_FAILURE_STATUS,
      };
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

    return {
      returnPath: pending.returnPath,
      connectorId: pending.connectorId,
      status: 'connected',
    };
  }

  const provider = getConnectorOAuthProvider(pending.connectorId);
  if (!provider || !isAllowedConnectorOAuthRedirectUri(pending.redirectUri)) {
    logger.warn(
      { connectorId: pending.connectorId },
      '[connector-oauth] callback rejected: provider configuration changed mid-flow',
    );
    return {
      returnPath: pending.returnPath,
      connectorId: pending.connectorId,
      status: 'unavailable',
    };
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
      return {
        returnPath: pending.returnPath,
        connectorId: pending.connectorId,
        status: 'unavailable',
      };
    }
    logger.warn(
      {
        connectorId: pending.connectorId,
        status: error instanceof ConnectorOAuthTokenError ? error.status : undefined,
        oauthError: error instanceof ConnectorOAuthTokenError ? error.oauthError : undefined,
      },
      '[connector-oauth] authorization code exchange failed',
    );
    return { returnPath: pending.returnPath, connectorId: pending.connectorId, status: 'failed' };
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

  return { returnPath: pending.returnPath, connectorId: pending.connectorId, status: 'connected' };
}
