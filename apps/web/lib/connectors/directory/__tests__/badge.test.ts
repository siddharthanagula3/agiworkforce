import { describe, expect, it } from 'vitest';

import { deriveInternalBadge, deriveRegistryBadge } from '@/lib/connectors/directory/badge';

describe('deriveInternalBadge', () => {
  it('is always first-party', () => {
    expect(deriveInternalBadge()).toBe('first-party');
  });
});

describe('deriveRegistryBadge', () => {
  it('badges a GitHub-verified namespace as registry', () => {
    expect(deriveRegistryBadge('io.github.acme/weather')).toBe('registry');
  });

  it('badges a custom-domain namespace as community', () => {
    expect(deriveRegistryBadge('ac.inference.sh/mcp')).toBe('community');
  });
});
