export interface ConnectorAccessPolicy {
  allowedConnectors: string[];
  blockedConnectors: string[];
  allowCustomConnectors: boolean;
}

export type ConnectorAccessCode =
  | 'allowed'
  | 'ungoverned'
  | 'connector_blocked'
  | 'connector_not_allowed'
  | 'custom_connectors_disabled';

export interface ConnectorAccessDecision {
  allowed: boolean;
  code: ConnectorAccessCode;
  reason: string;
}

const ALLOWED: ConnectorAccessDecision = {
  allowed: true,
  code: 'allowed',
  reason: 'Permitted by workspace connector policy.',
};

const UNGOVERNED: ConnectorAccessDecision = {
  allowed: true,
  code: 'ungoverned',
  reason: 'No workspace connector policy applies.',
};

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function has(list: readonly string[], value: string): boolean {
  if (!value) return false;
  return list.some((entry) => normalize(entry) === value);
}

export function evaluateConnectorAccess(
  policy: ConnectorAccessPolicy | null,
  ask: { connectorId: string | null; isCustom?: boolean },
): ConnectorAccessDecision {
  if (!policy) return UNGOVERNED;

  const connector = normalize(ask.connectorId);

  if (ask.isCustom && !policy.allowCustomConnectors) {
    return {
      allowed: false,
      code: 'custom_connectors_disabled',
      reason:
        'Your workspace administrator does not allow custom connectors. Use an approved integration from the catalog instead.',
    };
  }

  if (has(policy.blockedConnectors, connector)) {
    return {
      allowed: false,
      code: 'connector_blocked',
      reason: `Your workspace administrator has blocked the "${ask.connectorId}" connector.`,
    };
  }

  if (has(policy.allowedConnectors, connector)) return ALLOWED;

  if (policy.allowedConnectors.length > 0) {
    return {
      allowed: false,
      code: 'connector_not_allowed',
      reason: `Your workspace administrator restricts which connectors may be used, and "${ask.connectorId}" is not on the approved list.`,
    };
  }

  return ALLOWED;
}

/** True when the policy would deny at least one thing. */
export function connectorPolicyRestrictsAnything(policy: ConnectorAccessPolicy | null): boolean {
  if (!policy) return false;
  return (
    policy.allowedConnectors.length > 0 ||
    policy.blockedConnectors.length > 0 ||
    !policy.allowCustomConnectors
  );
}
