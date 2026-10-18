import { describe, expect, it } from 'vitest';

import { resolveConnectorHealth } from '@/lib/connectors/catalog';

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
