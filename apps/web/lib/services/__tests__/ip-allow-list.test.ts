import { describe, expect, it } from 'vitest';
import { isIpAllowed, isValidCidr } from '../ip-allow-list';

describe('isValidCidr', () => {
  it('accepts a bare IPv4 address', () => {
    expect(isValidCidr('203.0.113.5')).toBe(true);
  });

  it('accepts an IPv4 CIDR block', () => {
    expect(isValidCidr('203.0.113.0/24')).toBe(true);
  });

  it('accepts a bare IPv6 address and an IPv6 CIDR block', () => {
    expect(isValidCidr('2001:db8::1')).toBe(true);
    expect(isValidCidr('2001:db8::/32')).toBe(true);
  });

  it('rejects a prefix outside the address family bounds', () => {
    expect(isValidCidr('203.0.113.0/33')).toBe(false);
    expect(isValidCidr('2001:db8::/129')).toBe(false);
  });

  it('rejects a non-numeric prefix and garbage input', () => {
    expect(isValidCidr('203.0.113.0/abc')).toBe(false);
    expect(isValidCidr('not-an-address')).toBe(false);
    expect(isValidCidr('')).toBe(false);
  });
});

describe('isIpAllowed', () => {
  it('allows any address when the list is empty', () => {
    expect(isIpAllowed('198.51.100.9', [])).toBe(true);
    expect(isIpAllowed(undefined, [])).toBe(true);
  });

  it('allows an IPv4 address inside a configured subnet', () => {
    expect(isIpAllowed('203.0.113.5', ['203.0.113.0/24'])).toBe(true);
  });

  it('denies an IPv4 address outside every configured subnet', () => {
    expect(isIpAllowed('198.51.100.9', ['203.0.113.0/24'])).toBe(false);
  });

  it('allows an exact-match single IPv4 address with no prefix', () => {
    expect(isIpAllowed('203.0.113.5', ['203.0.113.5'])).toBe(true);
    expect(isIpAllowed('203.0.113.6', ['203.0.113.5'])).toBe(false);
  });

  it('allows an IPv6 address inside a configured subnet', () => {
    expect(isIpAllowed('2001:db8::1', ['2001:db8::/32'])).toBe(true);
    expect(isIpAllowed('2001:db9::1', ['2001:db8::/32'])).toBe(false);
  });

  it('denies when the client ip could not be resolved and a list is configured', () => {
    expect(isIpAllowed(undefined, ['203.0.113.0/24'])).toBe(false);
  });

  it('denies when the client ip is malformed', () => {
    expect(isIpAllowed('not-an-address', ['203.0.113.0/24'])).toBe(false);
  });

  it('treats a list with only invalid entries as unconfigured (allows)', () => {
    expect(isIpAllowed('198.51.100.9', ['garbage', 'also-garbage'])).toBe(true);
  });

  it('skips invalid entries but still enforces the valid ones', () => {
    expect(isIpAllowed('203.0.113.5', ['garbage', '203.0.113.0/24'])).toBe(true);
    expect(isIpAllowed('198.51.100.9', ['garbage', '203.0.113.0/24'])).toBe(false);
  });

  it('allows an ipv4-mapped ipv6 client address inside a configured ipv4 subnet', () => {
    expect(isIpAllowed('::ffff:203.0.113.5', ['203.0.113.0/24'])).toBe(true);
  });

  it('denies an ipv4-mapped ipv6 client address outside every configured ipv4 subnet', () => {
    expect(isIpAllowed('::ffff:198.51.100.9', ['203.0.113.0/24'])).toBe(false);
  });

  it('allows an ipv4-mapped ipv6 client address inside a configured ipv4-mapped ipv6 subnet', () => {
    expect(isIpAllowed('::ffff:203.0.113.5', ['::ffff:203.0.113.0/120'])).toBe(true);
  });
});
