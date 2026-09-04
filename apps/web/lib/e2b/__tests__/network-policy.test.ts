import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockHasServerProviderKey = vi.hoisted(() => vi.fn());

vi.mock('@/lib/services/provider-adapter-service', () => ({
  hasServerProviderKey: mockHasServerProviderKey,
}));

import {
  HARNESS_CREDENTIAL_UNAVAILABLE_CODE,
  NETWORK_ACCESS_REQUIRES_PROXY_CODE,
  egressNeedsProxy,
  fullNetworkNeedsProxy,
  harnessCredentialIsAvailable,
} from '../network-policy';

describe('fullNetworkNeedsProxy', () => {
  it('flags full network for a harness whose managed credential would enter the sandbox unproxied', () => {
    expect(fullNetworkNeedsProxy('full', 'droid')).toBe(true);
    expect(fullNetworkNeedsProxy('full', 'amp')).toBe(true);
    expect(fullNetworkNeedsProxy('full', 'grok')).toBe(true);
    expect(fullNetworkNeedsProxy('full', 'opencode')).toBe(true);
  });

  it('no longer flags a harness the credential proxy covers, by env var or by config file', () => {
    expect(fullNetworkNeedsProxy('full', 'claude')).toBe(false);
    expect(fullNetworkNeedsProxy('full', 'codex')).toBe(false);
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
    expect(egressNeedsProxy('trusted', 'grok', false, 1)).toBe(true);
    expect(egressNeedsProxy('none', 'droid', false, 2)).toBe(true);
  });

  it('allows extra hosts for a proxied harness, an explicit credential, or no credential at all', () => {
    expect(egressNeedsProxy('trusted', 'claude', false, 3)).toBe(false);
    expect(egressNeedsProxy('trusted', 'codex', false, 3)).toBe(false);
    expect(egressNeedsProxy('trusted', 'droid', true, 3)).toBe(false);
    expect(egressNeedsProxy('trusted', 'code-interpreter-v1', false, 3)).toBe(false);
  });

  it('leaves the presets alone when no extra hosts are added', () => {
    expect(egressNeedsProxy('trusted', 'grok', false, 0)).toBe(false);
    expect(egressNeedsProxy('none', 'grok', false, 0)).toBe(false);
    expect(egressNeedsProxy('full', 'grok', false, 0)).toBe(true);
  });
});

describe('harnessCredentialIsAvailable', () => {
  beforeEach(() => {
    mockHasServerProviderKey.mockReset();
  });

  it('rejects a harness whose managed configuration has no credential for its provider', () => {
    mockHasServerProviderKey.mockReturnValue(false);
    expect(harnessCredentialIsAvailable('droid')).toBe(false);
    expect(harnessCredentialIsAvailable('amp')).toBe(false);
  });

  it('allows the same harness once an explicit credential is supplied', () => {
    mockHasServerProviderKey.mockReturnValue(false);
    expect(harnessCredentialIsAvailable('droid', true)).toBe(true);
  });

  it('allows a harness whose managed configuration has a credential for its provider', () => {
    mockHasServerProviderKey.mockReturnValue(true);
    expect(harnessCredentialIsAvailable('claude')).toBe(true);
    expect(harnessCredentialIsAvailable('codex')).toBe(true);
  });

  it('rejects a harness the credential proxy does not cover even with a managed credential present', () => {
    mockHasServerProviderKey.mockReturnValue(true);
    expect(harnessCredentialIsAvailable('droid')).toBe(false);
    expect(harnessCredentialIsAvailable('grok')).toBe(false);
  });

  it('is true with no runtime or a runtime that declares no credential', () => {
    mockHasServerProviderKey.mockReturnValue(false);
    expect(harnessCredentialIsAvailable(null)).toBe(true);
    expect(harnessCredentialIsAvailable(undefined)).toBe(true);
    expect(harnessCredentialIsAvailable('code-interpreter-v1')).toBe(true);
  });

  it('exports the machine-readable error code the route surfaces', () => {
    expect(HARNESS_CREDENTIAL_UNAVAILABLE_CODE).toBe('harness_credential_unavailable');
  });
});
