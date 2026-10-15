import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { isInternalHostname } from './egress-policy';

const DESKTOP_JUDGE = join(process.cwd(), '../desktop/src-tauri/src/sys/security/egress_policy.rs');

function functionBody(source: string, name: string): string {
  const start = source.indexOf(`fn ${name}(`);
  if (start < 0) throw new Error(`${name} is missing from the desktop egress judge`);
  const end = source.indexOf('\n}\n', start);
  if (end < 0) throw new Error(`${name} has no end in the desktop egress judge`);
  return source.slice(start, end);
}

function ipv4RangeEnds(cidr: string): [string, string] {
  const [network, prefix] = cidr.split('/') as [string, string];
  const octets = network.split('.').map((octet) => Number(octet));
  while (octets.length < 4) octets.push(0);
  const first = octets.reduce((value, octet) => value * 256 + octet, 0);
  const last = first + 2 ** (32 - Number(prefix)) - 1;
  const dotted = (value: number) =>
    [24, 16, 8, 0].map((shift) => Math.floor(value / 2 ** shift) % 256).join('.');
  return [dotted(first), dotted(last)];
}

function ipv6RangeEnds(cidr: string): [string, string] {
  const [network, prefix] = cidr.split('/') as [string, string];
  const groups = network
    .replace(/::$/, '')
    .split(':')
    .map((group) => parseInt(group, 16));
  while (groups.length < 8) groups.push(0);
  const one = BigInt(1);
  const groupBits = BigInt(16);
  const groupMask = BigInt(0xffff);
  const first = groups.reduce((value, group) => (value << groupBits) | BigInt(group), BigInt(0));
  const last = first | ((one << BigInt(128 - Number(prefix))) - one);
  const text = (value: bigint) =>
    Array.from({ length: 8 }, (_, index) =>
      ((value >> BigInt(16 * (7 - index))) & groupMask).toString(16),
    ).join(':');
  return [text(first), text(last)];
}

const source = readFileSync(DESKTOP_JUDGE, 'utf8');
const desktopIpv4Ranges = [
  ...functionBody(source, 'is_internal_ipv4').matchAll(/\b\d{1,3}(?:\.\d{1,3}){0,3}\/\d{1,2}\b/g),
].map((match) => match[0]);
const desktopIpv6Ranges = [
  ...functionBody(source, 'is_internal_ipv6').matchAll(
    /\b[0-9a-f]{1,4}(?::[0-9a-f]{1,4})*::\/\d{1,3}\b/gi,
  ),
].map((match) => match[0]);

describe('the web egress judge refuses every range the desktop judge names', () => {
  it('reads the ranges out of the desktop judge, including the ones added on 2026-10-11', () => {
    expect(desktopIpv4Ranges).toEqual(
      expect.arrayContaining([
        '127.0.0.0/8',
        '10/8',
        '172.16/12',
        '192.168/16',
        '169.254/16',
        '100.64/10',
        '192.0.2/24',
        '198.51.100/24',
        '203.0.113/24',
        '192.0.0.0/24',
        '198.18/15',
        '224/4',
        '240/4',
      ]),
    );
    expect(desktopIpv6Ranges).toEqual(
      expect.arrayContaining([
        'fc00::/7',
        'fe80::/10',
        'fec0::/10',
        '2002::/16',
        '2001::/32',
        '2001:db8::/32',
        '100::/64',
      ]),
    );
  });

  it.each(desktopIpv4Ranges)('refuses both ends of the desktop IPv4 range %s', (cidr) => {
    for (const address of ipv4RangeEnds(cidr)) {
      expect(isInternalHostname(address), address).toBe(true);
    }
  });

  it.each(desktopIpv6Ranges)('refuses both ends of the desktop IPv6 range %s', (cidr) => {
    for (const address of ipv6RangeEnds(cidr)) {
      expect(isInternalHostname(address), address).toBe(true);
      expect(isInternalHostname(`[${address}]`), address).toBe(true);
    }
  });
});

// The desktop judge writes some rules as a method call with no range beside
// it. Each is paired here with addresses the web judge must refuse, and a
// method the desktop judge starts calling without an entry here fails below.
const DESKTOP_METHOD_RULES: ReadonlyArray<{
  judge: 'is_internal_ipv4' | 'is_internal_ipv6';
  method: string;
  refused: readonly string[];
}> = [
  { judge: 'is_internal_ipv4', method: 'is_loopback', refused: ['127.0.0.1', '127.255.255.255'] },
  {
    judge: 'is_internal_ipv4',
    method: 'is_private',
    refused: ['10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1'],
  },
  { judge: 'is_internal_ipv4', method: 'is_link_local', refused: ['169.254.169.254'] },
  { judge: 'is_internal_ipv4', method: 'is_broadcast', refused: ['255.255.255.255'] },
  {
    judge: 'is_internal_ipv4',
    method: 'is_documentation',
    refused: ['192.0.2.1', '198.51.100.1', '203.0.113.1'],
  },
  { judge: 'is_internal_ipv6', method: 'to_ipv4', refused: ['::ffff:127.0.0.1', '::10.0.0.1'] },
  { judge: 'is_internal_ipv6', method: 'is_loopback', refused: ['::1', '[::1]'] },
  { judge: 'is_internal_ipv6', method: 'is_unspecified', refused: ['::'] },
  {
    judge: 'is_internal_ipv6',
    method: 'is_multicast',
    refused: [
      'ff00::1',
      'ff02::1',
      'ff05::2',
      'ff0e::1',
      '[ff02::fb]',
      'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
    ],
  },
];

describe('the web egress judge mirrors the rules the desktop judge writes as method calls', () => {
  it.each(DESKTOP_METHOD_RULES)(
    'refuses what $judge refuses through ip.$method()',
    ({ judge, method, refused }) => {
      expect(functionBody(source, judge)).toContain(`ip.${method}()`);
      for (const address of refused) {
        expect(isInternalHostname(address), address).toBe(true);
      }
    },
  );

  it.each(['is_internal_ipv4', 'is_internal_ipv6'] as const)(
    'has a pairing for every method %s calls on the address',
    (judge) => {
      const called = [...functionBody(source, judge).matchAll(/\bip\.([a-z0-9_]+)\(\)/g)].map(
        (match) => match[1],
      );
      const paired = DESKTOP_METHOD_RULES.filter((rule) => rule.judge === judge).map(
        (rule) => rule.method,
      );
      expect(called.length).toBeGreaterThan(0);
      for (const method of called) {
        if (method === 'octets' || method === 'segments') continue;
        expect(paired, `ip.${method}() in ${judge}`).toContain(method);
      }
    },
  );

  it('refuses IPv4 multicast, which the desktop judge writes as 224/4', () => {
    expect(desktopIpv4Ranges).toContain('224/4');
    for (const address of ['224.0.0.1', '224.0.0.251', '239.255.255.250']) {
      expect(isInternalHostname(address), address).toBe(true);
    }
  });
});

describe('the ranges added to the web judge on 2026-10-11', () => {
  it.each([
    '198.18.0.1',
    '198.19.255.254',
    '192.0.0.8',
    '192.0.2.10',
    '198.51.100.10',
    '203.0.113.10',
    '240.0.0.1',
    '2002:a9fe:a9fe::1',
    '2002:808:808::1',
    '2001:0:4136:e378:8000:63bf:3fff:fdd2',
    '2001::1',
    'fec0::1',
    'feff:ffff::1',
    '100::1',
    '2001:db8::1',
    '[2001:db8::1]',
  ])('refuses %s', (host) => {
    expect(isInternalHostname(host)).toBe(true);
  });

  it.each([
    '198.17.255.255',
    '198.20.0.1',
    '192.0.1.1',
    '198.51.101.1',
    '203.0.114.1',
    '2001:4860:4860::8888',
    '2003::1',
    '100:0:0:1::1',
    '2606:2800:220:1:248:1893:25c8:1946',
    '::ffff:8.8.8.8',
    'fe00::1',
    'fe7f::1',
  ])('still reaches the neighbouring public address %s', (host) => {
    expect(isInternalHostname(host)).toBe(false);
  });
});
