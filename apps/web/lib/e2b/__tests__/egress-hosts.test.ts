import { describe, expect, it } from 'vitest';

import { InvalidExtraEgressHostsError, normalizeExtraEgressHosts } from '../egress-hosts';

describe('normalizeExtraEgressHosts', () => {
  it('is empty for no input', () => {
    expect(normalizeExtraEgressHosts(undefined)).toEqual([]);
    expect(normalizeExtraEgressHosts(null)).toEqual([]);
  });

  it('lowercases, trims, and de-duplicates', () => {
    expect(normalizeExtraEgressHosts([' Example.COM ', 'example.com'])).toEqual(['example.com']);
  });

  it('allows one leading subdomain wildcard', () => {
    expect(normalizeExtraEgressHosts(['*.example.com'])).toEqual(['*.example.com']);
  });

  it('rejects a wildcard anywhere but the leading label', () => {
    expect(() => normalizeExtraEgressHosts(['api.*.example.com'])).toThrow(
      InvalidExtraEgressHostsError,
    );
    expect(() => normalizeExtraEgressHosts(['*.*.example.com'])).toThrow(
      InvalidExtraEgressHostsError,
    );
  });

  it('rejects a non-hostname value', () => {
    expect(() => normalizeExtraEgressHosts(['not a host'])).toThrow(InvalidExtraEgressHostsError);
    expect(() => normalizeExtraEgressHosts(['http://example.com'])).toThrow(
      InvalidExtraEgressHostsError,
    );
    expect(() => normalizeExtraEgressHosts(['example.com/path'])).toThrow(
      InvalidExtraEgressHostsError,
    );
    expect(() => normalizeExtraEgressHosts(['1.2.3.4/32'])).toThrow(InvalidExtraEgressHostsError);
  });

  it('rejects a non-string entry', () => {
    expect(() => normalizeExtraEgressHosts([42])).toThrow(InvalidExtraEgressHostsError);
  });

  it('rejects a value that is not an array', () => {
    expect(() => normalizeExtraEgressHosts('example.com')).toThrow(InvalidExtraEgressHostsError);
  });

  it('rejects more than the named maximum', () => {
    const hosts = Array.from({ length: 11 }, (_, i) => `host-${i}.example.com`);
    expect(() => normalizeExtraEgressHosts(hosts)).toThrow(InvalidExtraEgressHostsError);
  });

  it('accepts exactly the named maximum', () => {
    const hosts = Array.from({ length: 10 }, (_, i) => `host-${i}.example.com`);
    expect(normalizeExtraEgressHosts(hosts)).toHaveLength(10);
  });
});
