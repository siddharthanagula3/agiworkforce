import { describe, expect, it } from 'vitest';

import {
  connectorPolicyRestrictsAnything,
  evaluateConnectorAccess,
  evaluateMcpHostAccess,
  evaluatePluginAccess,
  mcpHostMatches,
  type ConnectorAccessPolicy,
} from '../connector-policy-evaluator';

function policy(over: Partial<ConnectorAccessPolicy> = {}): ConnectorAccessPolicy {
  return {
    allowedConnectors: [],
    blockedConnectors: [],
    allowCustomConnectors: true,
    ...over,
  };
}

const CONNECTOR = 'fixture-connector-alpha';
const OTHER = 'fixture-connector-beta';

describe('evaluateConnectorAccess', () => {
  it('allows everything when no policy exists', () => {
    expect(evaluateConnectorAccess(null, { connectorId: CONNECTOR }).code).toBe('ungoverned');
  });

  it('AN EMPTY ALLOWLIST DOES NOT DENY EVERYTHING', () => {
    expect(evaluateConnectorAccess(policy(), { connectorId: CONNECTOR }).allowed).toBe(true);
  });

  it('blocks a connector an administrator named', () => {
    const d = evaluateConnectorAccess(policy({ blockedConnectors: [CONNECTOR] }), {
      connectorId: CONNECTOR,
    });
    expect(d.allowed).toBe(false);
    expect(d.code).toBe('connector_blocked');
  });

  it('denies a connector outside a non-empty allowlist', () => {
    const d = evaluateConnectorAccess(policy({ allowedConnectors: [CONNECTOR] }), {
      connectorId: OTHER,
    });
    expect(d.allowed).toBe(false);
    expect(d.code).toBe('connector_not_allowed');
  });

  it('refuses a custom connector when the workspace disallows them', () => {
    const d = evaluateConnectorAccess(policy({ allowCustomConnectors: false }), {
      connectorId: CONNECTOR,
      isCustom: true,
    });
    expect(d.allowed).toBe(false);
    expect(d.code).toBe('custom_connectors_disabled');
  });

  it('does not let naming a custom connector escape the blanket switch', () => {
    // "No arbitrary MCP endpoints" must not be silently escapable by putting
    // one on the allowlist.
    const d = evaluateConnectorAccess(
      policy({ allowCustomConnectors: false, allowedConnectors: [CONNECTOR] }),
      { connectorId: CONNECTOR, isCustom: true },
    );
    expect(d.allowed).toBe(false);
    expect(d.code).toBe('custom_connectors_disabled');
  });

  it('leaves catalog connectors alone when only custom ones are disallowed', () => {
    const d = evaluateConnectorAccess(policy({ allowCustomConnectors: false }), {
      connectorId: CONNECTOR,
      isCustom: false,
    });
    expect(d.allowed).toBe(true);
  });

  it('matches without regard to case or whitespace', () => {
    const d = evaluateConnectorAccess(
      policy({ blockedConnectors: ['  Fixture-Connector-Alpha '] }),
      {
        connectorId: CONNECTOR,
      },
    );
    expect(d.allowed).toBe(false);
  });

  it('does not treat a missing connector id as a match for anything', () => {
    expect(
      evaluateConnectorAccess(policy({ blockedConnectors: [''] }), { connectorId: null }).code,
    ).not.toBe('connector_blocked');
  });

  it('is total across every combination', () => {
    const policies = [
      null,
      policy(),
      policy({ allowedConnectors: [CONNECTOR] }),
      policy({ blockedConnectors: [CONNECTOR] }),
      policy({ allowCustomConnectors: false }),
    ];
    for (const p of policies) {
      for (const ask of [
        { connectorId: null },
        { connectorId: '' },
        { connectorId: CONNECTOR, isCustom: true },
        { connectorId: CONNECTOR, isCustom: false },
      ]) {
        const d = evaluateConnectorAccess(p, ask);
        expect(typeof d.allowed).toBe('boolean');
        expect(d.reason.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('connectorPolicyRestrictsAnything', () => {
  it('reports a saved but permissive policy as governing nothing', () => {
    expect(connectorPolicyRestrictsAnything(policy())).toBe(false);
    expect(connectorPolicyRestrictsAnything(null)).toBe(false);
  });

  it('counts the custom-connector switch as a restriction', () => {
    expect(connectorPolicyRestrictsAnything(policy({ allowCustomConnectors: false }))).toBe(true);
  });
});

describe('evaluateMcpHostAccess', () => {
  it('matches exact hosts and strict subdomain wildcards', () => {
    expect(mcpHostMatches('mcp.corp.example', 'MCP.corp.example')).toBe(true);
    expect(mcpHostMatches('*.corp.example', 'tools.corp.example')).toBe(true);
    expect(mcpHostMatches('*.corp.example', 'corp.example')).toBe(false);
    expect(mcpHostMatches('*.corp.example', 'evilcorp.example')).toBe(false);
    expect(mcpHostMatches('corp.example', 'mcp.corp.example')).toBe(false);
  });

  it('is unrestricted with an empty host list and refuses unlisted or unparsable URLs otherwise', () => {
    expect(evaluateMcpHostAccess(policy(), 'https://anything.example/sse').allowed).toBe(true);
    const restricted = policy({ allowedMcpHosts: ['*.corp.example'] });
    expect(evaluateMcpHostAccess(restricted, 'https://a.corp.example/mcp').allowed).toBe(true);
    expect(evaluateMcpHostAccess(restricted, 'https://a.other.example/mcp').code).toBe(
      'mcp_host_not_allowed',
    );
    expect(evaluateMcpHostAccess(restricted, 'not a url').allowed).toBe(false);
  });

  it('applies to custom connectors only when a URL is supplied', () => {
    const restricted = policy({ allowedMcpHosts: ['*.corp.example'] });
    expect(
      evaluateConnectorAccess(restricted, {
        connectorId: 'custom-abc',
        isCustom: true,
        url: 'https://mcp.other.example/sse',
      }).code,
    ).toBe('mcp_host_not_allowed');
    expect(
      evaluateConnectorAccess(restricted, {
        connectorId: CONNECTOR,
        isCustom: false,
        url: 'https://mcp.other.example/sse',
      }).allowed,
    ).toBe(true);
    expect(connectorPolicyRestrictsAnything(restricted)).toBe(true);
  });
});

describe('evaluatePluginAccess', () => {
  it('lets a block win over an allow, and treats an empty allowlist as unrestricted', () => {
    expect(evaluatePluginAccess(policy(), 'acme').allowed).toBe(true);
    const both = policy({ allowedPlugins: ['acme'], blockedPlugins: ['acme'] });
    expect(evaluatePluginAccess(both, 'acme').code).toBe('plugin_blocked');
    const allowlist = policy({ allowedPlugins: ['acme'] });
    expect(evaluatePluginAccess(allowlist, 'ACME').allowed).toBe(true);
    expect(evaluatePluginAccess(allowlist, 'other').code).toBe('plugin_not_allowed');
    expect(evaluatePluginAccess(null, 'other').code).toBe('ungoverned');
  });
});
