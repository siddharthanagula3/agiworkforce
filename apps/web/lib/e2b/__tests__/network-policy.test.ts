import { describe, expect, it } from 'vitest';

import { NETWORK_ACCESS_REQUIRES_PROXY_CODE, fullNetworkNeedsProxy } from '../network-policy';

describe('fullNetworkNeedsProxy', () => {
  it('flags full network for a harness whose managed credential would enter the sandbox', () => {
    expect(fullNetworkNeedsProxy('full', 'claude')).toBe(true);
    expect(fullNetworkNeedsProxy('full', 'codex')).toBe(true);
    expect(fullNetworkNeedsProxy('full', 'opencode')).toBe(true);
  });

  it('is false outside full network', () => {
    expect(fullNetworkNeedsProxy('trusted', 'claude')).toBe(false);
    expect(fullNetworkNeedsProxy('none', 'claude')).toBe(false);
  });

  it('is false with no runtime or a runtime that declares no credential', () => {
    expect(fullNetworkNeedsProxy('full', null)).toBe(false);
    expect(fullNetworkNeedsProxy('full', undefined)).toBe(false);
    expect(fullNetworkNeedsProxy('full', 'code-interpreter-v1')).toBe(false);
    expect(fullNetworkNeedsProxy('full', 'openclaw')).toBe(false);
  });

  it('is false when the caller supplies its own credential', () => {
    expect(fullNetworkNeedsProxy('full', 'claude', true)).toBe(false);
  });

  it('exports the machine-readable error code the route surfaces', () => {
    expect(NETWORK_ACCESS_REQUIRES_PROXY_CODE).toBe('network_access_requires_proxy');
  });
});
