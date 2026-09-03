import 'server-only';

import { BlockList, isIP } from 'node:net';

const MAX_CIDR_PREFIX: Readonly<Record<4 | 6, number>> = Object.freeze({ 4: 32, 6: 128 });

function parseCidr(value: string): { address: string; family: 4 | 6; prefix: number } | null {
  const [address, prefixRaw] = value.split('/');
  if (!address) return null;
  const family = isIP(address);
  if (family !== 4 && family !== 6) return null;
  if (prefixRaw === undefined) return { address, family, prefix: MAX_CIDR_PREFIX[family] };
  if (!/^\d+$/.test(prefixRaw)) return null;
  const prefix = Number(prefixRaw);
  if (prefix < 0 || prefix > MAX_CIDR_PREFIX[family]) return null;
  return { address, family, prefix };
}

export function isValidCidr(value: string): boolean {
  return parseCidr(value) !== null;
}

export function isIpAllowed(clientIp: string | undefined, cidrs: readonly string[]): boolean {
  if (cidrs.length === 0) return true;
  if (!clientIp) return false;

  const clientFamily = isIP(clientIp);
  if (clientFamily !== 4 && clientFamily !== 6) return false;

  const list = new BlockList();
  let hasUsableEntry = false;
  for (const cidr of cidrs) {
    const parsed = parseCidr(cidr);
    if (!parsed) continue;
    try {
      list.addSubnet(parsed.address, parsed.prefix, parsed.family === 4 ? 'ipv4' : 'ipv6');
      hasUsableEntry = true;
    } catch {
      continue;
    }
  }
  if (!hasUsableEntry) return true;

  return list.check(clientIp, clientFamily === 4 ? 'ipv4' : 'ipv6');
}
