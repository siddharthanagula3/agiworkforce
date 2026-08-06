/**
 * @file The structured "connect required" tool result (lazy authentication).
 *
 * When a connector tool call cannot proceed because the user has not authorized
 * the connector — or their authorization died mid-conversation — the turn must
 * NOT fail. The tool loop emits this payload as the tool result so the client
 * can render an inline Connect card, the user authorizes in place, and the
 * model calls the same tool again.
 *
 * WHY THE PAYLOAD LIVES IN `content`. `ConnectorExecResult` reaches the tool
 * loop as `{ handled, content, isError }` and only `content` and `isError`
 * survive into the tool message (`runMcpTool` in the chat-completions tool
 * loop). A JSON envelope with a discriminant key is therefore how a structured
 * result crosses that boundary without changing the loop's contract: a client
 * `JSON.parse`s the tool result and checks for
 * `agi_connector_authorization_required`, while a model that never parses it
 * still reads a plain-English `message` telling it to ask the user to connect
 * and retry.
 *
 * `isError` stays true so the model treats the result as a failed call rather
 * than as connector data.
 */

import 'server-only';

import {
  buildConnectorOAuthStartPath,
  getConnectorOAuthProvider,
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
  /**
   * Same-origin path that starts the hosted OAuth flow, or null when this
   * deployment has no OAuth app for the connector — in which case the card must
   * say so instead of offering a button that cannot work.
   */
  connectUrl: string | null;
  /** Scopes the flow will request, so the card can show what is being asked for. */
  scopes: string[];
  /** Human-readable, for the model and for a client that does not parse this. */
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

/**
 * Build the payload. `additionalScopes` carries the scope a step-up challenge
 * demanded (RFC 9470), so the Connect card asks for what the server actually
 * asked for rather than for the registry default alone.
 */
export function buildConnectorAuthorizationRequiredPayload(params: {
  connectorId: string;
  connectorLabel?: string;
  toolName: string;
  reason: ConnectorAuthorizationReason;
  additionalScopes?: string[];
  returnPath?: string;
}): ConnectorAuthorizationRequiredPayload {
  const provider = getConnectorOAuthProvider(params.connectorId);
  const connectorName = params.connectorLabel ?? provider?.displayName ?? params.connectorId;
  const scopes = [...new Set([...(provider?.scopes ?? []), ...(params.additionalScopes ?? [])])];
  return {
    [CONNECTOR_AUTHORIZATION_REQUIRED_KEY]: true,
    connectorId: params.connectorId,
    connectorName,
    toolName: params.toolName,
    reason: params.reason,
    connectUrl: provider
      ? buildConnectorOAuthStartPath(params.connectorId, params.returnPath)
      : null,
    scopes,
    message: messageFor(params.reason, connectorName, provider !== null),
  };
}

/** The `content` string for a `ConnectorExecResult`. */
export function serializeConnectorAuthorizationRequired(
  payload: ConnectorAuthorizationRequiredPayload,
): string {
  return JSON.stringify(payload);
}

/** Client/test helper: recognise the envelope in a tool result. */
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
