import { getConnectorScopeCeiling, SCOPE_REVIEW_PENDING } from '@agiworkforce/cloud-contracts';

export {
  CONNECTOR_OAUTH_SCOPE_CEILINGS,
  FORBIDDEN_CONNECTOR_OAUTH_SCOPES,
  GOOGLE_DRIVE_FILE_CREATE_SCOPE,
  ONEDRIVE_APP_FOLDER_SCOPE,
  SCOPE_REVIEW_PENDING,
  canonicalConnectorScope,
  getConnectorScopeCeiling,
  type ConnectorScopeCeiling,
} from '@agiworkforce/cloud-contracts';

export function isConnectorScopeCeilingEnforced(connectorId: string): boolean {
  const ceiling = getConnectorScopeCeiling(connectorId);
  return ceiling !== null && ceiling !== SCOPE_REVIEW_PENDING;
}

export interface FilteredConnectorScopes {
  readonly scopes: string[];
  readonly dropped: string[];
}

export function filterConnectorScopes(
  connectorId: string,
  requested: readonly string[],
): FilteredConnectorScopes {
  const ceiling = getConnectorScopeCeiling(connectorId);
  if (ceiling === null || ceiling === SCOPE_REVIEW_PENDING) {
    return { scopes: [...requested], dropped: [] };
  }
  const permitted = new Set(ceiling);
  const scopes: string[] = [];
  const dropped: string[] = [];
  for (const scope of requested) {
    if (permitted.has(scope)) scopes.push(scope);
    else dropped.push(scope);
  }
  return { scopes, dropped };
}
