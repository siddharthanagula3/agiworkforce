/**
 * @file Post-authorization outcome banner for the connector OAuth broker.
 *
 * `/api/connectors/oauth/start` and `/api/connectors/oauth/callback` both end a
 * failed or completed flow by redirecting the user back to `returnPath` with
 * exactly two query params: `connector` (the connector id, omitted when the
 * flow died before a pending row could be read) and a coarse `status`. Nothing
 * secret is ever reflected, so this module is the whole client-side vocabulary
 * for those redirects.
 *
 * The statuses below are the complete set those two routes emit — `connected`,
 * `denied`, `failed`, `invalid_state`, `unavailable`. Do not add a status the
 * broker does not produce.
 *
 * WHY THE `connector` PARAM MATTERS HERE. The connectors directory keeps its
 * own status filter in `?status=connected|ready|request_access`, so the key
 * collides. The broker names the connector on every outcome that can carry a
 * connector id, and it never emits `ready`/`request_access` at all, so a bare
 * filter value is distinguishable from a callback outcome and is left alone.
 */

export interface ConnectorOAuthNotice {
  kind: 'success' | 'error';
  message: string;
  /** True only for `status=connected`, so the caller can refresh the grant list. */
  connected: boolean;
}

/** Values the directory's own status filter uses. Never emitted by the broker. */
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
  // A status the directory filter owns, with no connector named: this is the
  // user's own filter selection, not a redirect back from a provider.
  if (!connectorId && (DIRECTORY_STATUS_FILTERS.has(status) || status === 'connected')) return null;

  const label = connectorLabel ?? connectorId ?? 'This connector';
  const notice = buildNotice(status, label);
  if (notice) return notice;

  // A named connector with a status this client does not recognise still came
  // from the broker. Report it as a failure rather than silently dropping it —
  // but do not invent a reason we cannot source.
  if (connectorId) {
    return {
      kind: 'error',
      message: `Could not complete the ${label} authorization. Please try again.`,
      connected: false,
    };
  }
  return null;
}
