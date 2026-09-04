import 'server-only';

import dns from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { InvalidExtraEgressHostsError } from '@/lib/e2b/egress-hosts';

export const EGRESS_HOST_RESOLUTION_TIMEOUT_MS = 2_000;

export interface EgressHostResolver {
  resolve4(hostname: string): Promise<string[]>;
  resolve6(hostname: string): Promise<string[]>;
}

const defaultResolver: EgressHostResolver = {
  resolve4: (hostname) => dns.resolve4(hostname),
  resolve6: (hostname) => dns.resolve6(hostname),
};

const DISALLOWED_EGRESS_RANGES = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['127.0.0.0', 8],
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['169.254.0.0', 16],
] as const) {
  DISALLOWED_EGRESS_RANGES.addSubnet(address, prefix, 'ipv4');
}
for (const [address, prefix] of [
  ['::1', 128],
  ['fe80::', 10],
  ['fc00::', 7],
] as const) {
  DISALLOWED_EGRESS_RANGES.addSubnet(address, prefix, 'ipv6');
}

function isDisallowedEgressAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return DISALLOWED_EGRESS_RANGES.check(address, 'ipv4');
  if (family === 6) return DISALLOWED_EGRESS_RANGES.check(address, 'ipv6');
  return true;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('DNS resolution timed out')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function resolveHostAddresses(
  hostname: string,
  resolver: EgressHostResolver,
  timeoutMs: number,
): Promise<string[]> {
  const [ipv4, ipv6] = await Promise.allSettled([
    withTimeout(resolver.resolve4(hostname), timeoutMs),
    withTimeout(resolver.resolve6(hostname), timeoutMs),
  ]);
  if (ipv4.status === 'rejected' && ipv6.status === 'rejected') {
    throw ipv4.reason instanceof Error ? ipv4.reason : new Error(String(ipv4.reason));
  }
  const addresses: string[] = [];
  if (ipv4.status === 'fulfilled') addresses.push(...ipv4.value);
  if (ipv6.status === 'fulfilled') addresses.push(...ipv6.value);
  return addresses;
}

export async function assertExtraEgressHostsResolveSafely(
  hosts: readonly string[],
  options: { resolver?: EgressHostResolver; timeoutMs?: number } = {},
): Promise<void> {
  const resolver = options.resolver ?? defaultResolver;
  const timeoutMs = options.timeoutMs ?? EGRESS_HOST_RESOLUTION_TIMEOUT_MS;

  await Promise.all(
    hosts.map(async (host) => {
      const lookupHost = host.replace(/^\*\./, '');
      let addresses: string[];
      try {
        addresses = await resolveHostAddresses(lookupHost, resolver, timeoutMs);
      } catch {
        throw new InvalidExtraEgressHostsError(`"${host}" could not be resolved`);
      }
      if (addresses.length === 0) {
        throw new InvalidExtraEgressHostsError(`"${host}" could not be resolved`);
      }
      if (addresses.some((address) => isDisallowedEgressAddress(address))) {
        throw new InvalidExtraEgressHostsError(
          `"${host}" resolves to a private, loopback, or link-local address and cannot be used as an extra egress host`,
        );
      }
    }),
  );
}
