import { describe, expect, it } from 'vitest';

import {
  evaluateConnectorAccess as sharedEvaluateConnectorAccess,
  evaluateMcpHostAccess as sharedEvaluateMcpHostAccess,
  evaluatePluginAccess as sharedEvaluatePluginAccess,
  mcpHostMatches as sharedMcpHostMatches,
  type ConnectorAccessPolicy as SharedConnectorAccessPolicy,
} from '@agiworkforce/client-runtime';
import {
  evaluateConnectorAccess,
  evaluateMcpHostAccess,
  evaluatePluginAccess,
  mcpHostMatches,
  type ConnectorAccessPolicy,
} from '@/lib/services/connector-policy-evaluator';
import { resolveConnectorHealth } from '@/lib/connectors/catalog';

/**
 * Web's server gate still holds its own copy of the evaluator; until it imports
 * the shared one, this pins the two to the same code and the same sentence.
 */
const POLICIES: ReadonlyArray<ConnectorAccessPolicy & SharedConnectorAccessPolicy> = [
  { allowedConnectors: [], blockedConnectors: [], allowCustomConnectors: true },
  { allowedConnectors: [], blockedConnectors: ['slack'], allowCustomConnectors: true },
  { allowedConnectors: ['github'], blockedConnectors: [], allowCustomConnectors: true },
  { allowedConnectors: ['github'], blockedConnectors: ['github'], allowCustomConnectors: true },
  { allowedConnectors: [], blockedConnectors: [], allowCustomConnectors: false },
  {
    allowedConnectors: ['GitHub'],
    blockedConnectors: [],
    allowCustomConnectors: true,
    allowedMcpHosts: ['mcp.example.com', '*.internal.example'],
    allowedPlugins: ['research-pack'],
    blockedPlugins: ['payroll-pack'],
  },
];

const CONNECTOR_IDS = ['github', 'slack', 'GITHUB', '', 'unknown-connector'];
const URLS = [
  'https://mcp.example.com/sse',
  'https://a.internal.example/sse',
  'https://internal.example/sse',
  'https://elsewhere.example/sse',
  'not a url',
];

describe('web and the shared client runtime answer connector policy identically', () => {
  it('agrees on every connector decision', () => {
    for (const policy of POLICIES) {
      for (const connectorId of CONNECTOR_IDS) {
        for (const isCustom of [undefined, false, true]) {
          for (const url of [undefined, ...URLS]) {
            const ask = {
              connectorId,
              ...(isCustom === undefined ? {} : { isCustom }),
              ...(url === undefined ? {} : { url }),
            };
            expect(sharedEvaluateConnectorAccess(policy, ask)).toEqual(
              evaluateConnectorAccess(policy, ask),
            );
          }
        }
      }
      expect(sharedEvaluateConnectorAccess(null, { connectorId: 'github' })).toEqual(
        evaluateConnectorAccess(null, { connectorId: 'github' }),
      );
    }
  });

  it('agrees on plugin and MCP host decisions', () => {
    for (const policy of POLICIES) {
      for (const pluginKey of ['research-pack', 'payroll-pack', 'unlisted-pack', '']) {
        expect(sharedEvaluatePluginAccess(policy, pluginKey)).toEqual(
          evaluatePluginAccess(policy, pluginKey),
        );
      }
      for (const url of URLS) {
        expect(sharedEvaluateMcpHostAccess(policy, url)).toEqual(
          evaluateMcpHostAccess(policy, url),
        );
      }
    }
  });

  it('agrees on host pattern matching', () => {
    for (const pattern of ['mcp.example.com', '*.internal.example', '', '*.']) {
      for (const host of ['mcp.example.com', 'a.internal.example', 'internal.example', '']) {
        expect(sharedMcpHostMatches(pattern, host)).toBe(mcpHostMatches(pattern, host));
      }
    }
  });
});

describe('the catalog keeps its own question and delegates the ranking', () => {
  it('reports a device-local connector as unsupported on cloud web', () => {
    expect(resolveConnectorHealth({ connectorId: 'local-filesystem', connected: true })).toBe(
      'unsupported-here',
    );
  });

  it('ranks a not-responding connection below an expired grant', () => {
    expect(
      resolveConnectorHealth({ connectorId: 'github', connected: true, notResponding: true }),
    ).toBe('not-responding');
    expect(
      resolveConnectorHealth({
        connectorId: 'github',
        connected: true,
        notResponding: true,
        needsReauthorization: true,
      }),
    ).toBe('needs-reauthorization');
  });

  it('separates connectable from not-configured for an unconnected connector', () => {
    expect(resolveConnectorHealth({ connectorId: 'github', available: true })).toBe('connectable');
    expect(resolveConnectorHealth({ connectorId: 'github', available: false })).toBe(
      'not-configured',
    );
  });
});
