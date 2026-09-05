/**
 * Egress policy: validates outbound URLs against a hardened allowlist.
 * Call validateEgressUrl() before any fetch() to an external service.
 *
 * WEB-NEW-009 hardening (2026-05-04 audit): the original allowlist correctly
 * rejected `https://169.254.169.254/...` (no allowlist hit) but offered no
 * defense-in-depth · a single allowlist regression (e.g., adding `*.com` by
 * accident) would expose internal services. We now reject IP-literal hosts
 * and reserved/private ranges *before* the allowlist check, so even an
 * over-broad allowlist cannot be coerced into reaching internal addresses.
 *
 * This also adds an exported `assertNonInternalHostname()` for use by other
 * modules that synthesize URLs (e.g., the chat-completions web_fetch tool
 * registration), giving them defense-in-depth without forcing the full
 * service-allowlist semantics.
 */

import { ALLOWED_MANAGED_PROVIDER_HOSTS } from '@agiworkforce/provider-runtime';

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { LookupFunction } from 'node:net';
import { Agent, fetch as undiciFetch, type Dispatcher } from 'undici';

import { TRACEPARENT_HEADER, outboundTraceparent } from '@/lib/observability/trace-propagation';

const RETIRED_PROVIDER_HOSTS: ReadonlySet<string> = new Set(['api.mulerouter.ai']);

const ALLOWED_SERVICE_HOSTNAMES: readonly string[] = [
  'api.stripe.com',
  'api.upstash.io',
  'places.googleapis.com',
  // Neon: wildcard for project-specific subdomains
];

const ALLOWED_HOSTNAMES: ReadonlySet<string> = new Set([
  ...[...ALLOWED_MANAGED_PROVIDER_HOSTS].filter((host) => !RETIRED_PROVIDER_HOSTS.has(host)),
  ...ALLOWED_SERVICE_HOSTNAMES,
]);

const LOCALHOST_NAMES = new Set(['localhost', 'localhost.localdomain']);

const IPV4_LITERAL = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function isInternalIpv4(oct: number[]): boolean {
  if (oct.length !== 4) return true;
  if (oct.some((o) => o < 0 || o > 255 || Number.isNaN(o))) return true;
  const [a, b] = oct as [number, number, number, number];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 0) return true;
  if (a >= 224) return true;
  return false;
}

function extractEmbeddedIpv4(ipv6: string): number[] | null {
  const lower = ipv6.toLowerCase();
  const dotted = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(lower);
  if (dotted) return dotted.slice(1, 5).map((s) => Number(s));
  const hex = /(?:ffff|ff9b)(?:::|:)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (hex) {
    const hi = parseInt(hex[1]!, 16);
    const lo = parseInt(hex[2]!, 16);
    return [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff];
  }
  return null;
}

export class EgressPolicyError extends Error {
  constructor(url: string) {
    super(`Egress blocked: ${url} is not in the approved allowlist`);
    this.name = 'EgressPolicyError';
  }
}

export function isInternalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();

  const unbracketed = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;

  if (LOCALHOST_NAMES.has(host)) return true;

  const m = IPV4_LITERAL.exec(unbracketed);
  if (m) {
    return isInternalIpv4(m.slice(1, 5).map((s) => Number(s)));
  }

  if (unbracketed.includes(':')) {
    if (unbracketed === '::1' || unbracketed === '::' || unbracketed === '0:0:0:0:0:0:0:1')
      return true;
    if (/^fc[0-9a-f]{2}:/i.test(unbracketed)) return true;
    if (/^fd[0-9a-f]{2}:/i.test(unbracketed)) return true;
    if (/^fe[89ab][0-9a-f]:/i.test(unbracketed)) return true;
    const embedded = extractEmbeddedIpv4(unbracketed);
    if (embedded && isInternalIpv4(embedded)) return true;
    return false;
  }

  return false;
}

export function assertNonInternalHostname(urlString: string): void {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new EgressPolicyError(urlString);
  }
  if (isInternalHostname(url.hostname)) {
    throw new EgressPolicyError(urlString);
  }
}

interface PinnedAddress {
  address: string;
  family: number;
}

const PIN_TTL_MS = 60_000;
const pinnedAddresses = new Map<string, { entries: PinnedAddress[]; expiresAt: number }>();

// The connection must reuse the addresses the policy vetted: a second, independent DNS
// resolution inside fetch() is what a rebinding attacker controls.
function rememberPinnedAddresses(hostname: string, entries: PinnedAddress[]): void {
  if (pinnedAddresses.size > 5_000) {
    const now = Date.now();
    for (const [host, pin] of pinnedAddresses) {
      if (pin.expiresAt < now) pinnedAddresses.delete(host);
    }
  }
  pinnedAddresses.set(hostname.toLowerCase(), { entries, expiresAt: Date.now() + PIN_TTL_MS });
}

export function pinnedAddressesFor(hostname: string): PinnedAddress[] | null {
  const pin = pinnedAddresses.get(hostname.toLowerCase());
  if (!pin || pin.expiresAt < Date.now()) return null;
  return pin.entries;
}

type PinnedLookupCallback = (
  error: Error | null,
  address?: string | Array<{ address: string; family: number }>,
  family?: number,
) => void;

export function pinnedLookup(
  hostname: string,
  options: { all?: boolean } | number | undefined,
  callback: PinnedLookupCallback,
): void {
  const entries = pinnedAddressesFor(hostname);
  if (!entries || entries.length === 0) {
    callback(new Error(`Refusing to connect to ${hostname}: no vetted address is pinned`));
    return;
  }
  if (typeof options === 'object' && options?.all) {
    callback(null, entries);
    return;
  }
  callback(null, entries[0]!.address, entries[0]!.family);
}

let pinnedAgent: Dispatcher | null = null;

export function getPinnedPublicDispatcher(): Dispatcher {
  if (!pinnedAgent) {
    pinnedAgent = new Agent({
      connect: { lookup: pinnedLookup as unknown as LookupFunction },
    });
  }
  return pinnedAgent;
}

function targetHostname(input: string | URL | Request): string | null {
  try {
    if (typeof input === 'string') return new URL(input).hostname;
    if (input instanceof URL) return input.hostname;
    return new URL(input.url).hostname;
  } catch {
    return null;
  }
}

/**
 * A trace id is internal correlation data, so it travels only to the hosts the
 * egress allowlist already vouches for, never to a user-supplied fetch target.
 */
export function withOutboundTraceHeader(
  input: string | URL | Request,
  init?: RequestInit,
): RequestInit | undefined {
  const hostname = targetHostname(input)?.toLowerCase();
  if (!hostname || !ALLOWED_HOSTNAMES.has(hostname)) return init;
  const traceparent = outboundTraceparent();
  if (!traceparent) return init;
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  );
  if (headers.has(TRACEPARENT_HEADER)) return init;
  headers.set(TRACEPARENT_HEADER, traceparent);
  return { ...init, headers };
}

export function pinnedPublicFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  // Deliberately undici's own fetch, not the global one. The dispatcher below is
  // an undici Agent from this app's bundled undici; the production runtime
  // instruments the global fetch with a different undici instance, and handing
  // one's Agent to the other's fetch is rejected at dispatch with
  // `invalid onRequestStart method`. That killed every pinned request in
  // production - MCP capability discovery over both transports, web_fetch, and
  // audit streaming - while working locally, where the global fetch is plain
  // undici of the same version. Pairing the Agent with its own fetch keeps the
  // DNS pinning that defends against rebinding rather than dropping it.
  return undiciFetch(input as Parameters<typeof undiciFetch>[0], {
    ...(withOutboundTraceHeader(input, init) as Parameters<typeof undiciFetch>[1]),
    dispatcher: getPinnedPublicDispatcher(),
  }) as unknown as Promise<Response>;
}

export async function assertResolvedPublicHostname(urlString: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new EgressPolicyError(urlString);
  }

  assertNonInternalHostname(urlString);

  const literalFamily = isIP(url.hostname);
  if (literalFamily !== 0) {
    rememberPinnedAddresses(url.hostname, [{ address: url.hostname, family: literalFamily }]);
    return;
  }

  let addresses: Array<{ address: string; family?: number }>;
  try {
    addresses = await lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    throw new EgressPolicyError(urlString);
  }

  if (addresses.length === 0) {
    throw new EgressPolicyError(urlString);
  }

  for (const entry of addresses) {
    if (isInternalHostname(entry.address)) {
      throw new EgressPolicyError(urlString);
    }
  }

  rememberPinnedAddresses(
    url.hostname,
    addresses.map((entry) => ({
      address: entry.address,
      family: entry.family ?? isIP(entry.address),
    })),
  );
}

export function validateEgressUrl(urlString: string): void {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new EgressPolicyError(urlString);
  }

  if (url.protocol !== 'https:') {
    throw new EgressPolicyError(urlString);
  }

  if (isInternalHostname(url.hostname)) {
    throw new EgressPolicyError(urlString);
  }

  if (ALLOWED_HOSTNAMES.has(url.hostname)) return;

  throw new EgressPolicyError(urlString);
}

const INTERNAL_SERVICE_PORTS = new Set([
  '22', // ssh
  '23', // telnet
  '25', // smtp
  '111', // rpcbind
  '135',
  '139',
  '445', // smb / netbios
  '3306', // mysql
  '5432', // postgres
  '5984', // couchdb
  '6379', // redis
  '8500', // consul
  '9092', // kafka
  '9200', // elasticsearch
  '11211', // memcached
  '11434', // ollama
  '27017', // mongo
]);

export function isDataUrl(urlString: string): boolean {
  return urlString.length >= 5 && urlString.slice(0, 5).toLowerCase() === 'data:';
}

export function validateUserImageUrl(urlString: string): void {
  if (typeof urlString !== 'string' || urlString.length === 0) {
    throw new EgressPolicyError(String(urlString));
  }
  if (isDataUrl(urlString)) return;

  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new EgressPolicyError(urlString);
  }

  if (url.protocol !== 'https:') {
    throw new EgressPolicyError(urlString);
  }
  if (url.username !== '' || url.password !== '') {
    throw new EgressPolicyError(urlString);
  }
  if (url.port !== '' && INTERNAL_SERVICE_PORTS.has(url.port)) {
    throw new EgressPolicyError(urlString);
  }
  if (isInternalHostname(url.hostname)) {
    throw new EgressPolicyError(urlString);
  }
}
