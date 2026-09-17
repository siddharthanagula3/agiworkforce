export interface ConnectorAccessPolicy {
  allowedConnectors: string[];
  blockedConnectors: string[];
  allowCustomConnectors: boolean;
  allowedPlugins?: string[];
  blockedPlugins?: string[];
  allowedMcpHosts?: string[];
}

export type ConnectorAccessCode =
  | 'allowed'
  | 'ungoverned'
  | 'connector_blocked'
  | 'connector_not_allowed'
  | 'custom_connectors_disabled'
  | 'mcp_host_not_allowed'
  | 'plugin_blocked'
  | 'plugin_not_allowed';

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

/**
 * Decides whether one workspace may use one connector.
 *
 * Precedence mirrors the model evaluator so an administrator does not have to
 * learn two rules: an explicit block wins, then an explicit allow, then a
 * non-empty allowlist excludes everything absent from it.
 *
 * CUSTOM CONNECTORS ARE A SEPARATE QUESTION. A catalog connector is a known
 * integration this product ships; a custom one is an arbitrary member-supplied
 * MCP endpoint. An organization comfortable with the first is often not
 * comfortable with the second, so the switch is its own field and an explicit
 * allow for a specific custom connector still respects it, a blanket "no
 * custom endpoints" must not be silently escapable by naming one.
 *
 * AN EMPTY ALLOWLIST MEANS UNRESTRICTED, NOT DENY-ALL. A row that arrives empty
 * must not cut every member off from every integration.
 *
 * Pure and total: no I/O, no throw, every input yields a decision.
 */
export function evaluateConnectorAccess(
  policy: ConnectorAccessPolicy | null,
  ask: { connectorId: string | null; isCustom?: boolean; url?: string | null },
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

  if (ask.isCustom && ask.url) {
    const hostDecision = evaluateMcpHostAccess(policy, ask.url);
    if (!hostDecision.allowed) return hostDecision;
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

export function mcpHostMatches(pattern: string, hostname: string): boolean {
  const rule = normalize(pattern);
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!rule || !host) return false;
  if (rule.startsWith('*.')) {
    const suffix = rule.slice(1);
    return host.endsWith(suffix) && host.length > suffix.length;
  }
  return host === rule;
}

export function evaluateMcpHostAccess(
  policy: ConnectorAccessPolicy | null,
  url: string,
): ConnectorAccessDecision {
  const hosts = policy?.allowedMcpHosts ?? [];
  if (!policy) return UNGOVERNED;
  if (hosts.length === 0) return ALLOWED;
  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = '';
  }
  if (hostname && hosts.some((pattern) => mcpHostMatches(pattern, hostname))) return ALLOWED;
  return {
    allowed: false,
    code: 'mcp_host_not_allowed',
    reason: hostname
      ? `Your workspace administrator only allows MCP servers on approved hosts, and "${hostname}" is not one of them.`
      : 'Your workspace administrator only allows MCP servers on approved hosts.',
  };
}

export function evaluatePluginAccess(
  policy: ConnectorAccessPolicy | null,
  pluginKey: string,
): ConnectorAccessDecision {
  if (!policy) return UNGOVERNED;
  const plugin = normalize(pluginKey);
  const allowedPlugins = policy.allowedPlugins ?? [];
  if (has(policy.blockedPlugins ?? [], plugin)) {
    return {
      allowed: false,
      code: 'plugin_blocked',
      reason: `Your workspace administrator has blocked the "${pluginKey}" plugin.`,
    };
  }
  if (has(allowedPlugins, plugin)) return ALLOWED;
  if (allowedPlugins.length > 0) {
    return {
      allowed: false,
      code: 'plugin_not_allowed',
      reason: `Your workspace administrator restricts which plugins may be installed, and "${pluginKey}" is not on the approved list.`,
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
    !policy.allowCustomConnectors ||
    (policy.allowedPlugins?.length ?? 0) > 0 ||
    (policy.blockedPlugins?.length ?? 0) > 0 ||
    (policy.allowedMcpHosts?.length ?? 0) > 0
  );
}
