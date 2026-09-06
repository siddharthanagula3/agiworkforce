import 'server-only';

import {
  buildConnectorOAuthStartPath,
  getConnectorOAuthProvider,
  isConnectorOAuthSupported,
} from '@/lib/connectors/oauth-registry';

export const CONNECTOR_AUTHORIZATION_REQUIRED_KEY = 'agi_connector_authorization_required';

export type ConnectorAuthorizationReason =
  | 'not_connected'
  | 'authorization_expired'
  | 'insufficient_scope'
  | 'authorization_unavailable';

export interface ConnectorAuthorizationRequiredPayload {
  agi_connector_authorization_required: true;
  connectorId: string;
  connectorName: string;
  toolName: string;
  reason: ConnectorAuthorizationReason;
  connectUrl: string | null;
  scopes: string[];
  message: string;
}

function messageFor(
  reason: ConnectorAuthorizationReason,
  connectorName: string,
  connectable: boolean,
): string {
  if (!connectable) {
    return `${connectorName} requires authorization, but this deployment has no OAuth application configured for it, so it cannot be connected here. Tell the user this connector is unavailable and do not retry.`;
  }
  switch (reason) {
    case 'not_connected':
      return `${connectorName} is not connected for this account. Ask the user to connect it, then call this tool again.`;
    case 'authorization_expired':
      return `The ${connectorName} authorization for this account has expired or was revoked. Ask the user to reconnect it, then call this tool again.`;
    case 'insufficient_scope':
      return `The ${connectorName} authorization for this account does not cover this action. Ask the user to reconnect it with the additional permission, then call this tool again.`;
    case 'authorization_unavailable':
      return `${connectorName} rejected the stored authorization for this account. Ask the user to reconnect it, then call this tool again.`;
  }
}

export function buildConnectorAuthorizationRequiredPayload(params: {
  connectorId: string;
  connectorLabel?: string;
  toolName: string;
  reason: ConnectorAuthorizationReason;
  additionalScopes?: string[];
  returnPath?: string;
  /** Overrides the registry check for connectors whose authorization is discovered at connect time. */
  connectable?: boolean;
}): ConnectorAuthorizationRequiredPayload {
  const provider = getConnectorOAuthProvider(params.connectorId);
  const connectable = params.connectable ?? isConnectorOAuthSupported(params.connectorId);
  const connectorName = params.connectorLabel ?? provider?.displayName ?? params.connectorId;
  const scopes = [...new Set([...(provider?.scopes ?? []), ...(params.additionalScopes ?? [])])];
  return {
    [CONNECTOR_AUTHORIZATION_REQUIRED_KEY]: true,
    connectorId: params.connectorId,
    connectorName,
    toolName: params.toolName,
    reason: params.reason,
    connectUrl: connectable
      ? buildConnectorOAuthStartPath(params.connectorId, params.returnPath)
      : null,
    scopes,
    message: messageFor(params.reason, connectorName, connectable),
  };
}

export function serializeConnectorAuthorizationRequired(
  payload: ConnectorAuthorizationRequiredPayload,
): string {
  return JSON.stringify(payload);
}

export function parseConnectorAuthorizationRequired(
  content: string,
): ConnectorAuthorizationRequiredPayload | null {
  if (!content.includes(CONNECTOR_AUTHORIZATION_REQUIRED_KEY)) return null;
  try {
    const parsed: unknown = JSON.parse(content);
    if (
      parsed &&
      typeof parsed === 'object' &&
      (parsed as Record<string, unknown>)[CONNECTOR_AUTHORIZATION_REQUIRED_KEY] === true
    ) {
      return parsed as ConnectorAuthorizationRequiredPayload;
    }
  } catch {
    return null;
  }
  return null;
}
