import { readConnectorConnectRequest, type ConnectorConnectRequest } from '@agiworkforce/types';

export function connectorConnectHeadline(request: ConnectorConnectRequest): string {
  if (request.connectUrl === null) return `${request.connectorName} can’t be connected here`;
  switch (request.reason) {
    case 'not_connected':
      return `Connect ${request.connectorName}`;
    case 'insufficient_scope':
      return `${request.connectorName} needs more permission`;
    default:
      return `Reconnect ${request.connectorName}`;
  }
}

export function connectorConnectExplanation(request: ConnectorConnectRequest): string {
  if (request.connectUrl === null) {
    return `This needs your authorization, but no ${request.connectorName} authorization app is configured, so there is nothing to connect to yet.`;
  }
  switch (request.reason) {
    case 'not_connected':
      return `This needs access to your ${request.connectorName} account, which isn’t connected yet.`;
    case 'authorization_expired':
      return `Your ${request.connectorName} authorization expired or was revoked, so the request couldn’t run.`;
    case 'insufficient_scope':
      return `Your ${request.connectorName} authorization doesn’t cover what was asked for.`;
    case 'authorization_unavailable':
      return `${request.connectorName} rejected the stored authorization for this account, so the request couldn’t run.`;
  }
}

export function connectorStepFailureSentence(params: {
  toolName: string;
  failed: boolean;
  texts: readonly (string | undefined)[];
}): string | null {
  if (!params.failed) return null;
  for (const text of params.texts) {
    const request = readConnectorConnectRequest({
      qualifiedToolName: params.toolName,
      result: text,
      isError: true,
    });
    if (request) return connectorConnectExplanation(request);
  }
  return null;
}
