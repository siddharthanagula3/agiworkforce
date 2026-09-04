import { describe, expect, it } from 'vitest';

import { FALLBACK_SUPPORTED_CONNECTOR_IDS } from '../../../stores/connectorsStore';
import { CONNECTOR_DIRECTORY, FEATURED_CONNECTORS } from '../connectorDefinitions';

describe('connector directory catalog', () => {
  it('does not expose coming-soon connectors in the live directory', () => {
    expect(CONNECTOR_DIRECTORY).not.toHaveLength(0);
    expect(CONNECTOR_DIRECTORY.every((connector) => !connector.comingSoon)).toBe(true);
    expect(FEATURED_CONNECTORS.every((connector) => !connector.comingSoon)).toBe(true);
  });

  it('shows every connector the runtime declares supported', () => {
    const visible = new Set(CONNECTOR_DIRECTORY.map((connector) => connector.id));
    const hidden = FALLBACK_SUPPORTED_CONNECTOR_IDS.filter((id) => !visible.has(id));
    expect(hidden).toEqual([]);
  });

  it('does not brand visible connector descriptions as Claude features', () => {
    for (const connector of CONNECTOR_DIRECTORY) {
      expect(connector.description).not.toMatch(/\bClaude\b/i);
    }
  });
});
