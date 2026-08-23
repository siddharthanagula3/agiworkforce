import { describe, expect, it } from 'vitest';

import {
  connectorPolicyRestrictsAnything,
  evaluateConnectorAccess,
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
