import { describe, expect, it } from 'vitest';

import { InvalidExtraEgressHostsError } from '../egress-hosts';
import {
  assertExtraEgressHostsResolveSafely,
  type EgressHostResolver,
} from '../egress-host-resolution';

function fakeResolver(addresses: {
  v4?: Record<string, string[]>;
  v6?: Record<string, string[]>;
  fail?: Set<string>;
}): EgressHostResolver {
  return {
    async resolve4(hostname: string) {
      if (addresses.fail?.has(hostname)) throw new Error('ENOTFOUND');
      const result = addresses.v4?.[hostname];
      if (!result) throw Object.assign(new Error('ENODATA'), { code: 'ENODATA' });
      return result;
    },
    async resolve6(hostname: string) {
      if (addresses.fail?.has(hostname)) throw new Error('ENOTFOUND');
      const result = addresses.v6?.[hostname];
      if (!result) throw Object.assign(new Error('ENODATA'), { code: 'ENODATA' });
      return result;
    },
  };
}

describe('assertExtraEgressHostsResolveSafely', () => {
  it('allows a host that resolves only to public addresses', async () => {
    const resolver = fakeResolver({ v4: { 'reports.example.com': ['203.0.113.10'] } });
    await expect(
      assertExtraEgressHostsResolveSafely(['reports.example.com'], { resolver }),
    ).resolves.toBeUndefined();
  });

  it('rejects a host whose A record is the cloud metadata address', async () => {
    const resolver = fakeResolver({
      v4: { 'metadata.169.254.169.254.nip.io': ['169.254.169.254'] },
    });
    await expect(
      assertExtraEgressHostsResolveSafely(['metadata.169.254.169.254.nip.io'], { resolver }),
    ).rejects.toThrow(InvalidExtraEgressHostsError);
  });

  it('rejects a host that resolves into an RFC1918 private range', async () => {
    const resolver = fakeResolver({ v4: { 'internal.example.com': ['10.20.30.40'] } });
    await expect(
      assertExtraEgressHostsResolveSafely(['internal.example.com'], { resolver }),
    ).rejects.toThrow(InvalidExtraEgressHostsError);
  });

  it('rejects a host that resolves into an IPv6 unique-local range', async () => {
    const resolver = fakeResolver({ v6: { 'internal.example.com': ['fd12:3456:789a::1'] } });
    await expect(
      assertExtraEgressHostsResolveSafely(['internal.example.com'], { resolver }),
    ).rejects.toThrow(InvalidExtraEgressHostsError);
  });

  it('rejects a host that fails to resolve at all', async () => {
    const resolver = fakeResolver({ fail: new Set(['ghost.example.com']) });
    await expect(
      assertExtraEgressHostsResolveSafely(['ghost.example.com'], { resolver }),
    ).rejects.toThrow(InvalidExtraEgressHostsError);
  });

  it('resolves the base domain of a wildcard host', async () => {
    const resolver = fakeResolver({ v4: { 'example.com': ['10.0.0.5'] } });
    await expect(
      assertExtraEgressHostsResolveSafely(['*.example.com'], { resolver }),
    ).rejects.toThrow(InvalidExtraEgressHostsError);
  });

  it('is a no-op for an empty host list and never calls the resolver', async () => {
    let called = false;
    const resolver: EgressHostResolver = {
      async resolve4() {
        called = true;
        return [];
      },
      async resolve6() {
        called = true;
        return [];
      },
    };
    await assertExtraEgressHostsResolveSafely([], { resolver });
    expect(called).toBe(false);
  });

  it('allows a host reachable only over IPv6 with a public address', async () => {
    const resolver = fakeResolver({ v6: { 'v6only.example.com': ['2001:db8::1'] } });
    await expect(
      assertExtraEgressHostsResolveSafely(['v6only.example.com'], { resolver }),
    ).resolves.toBeUndefined();
  });
});
