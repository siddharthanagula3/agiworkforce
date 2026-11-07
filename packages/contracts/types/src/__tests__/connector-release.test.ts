import { describe, expect, it } from 'vitest';

import {
  CONNECTOR_RELEASE_STATE,
  SELECTIVELY_RELEASED_CONNECTOR_IDS,
  connectorReleased,
  connectorsReleased,
  hasReleasedConnectors,
} from '../connector-release';

describe('selective connector release', () => {
  it('keeps full-launch consumers locked while exposing a bounded subset for discovery', () => {
    expect(CONNECTOR_RELEASE_STATE).toBe('coming_soon');
    expect(connectorsReleased()).toBe(false);
    expect(hasReleasedConnectors()).toBe(true);
    expect(SELECTIVELY_RELEASED_CONNECTOR_IDS).toHaveLength(13);
    expect(new Set(SELECTIVELY_RELEASED_CONNECTOR_IDS).size).toBe(13);
    expect(Object.isFrozen(SELECTIVELY_RELEASED_CONNECTOR_IDS)).toBe(true);
  });

  it.each(SELECTIVELY_RELEASED_CONNECTOR_IDS)('releases the exact %s ID', (connectorId) => {
    expect(connectorReleased(connectorId)).toBe(true);
    expect(connectorReleased(connectorId.toUpperCase())).toBe(false);
    expect(connectorReleased(` ${connectorId}`)).toBe(false);
    expect(connectorReleased(`${connectorId} `)).toBe(false);
    expect(connectorReleased(`dir-${connectorId}`)).toBe(false);
    expect(connectorReleased(`custom-${connectorId}`)).toBe(false);
  });

  it.each([
    'gmail',
    'drive',
    'calendar',
    'github',
    'huggingface',
    'paypal',
    'plaid',
    'stripe',
    'bank-accounts',
    'slack',
    'vercel',
    'io.notion/mcp',
    'org-notion',
    'unknown',
    '',
    null,
    undefined,
    {},
  ])('does not widen release for %j', (connectorId) => {
    expect(connectorReleased(connectorId)).toBe(false);
  });
});
