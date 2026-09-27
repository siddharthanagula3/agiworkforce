import 'server-only';

import { isIPv4, isIPv6 } from 'node:net';
import { hashIpAddress } from '@/lib/server/ip-hash';
import disposableEmailDomains from '@/lib/services/disposable-email-domains.json';

const NETWORK_HASH_DOMAIN = 'referral-network';
const IPV4_MAPPED_PREFIX = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;
const IPV6_GROUPS = 8;
const IPV6_NETWORK_GROUPS = 4;
const GMAIL_DOMAIN = 'gmail.com';
const GMAIL_DOMAINS: ReadonlySet<string> = new Set([GMAIL_DOMAIN, 'googlemail.com']);
const DISPOSABLE_DOMAINS: ReadonlySet<string> = new Set(disposableEmailDomains);

export function normalizeEmailIdentity(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase() ?? '';
  const separator = trimmed.lastIndexOf('@');
  if (separator <= 0 || separator === trimmed.length - 1) return null;
  const domain = trimmed.slice(separator + 1);
  const unaliased = trimmed.slice(0, separator).split('+')[0] ?? '';
  const local = GMAIL_DOMAINS.has(domain) ? unaliased.replace(/\./g, '') : unaliased;
  if (!local) return null;
  return `${local}@${GMAIL_DOMAINS.has(domain) ? GMAIL_DOMAIN : domain}`;
}

export function isDisposableEmail(email: string | null | undefined): boolean {
  const domain = email?.trim().toLowerCase().split('@').at(-1) ?? '';
  const labels = domain.split('.').filter(Boolean);
  return labels.some((_, index) => {
    const candidate = labels.slice(index).join('.');
    return candidate.includes('.') && DISPOSABLE_DOMAINS.has(candidate);
  });
}

function ipv6NetworkGroups(address: string): string[] | null {
  const halves = address.toLowerCase().split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? IPV6_GROUPS - head.length - tail.length : 0;
  if (fill < 0) return null;
  const groups = [...head, ...Array<string>(fill).fill('0'), ...tail];
  return groups.slice(0, IPV6_NETWORK_GROUPS).map((group) => group.padStart(4, '0'));
}

function networkPrefix(address: string): string | null {
  const candidate = address.trim();
  const ipv4 = IPV4_MAPPED_PREFIX.exec(candidate)?.[1] ?? candidate;
  if (isIPv4(ipv4)) return `${ipv4.split('.').slice(0, 3).join('.')}.0/24`;
  if (!isIPv6(candidate)) return null;
  const groups = ipv6NetworkGroups(candidate);
  return groups ? `${groups.join(':')}::/64` : null;
}

export function referralNetworkHash(address: string | null | undefined): string | null {
  if (!address) return null;
  const prefix = networkPrefix(address);
  return prefix ? hashIpAddress(prefix, NETWORK_HASH_DOMAIN) : null;
}
