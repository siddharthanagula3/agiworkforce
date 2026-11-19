import { catalogConnectorName } from '@agiworkforce/cloud-contracts';

import { formatConnectorName } from '@/src/features/settings/cloud-connectors/connectorStatus';

describe('formatConnectorName', () => {
  it('names a first-party connector the way the shared catalog does', () => {
    expect(formatConnectorName('hubspot')).toBe('HubSpot');
    expect(formatConnectorName('github')).toBe('GitHub');
    expect(formatConnectorName('google-drive')).toBe(catalogConnectorName('google-drive'));
  });

  it('title-cases a custom or unknown connector id', () => {
    expect(formatConnectorName('custom-acme_tools')).toBe('Acme Tools');
    expect(formatConnectorName('internal-wiki')).toBe('Internal Wiki');
  });

  it('does not treat an inherited object key as a catalog connector', () => {
    expect(formatConnectorName('constructor')).toBe('Constructor');
  });
});
