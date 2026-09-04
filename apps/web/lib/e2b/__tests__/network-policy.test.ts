import { describe, expect, it } from 'vitest';

import {
  NETWORK_ACCESS_REQUIRES_PROXY_CODE,
  egressNeedsProxy,
  fullNetworkNeedsProxy,
} from '../network-policy';

describe('fullNetworkNeedsProxy', () => {
  it('flags full network for a harness whose managed credential would enter the sandbox unproxied', () => {
    expect(fullNetworkNeedsProxy('full', 'codex')).toBe(true);
    expect(fullNetworkNeedsProxy('full', 'droid')).toBe(true);
    expect(fullNetworkNeedsProxy('full', 'amp')).toBe(true);
    expect(fullNetworkNeedsProxy('full', 'grok')).toBe(true);
    expect(fullNetworkNeedsProxy('full', 'opencode')).toBe(true);
  });

  it('no longer flags a harness the credential proxy covers', () => {
    expect(fullNetworkNeedsProxy('full', 'claude')).toBe(false);
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

describe('egressNeedsProxy', () => {
  it('refuses extra egress hosts under trusted or none for a harness whose credential enters the sandbox', () => {
    expect(egressNeedsProxy('trusted', 'codex', false, 1)).toBe(true);
    expect(egressNeedsProxy('none', 'droid', false, 2)).toBe(true);
  });

  it('allows extra hosts for a proxied harness, an explicit credential, or no credential at all', () => {
    expect(egressNeedsProxy('trusted', 'claude', false, 3)).toBe(false);
    expect(egressNeedsProxy('trusted', 'codex', true, 3)).toBe(false);
    expect(egressNeedsProxy('trusted', 'code-interpreter-v1', false, 3)).toBe(false);
  });

  it('leaves the presets alone when no extra hosts are added', () => {
    expect(egressNeedsProxy('trusted', 'codex', false, 0)).toBe(false);
    expect(egressNeedsProxy('none', 'codex', false, 0)).toBe(false);
    expect(egressNeedsProxy('full', 'codex', false, 0)).toBe(true);
  });
});
