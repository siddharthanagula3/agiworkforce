
export interface ConnectorOAuthNotice {
  kind: 'success' | 'error';
  message: string;
  connected: boolean;
}

const DIRECTORY_STATUS_FILTERS = new Set(['ready', 'request_access']);

function buildNotice(status: string, label: string): ConnectorOAuthNotice | null {
  switch (status) {
    case 'connected':
      return { kind: 'success', message: `${label} connected.`, connected: true };
    case 'denied':
      return {
        kind: 'error',
        message: `Authorization for ${label} was canceled.`,
        connected: false,
      };
    case 'failed':
      return {
        kind: 'error',
        message: `${label} authorization failed. Please try again.`,
        connected: false,
      };
    case 'invalid_state':
      return {
        kind: 'error',
        message: `The ${label} authorization failed a security check. Start the connection again.`,
        connected: false,
      };
    case 'unavailable':
      return {
        kind: 'error',
        message: `Connector authorization is not available for ${label} in this deployment.`,
        connected: false,
      };
    default:
      return null;
  }
}

/**
 * Translate `?connector=&status=` into a banner, or null when these params did
 * not come from the OAuth broker.
 *
 * @param connectorLabel Display name for the connector when the caller can
 *   resolve one from the catalog. Falls back to the raw id, and then to
 *   generic wording when the broker could not name a connector at all.
 */
export function getConnectorOAuthNotice(
  status: string | null | undefined,
  connectorId: string | null | undefined,
  connectorLabel?: string,
): ConnectorOAuthNotice | null {
  if (!status) return null;
  if (!connectorId && (DIRECTORY_STATUS_FILTERS.has(status) || status === 'connected')) return null;

  const label = connectorLabel ?? connectorId ?? 'This connector';
  const notice = buildNotice(status, label);
  if (notice) return notice;

  if (connectorId) {
    return {
      kind: 'error',
      message: `Could not complete the ${label} authorization. Please try again.`,
      connected: false,
    };
  }
  return null;
}
