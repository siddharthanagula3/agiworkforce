import { describe, expect, it } from 'vitest';

import { CONNECTOR_DIRECTORY, FEATURED_CONNECTORS } from '../connectorDefinitions';

describe('connector directory catalog', () => {
  it('does not expose coming-soon connectors in the live directory', () => {
    expect(CONNECTOR_DIRECTORY).not.toHaveLength(0);
    expect(CONNECTOR_DIRECTORY.every((connector) => !connector.comingSoon)).toBe(true);
    expect(FEATURED_CONNECTORS.every((connector) => !connector.comingSoon)).toBe(true);
  });

  it('does not brand visible connector descriptions as Claude features', () => {
    for (const connector of CONNECTOR_DIRECTORY) {
      expect(connector.description).not.toMatch(/\bClaude\b/i);
    }
  });
});
