import 'server-only';

import { resolveCloudChatSurface } from '@/lib/free-chat-surface-policy';
import type { NextRequest } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { bearerCredential, sealCustomConnectorCredential } from '@/lib/custom-connector-crypto';
import { createError } from '@/lib/errors';
import { validateHttpsMcpUrl } from '@/lib/mcp-url-validation';
import { recordAuditEvent } from '@/lib/security-audit';
import { evaluateConnectorPolicyForUser } from '@/lib/services/connector-policy-gate';
import { assertConnectorsReleased } from '@/lib/connectors/connector-capability';

import { accountUrlProblem } from './account-url-connectors';
import {
  assertConnectorToolCapacity,
  assertCustomConnectorCapacity,
  customConnectorId,
  edgeBlockedMessage,
  insertCustomConnector,
  McpProbeError,
  probeMcpServer,
  transportForUrl,
  type CustomConnectorRow,
  type McpProbeResult,
} from './mcp-custom-connections';
import { mcpServerPublishesProtectedResource } from './mcp-discovery';

const NAME_MAX_LENGTH = 200;
const AUTH_TOKEN_MAX_LENGTH = 4096;
const OAUTH_CLIENT_ID_MAX_LENGTH = 512;
const OAUTH_CLIENT_SECRET_MAX_LENGTH = 4096;
const AUDIT_RESOURCE_TYPE = 'custom_mcp_connector';
const DEFAULT_AUDIT_SOURCE = 'custom_mcp';
const OAUTH_CLIENT_WITH_TOKEN_MESSAGE =
  'Use either an access token or OAuth client credentials for a custom connector, not both.';
const OAUTH_SECRET_WITHOUT_ID_MESSAGE = 'An OAuth client secret needs its OAuth client ID.';

export interface CreateCustomConnectorInput {
  readonly userId: string;
  readonly request: NextRequest;
  readonly name?: string | undefined;
  readonly url?: string | undefined;
  readonly transport?: string | undefined;
  readonly authToken?: string | undefined;
  readonly oauthClientId?: string | undefined;
  readonly oauthClientSecret?: string | undefined;
  readonly auditSource?: string;
}

export interface CreatedCustomConnector {
  readonly connector: CustomConnectorRow;
  readonly signInRequired: boolean;
  readonly probe: McpProbeResult | null;
}

function trimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function createCustomConnector(
  db: DatabaseAdapter,
  input: CreateCustomConnectorInput,
): Promise<CreatedCustomConnector> {
  assertConnectorsReleased();
  const { userId, request } = input;
  const name = trimmedString(input.name);
  if (!name || name.length > NAME_MAX_LENGTH) {
    throw createError.validation(`name is required (1 to ${NAME_MAX_LENGTH} chars)`);
  }

  const capacity = await assertCustomConnectorCapacity(db, userId);

  const parsedUrl = await validateHttpsMcpUrl(input.url);
  const accountProblem = accountUrlProblem(parsedUrl);
  if (accountProblem) throw createError.validation(accountProblem);
  const url = parsedUrl.toString();
  const transport = transportForUrl(parsedUrl, input.transport);

  const hostDecision = await evaluateConnectorPolicyForUser({
    db,
    userId,
    connectorId: null,
    isCustom: true,
    url,
    request,
    surface: resolveCloudChatSurface(request),
  });
  if (!hostDecision.allowed) throw createError.forbidden(hostDecision.reason).asUserSafe();

  const authToken = trimmedString(input.authToken);
  if (authToken.length > AUTH_TOKEN_MAX_LENGTH) {
    throw createError.validation('authToken is too long');
  }
  const credential = authToken ? bearerCredential(authToken) : null;

  const oauthClientId = trimmedString(input.oauthClientId);
  const oauthClientSecret = trimmedString(input.oauthClientSecret);
  if (
    oauthClientId.length > OAUTH_CLIENT_ID_MAX_LENGTH ||
    oauthClientSecret.length > OAUTH_CLIENT_SECRET_MAX_LENGTH
  ) {
    throw createError.validation('OAuth client credentials are too long');
  }
  if (oauthClientSecret && !oauthClientId) {
    throw createError.validation(OAUTH_SECRET_WITHOUT_ID_MESSAGE);
  }
  if (credential && oauthClientId) {
    throw createError.validation(OAUTH_CLIENT_WITH_TOKEN_MESSAGE);
  }

  let probe: McpProbeResult | null = null;
  try {
    probe = await probeMcpServer({
      serverName: name,
      url,
      transport,
      ...(credential ? { headers: { [credential.headerName]: credential.headerValue } } : {}),
      authorizationContext: `user:${userId}:custom-url:${url}`,
    });
  } catch (error) {
    if (!(error instanceof McpProbeError)) throw error;
    if (!error.authChallenge || credential) {
      throw createError.serviceUnavailable(
        error.edgeBlocked
          ? edgeBlockedMessage(name)
          : `Failed to connect to MCP server: ${error.message}`,
      );
    }
  }

  const signInRequired =
    !credential && (probe === null || (await mcpServerPublishesProtectedResource(url)));

  if (probe) assertConnectorToolCapacity(capacity.planTier, probe.toolCount);

  const connector = await insertCustomConnector(db, {
    userId,
    name,
    url,
    transport,
    credentialEnc: credential ? sealCustomConnectorCredential(credential) : null,
    connectorLimit: capacity.connectorLimit,
    signInRequired,
    oauthClient: oauthClientId
      ? { clientId: oauthClientId, clientSecret: oauthClientSecret || null }
      : null,
  });

  await recordAuditEvent({
    userId,
    eventType: 'connector_added',
    request,
    detail: {
      resourceType: AUDIT_RESOURCE_TYPE,
      resourceId: connector.id,
      resourceName: connector.name,
      connectorId: customConnectorId(connector.short_id),
      transport: connector.transport,
      source: input.auditSource ?? DEFAULT_AUDIT_SOURCE,
      status: signInRequired ? 'sign-in-required' : 'connected',
    },
  });

  return { connector, signInRequired, probe };
}
