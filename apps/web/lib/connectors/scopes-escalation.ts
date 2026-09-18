import {
  canonicalConnectorScope,
  filterConnectorScopes,
  getConnectorScopeCeiling,
  SCOPE_REVIEW_PENDING,
} from '@/lib/connectors/oauth-scope-allowlist';

export interface ScopeEscalation {
  escalated: boolean;
  added: string[];
  refused: string[];
}

function canonicalSet(scopes: readonly string[]): Set<string> {
  return new Set(scopes.map((scope) => canonicalConnectorScope(scope)));
}

/**
 * What a connector now asks for beyond what the person already consented to.
 * Compared in canonical form so a provider that switches between the short and
 * fully-qualified spelling of the same scope does not read as an escalation.
 */
export function scopeEscalation(
  connectorId: string,
  grantedScopes: readonly string[],
  requestedScopes: readonly string[],
): ScopeEscalation {
  const granted = canonicalSet(grantedScopes);
  const { scopes: permitted, dropped } = filterConnectorScopes(connectorId, [...requestedScopes]);
  const added: string[] = [];
  const seen = new Set<string>();

  for (const scope of permitted) {
    const canonical = canonicalConnectorScope(scope);
    if (granted.has(canonical) || seen.has(canonical)) continue;
    seen.add(canonical);
    added.push(scope);
  }

  return { escalated: added.length > 0, added, refused: dropped };
}

/**
 * A stored grant may only be used for what it already covers. A connector that
 * has since widened its scope list needs the person back at the consent screen,
 * so the reauthorization is explicit rather than inherited from the old token.
 */
export function grantRequiresReconsent(params: {
  connectorId: string;
  grantedScopes: readonly string[];
  declaredScopes: readonly string[];
}): boolean {
  if (getConnectorScopeCeiling(params.connectorId) === SCOPE_REVIEW_PENDING) return false;
  return scopeEscalation(params.connectorId, params.grantedScopes, params.declaredScopes).escalated;
}

export function grantCoversScopes(
  grantedScopes: readonly string[],
  requiredScopes: readonly string[],
): boolean {
  const granted = canonicalSet(grantedScopes);
  return requiredScopes.every((scope) => granted.has(canonicalConnectorScope(scope)));
}
