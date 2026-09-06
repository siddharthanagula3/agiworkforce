import { describe, expect, it } from 'vitest';

import { CONNECTORS } from '@/features/connectors/data/connectors';
import { CONNECTOR_CAPABILITIES } from '@/lib/connectors/catalog';
import { connectorIdsWithMcpEndpoint } from '@/lib/connectors/mcp-endpoints';

describe('catalog auth schemes for hosted MCP endpoints', () => {
  it('records every hosted MCP endpoint as an OAuth server, matching its live challenge', () => {
    const mismatched = connectorIdsWithMcpEndpoint().filter(
      (id) => CONNECTOR_CAPABILITIES[id]?.authScheme !== 'oauth2',
    );
    expect(mismatched).toEqual([]);
  });

  it('keeps the settings catalog auth label in step with the capability record', () => {
    const endpointIds = new Set(connectorIdsWithMcpEndpoint());
    const mismatched = CONNECTORS.filter(
      (connector) => endpointIds.has(connector.id) && connector.authType !== 'oauth',
    ).map((connector) => connector.id);
    expect(mismatched).toEqual([]);
  });
});
