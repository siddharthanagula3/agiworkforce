import 'server-only';

import { resolveCloudChatSurface } from '@/lib/free-chat-surface-policy';
import { NextRequest, NextResponse } from 'next/server';
import {
  CONNECTOR_OAUTH_RESULT_CONNECTOR_PARAM,
  CONNECTOR_OAUTH_RESULT_STATUS_PARAM,
  connectorCredentialsPath,
  type ConnectorErrorResponse,
  type ConnectorOAuthStartResponse,
  type ConnectorOAuthStartStatus,
} from '@agiworkforce/cloud-contracts';

import { isAuthGateRefusal, unauthorizedResponseFor } from '@/lib/api-auth-response';
import { logger } from '@/lib/logger';
import { withPrivateNoStore } from '@/lib/private-cache-policy';
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
import {
  sensitiveDataConnector,
  sensitiveDataRegionRefusal,
} from '@/lib/connectors/sensitive-data-connectors';
import { CONNECTORS } from '@/features/connectors/data/connectors';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { evaluateConnectorPolicyForUser } from '@/lib/services/connector-policy-gate';
import {
  findDirectoryTargetByRemoteUrl,
  resolveDirectoryTarget,
} from '@/lib/connectors/mcp-directory-targets';
import { resolveConnectorCredentialSpec } from '@/lib/connectors/mcp-credential-spec';
import { findUserCustomConnectorByServerId } from '@/lib/user-connector-tools';
import { buildSettingsBrowseHash } from '@/features/directory/routing';
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
  markAppReturn,
  createPendingAuthorization,
  listConnectorAccounts,
} from '@/lib/connectors/oauth-store';
import { scopeEscalation } from '@/lib/connectors/scopes-escalation';
import { resolveRegistryAuthorization } from '@/lib/connectors/registry-authorization';
import { McpPkceUnsupportedError } from '@/lib/connectors/mcp-oauth-provider';
import { CONNECTOR_OAUTH_APP_RETURN_PARAM } from '@agiworkforce/cloud-contracts';
import { stateOfAuthorizeUrl } from '@/lib/connectors/app-handoff';

export const OAUTH_START_STATUS_NOT_CONFIGURED: ConnectorOAuthStartStatus = 'not_configured';
export const OAUTH_START_STATUS_REGISTRATION_REJECTED: ConnectorOAuthStartStatus =
  'registration_rejected';
export const OAUTH_START_STATUS_REAUTHORIZE: ConnectorOAuthStartStatus = 'reauthorize';
export const OAUTH_START_STATUS_ERROR: ConnectorOAuthStartStatus = 'error';
export const OAUTH_START_STATUS_OPEN: ConnectorOAuthStartStatus = 'open';
export const OAUTH_START_STATUS_UNAVAILABLE: ConnectorOAuthStartStatus = 'unavailable';
export const OAUTH_START_STATUS_CREDENTIAL: ConnectorOAuthStartStatus = 'credential';
export const OAUTH_START_STATUS_POLICY_BLOCKED: ConnectorOAuthStartStatus = 'policy_blocked';
export const OAUTH_START_STATUS_SCOPE_RECONSENT: ConnectorOAuthStartStatus = 'scope_reconsent';

const CONNECTORS_PATH = '/connectors';
const CREDENTIAL_HEADER_PLACEMENT = 'header';
const DIRECTORY_OPEN_AUTH_MODE = 'none';

const FAILURE_STATUS: Record<McpAuthorizationFailure, ConnectorOAuthStartStatus> = {
  'no-client-identity': OAUTH_START_STATUS_NOT_CONFIGURED,
  'registration-rejected': OAUTH_START_STATUS_REGISTRATION_REJECTED,
  'authorization-server-changed': OAUTH_START_STATUS_REAUTHORIZE,
  'discovery-failed': OAUTH_START_STATUS_ERROR,
  'pkce-unsupported': OAUTH_START_STATUS_ERROR,
  'issuer-mismatch': OAUTH_START_STATUS_ERROR,
  unexpected: OAUTH_START_STATUS_ERROR,
};

function connectorDisplayName(connectorId: string): string {
  return CONNECTORS.find((connector) => connector.id === connectorId)?.name ?? connectorId;
}

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

function authorizationServerChangedMessage(serverName: string): string {
  return (
    `${serverName} now signs in through a different authorization server than the one this ` +
    'deployment registered its app with, so it cannot be connected until that app is registered again.'
  );
}

async function resolveCredentialReconnectTarget(
  userId: string,
  connectorId: string,
): Promise<{ connectorId: string; name: string } | null> {
  const row = await findUserCustomConnectorByServerId(userId, connectorId);
  if (!row) return null;
  const target = await findDirectoryTargetByRemoteUrl(row.url);
  if (!target) return null;
  const spec = await resolveConnectorCredentialSpec(target);
  if (spec.placement !== CREDENTIAL_HEADER_PLACEMENT) return null;
  return { connectorId: target.connectorId, name: target.name };
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

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  const url = new URL(request.url);
  const connectorId = url.searchParams.get('connectorId')?.trim() ?? '';
  const returnPath = sanitizeConnectorReturnPath(url.searchParams.get('returnPath'));
  const wantsJson = url.searchParams.get('mode') === 'json';
  const wantsAppReturn =
    wantsJson && url.searchParams.get(CONNECTOR_OAUTH_APP_RETURN_PARAM) === '1';
  const appHandoff = async (authorizeUrl: string): Promise<{ appReturn?: true }> => {
    if (!wantsAppReturn) return {};
    const state = stateOfAuthorizeUrl(authorizeUrl);
    return state && (await markAppReturn(userId, state)) ? { appReturn: true } : {};
  };

  let userId: string;
  let db: DatabaseAdapter;
  let organizationId: string | null;
  try {
    ({ db, userId, organizationId } = await getUserScopedDb(request));
  } catch (authError) {
    if (isAuthGateRefusal(authError)) {
      return unauthorizedResponseFor(authError);
    }
    if (wantsJson) {
      return NextResponse.json(
        { error: 'Authentication required' } satisfies ConnectorErrorResponse,
        { status: 401 },
      );
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirectTo', returnPath);
    return NextResponse.redirect(loginUrl);
  }

  const credentialTarget = await resolveCredentialReconnectTarget(userId, connectorId);
  if (credentialTarget) {
    const settingsHref = `${CONNECTORS_PATH}${buildSettingsBrowseHash('connectors', credentialTarget.connectorId)}`;
    if (wantsJson) {
      return NextResponse.json({
        connectorId,
        status: OAUTH_START_STATUS_CREDENTIAL,
        connectorName: credentialTarget.name,
        settingsHref,
        credentialsPath: connectorCredentialsPath(credentialTarget.connectorId),
      } satisfies ConnectorOAuthStartResponse);
    }
    return NextResponse.redirect(new URL(settingsHref, request.url));
  }

  const provider = getConnectorOAuthProvider(connectorId);
  const redirectUri = getConnectorOAuthRedirectUri();
  const endpoint = provider ? null : getMcpEndpoint(connectorId);
  const directory = provider || endpoint ? null : await resolveDirectoryTarget(connectorId);
  const custom =
    provider || endpoint || directory
      ? null
      : await findUserCustomConnectorByServerId(userId, connectorId);
  const discovered: DiscoveredServer | null = endpoint
    ? { mcpUrl: endpoint.url, name: connectorId, documentationUrl: null }
    : directory
      ? {
          mcpUrl: directory.mcpUrl,
          name: directory.name,
          documentationUrl: directory.documentationUrl,
        }
      : custom
        ? { mcpUrl: custom.url, name: custom.name, documentationUrl: null }
        : null;

  const fail = (
    status: ConnectorOAuthStartStatus,
    httpStatus: number,
    message: string,
  ): NextResponse => {
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
        } satisfies ConnectorOAuthStartResponse,
        { status: httpStatus },
      );
    }
    const target = new URL(returnPath, request.url);
    target.searchParams.set(CONNECTOR_OAUTH_RESULT_CONNECTOR_PARAM, connectorId);
    target.searchParams.set(CONNECTOR_OAUTH_RESULT_STATUS_PARAM, status);
    return NextResponse.redirect(target);
  };

  if (!provider && directory && directory.record.authMode === DIRECTORY_OPEN_AUTH_MODE) {
    return fail(OAUTH_START_STATUS_OPEN, 409, OPEN_SERVER_MESSAGE);
  }

  const regionRefusal = sensitiveDataRegionRefusal(connectorId, request);
  if (regionRefusal) return fail(OAUTH_START_STATUS_UNAVAILABLE, 403, regionRefusal);

  if ((provider || discovered) && !isConnectorTokenStorageAvailable()) {
    return fail(OAUTH_START_STATUS_UNAVAILABLE, 503, CONNECTOR_TOKEN_STORAGE_UNAVAILABLE);
  }

  // After the cheap refusals and before any credential is exchanged. The
  // workspace policy was consulted only when tools were READ for a chat turn,
  // so a member could complete an OAuth flow for a connector their
  // administrator forbids and have the tokens stored; the policy caught up
  // afterwards by hiding the resulting tools. An administrator reads "these
  // connectors only" as binding at the point their organization's data starts
  // moving, which is here. It resolves the active workspace, so it runs only
  // once this request is actually going to attempt a connection.
  const policyDecision = await evaluateConnectorPolicyForUser({
    db,
    userId,
    organizationId,
    connectorId,
    isCustom: Boolean(!provider && discovered),
    request,
    surface: resolveCloudChatSurface(request),
  });
  if (!policyDecision.allowed) {
    return fail(OAUTH_START_STATUS_POLICY_BLOCKED, 403, policyDecision.reason);
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
        return NextResponse.json({
          connectorId,
          authorizeUrl: started.authorizationUrl,
          ...(await appHandoff(started.authorizationUrl)),
        } satisfies ConnectorOAuthStartResponse);
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
      describeConnectorSetup(connectorId, connectorDisplayName(connectorId))?.message ??
        NOT_CONFIGURED_MESSAGE,
    );
  }

  // The stored grant is what a reconnect would otherwise inherit. A connector
  // that has since widened its scope list may not have the extra permission
  // carried over silently, so the widening is named and consent is asked again.
  const accounts = await listConnectorAccounts(userId, connectorId);
  const grantedScopes = accounts.flatMap((account) => account.grantedScopes);
  const escalation = scopeEscalation(connectorId, grantedScopes, provider.scopes);
  const requestedScopes = provider.scopes.filter((scope) => !escalation.refused.includes(scope));
  const needsReconsent = accounts.length > 0 && escalation.escalated;
  if (escalation.refused.length > 0) {
    logger.warn(
      { connectorId, refused: escalation.refused },
      '[connector-oauth] scopes above the reviewed ceiling were dropped from the request',
    );
  }

  const registryAuth = await resolveRegistryAuthorization(provider);
  if (registryAuth.status === 'authorization-server-changed') {
    logger.warn(
      { connectorId, issuer: registryAuth.issuer },
      '[connector-oauth] the server no longer names the issuer its pre-registered app belongs to',
    );
    return fail(
      OAUTH_START_STATUS_REAUTHORIZE,
      409,
      authorizationServerChangedMessage(connectorDisplayName(connectorId)),
    );
  }
  if (registryAuth.status === 'pkce-unsupported') {
    return fail(
      OAUTH_START_STATUS_ERROR,
      502,
      new McpPkceUnsupportedError(registryAuth.issuer).message,
    );
  }

  const state = generateOAuthState();
  const pkce = generatePkcePair();

  try {
    await createPendingAuthorization({
      userId,
      connectorId,
      state,
      codeVerifier: pkce.verifier,
      codeChallengeMethod: 'S256',
      redirectUri,
      requestedScopes,
      returnPath,
      ttlSeconds: sensitiveDataConnector(connectorId)?.authorizationTtlSeconds,
      issuer: registryAuth.context.issuer,
      resourceUrl: registryAuth.context.resource,
      ...(registryAuth.context.discoveryState
        ? { discoveryState: registryAuth.context.discoveryState }
        : {}),
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
    codeChallenge: pkce.challenge,
    resource: registryAuth.context.resource,
  });

  if (wantsJson) {
    return NextResponse.json({
      connectorId,
      authorizeUrl,
      ...(await appHandoff(authorizeUrl)),
      ...(needsReconsent
        ? { status: OAUTH_START_STATUS_SCOPE_RECONSENT, addedScopes: escalation.added }
        : {}),
    } satisfies ConnectorOAuthStartResponse);
  }
  return NextResponse.redirect(authorizeUrl);
}

export const GET = withPrivateNoStore(handleGet);
