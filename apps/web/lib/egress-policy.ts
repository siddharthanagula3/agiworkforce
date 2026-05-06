/**
 * Egress policy: validates outbound URLs against a hardened allowlist.
 * Call validateEgressUrl() before any fetch() to an external service.
 *
 * WEB-NEW-009 hardening (2026-05-04 audit): the original allowlist correctly
 * rejected `https://169.254.169.254/...` (no allowlist hit) but offered no
 * defense-in-depth — a single allowlist regression (e.g., adding `*.com` by
 * accident) would expose internal services. We now reject IP-literal hosts
 * and reserved/private ranges *before* the allowlist check, so even an
 * over-broad allowlist cannot be coerced into reaching internal addresses.
 *
 * This also adds an exported `assertNonInternalHostname()` for use by other
 * modules that synthesize URLs (e.g., the chat-completions web_fetch tool
 * registration), giving them defense-in-depth without forcing the full
 * service-allowlist semantics.
 */

const ALLOWED_HOSTNAMES = [
  'api.anthropic.com',
  'api.openai.com',
  'generativelanguage.googleapis.com',
  'api.stripe.com',
  'api.upstash.io',
  // Supabase: wildcard for project-specific subdomains
] as const;

const SUPABASE_PATTERN = /^[a-z0-9-]+\.supabase\.(co|io)$/;

// Hostname strings that always identify the local machine.
const LOCALHOST_NAMES = new Set(['localhost', 'localhost.localdomain']);

const IPV4_LITERAL = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export class EgressPolicyError extends Error {
  constructor(url: string) {
    super(`Egress blocked: ${url} is not in the approved allowlist`);
    this.name = 'EgressPolicyError';
  }
}

/**
 * Returns true when the hostname resolves (lexically) to an internal,
 * loopback, link-local, or private-range address. Lexical-only check —
 * does NOT defend against DNS rebinding for hostnames that look public
 * but resolve internally; that requires a post-DNS check at request time.
 */
export function isInternalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();

  // Strip surrounding brackets for IPv6-literal hosts (e.g., `[::1]`).
  const unbracketed = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;

  if (LOCALHOST_NAMES.has(host)) return true;

  // IPv4 literal — parse octets and reject loopback / link-local / private.
  const m = IPV4_LITERAL.exec(unbracketed);
  if (m) {
    const oct = m.slice(1, 5).map((s) => Number(s));
    if (oct.some((o) => o < 0 || o > 255 || Number.isNaN(o))) return true; // invalid -> block
    const [a, b] = oct as [number, number, number, number];
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 172 && b! >= 16 && b! <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local + AWS metadata
    if (a === 100 && b! >= 64 && b! <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a === 0) return true; // 0.0.0.0/8
    if (a >= 224) return true; // 224+ multicast / reserved
    return false;
  }

  // IPv6 literal — coarse but adequate: reject ::1, fc00::/7 (ULA), fe80::/10 (link-local).
  if (unbracketed.includes(':')) {
    if (unbracketed === '::1' || unbracketed === '::' || unbracketed === '0:0:0:0:0:0:0:1')
      return true;
    if (/^fc[0-9a-f]{2}:/i.test(unbracketed)) return true; // ULA
    if (/^fd[0-9a-f]{2}:/i.test(unbracketed)) return true; // ULA
    if (/^fe[89ab][0-9a-f]:/i.test(unbracketed)) return true; // link-local
    return false;
  }

  return false;
}

/**
 * Throws if the URL points at an internal/loopback/private address.
 * Cheaper than `validateEgressUrl` — does not enforce the service
 * allowlist, just the never-route-internally invariant. Suitable for
 * URLs that originate from user input (e.g., custom OpenAI-compatible
 * base URLs that users legitimately want to point at any cloud provider,
 * but should never be allowed to point at AWS metadata).
 */
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

  // Defense-in-depth: even if an allowlist entry is overly broad, never
  // route to internal addresses.
  if (isInternalHostname(url.hostname)) {
    throw new EgressPolicyError(urlString);
  }

  const hostname = url.hostname;
  if (ALLOWED_HOSTNAMES.includes(hostname as (typeof ALLOWED_HOSTNAMES)[number])) return;
  if (SUPABASE_PATTERN.test(hostname)) return;

  throw new EgressPolicyError(urlString);
}

// Internal-service ports that user-supplied image URLs MUST NOT target. A
// remote attacker who controls a DNS record (or just types `1.2.3.4:5432`)
// can otherwise probe these services through the LLM provider's image
// fetcher.
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

/**
 * Strict validator for USER-SUPPLIED image URLs that flow into provider
 * payloads (Anthropic / OpenAI / Google). Pre-fix the chat completions
 * route forwarded these unchanged, so a request with
 *     image_url.url = "http://169.254.169.254/latest/meta-data/"
 * caused Anthropic's server to fetch IMDS — SSRF amplification (red-team
 * finding WEB-MULTIMODAL-IMAGE-SSRF, 2026-05).
 *
 * Differences from validateEgressUrl():
 * - Allows `data:` URLs (pass-through) since those don't trigger any fetch.
 * - Does NOT enforce the service allowlist (we don't know every legit
 *   image CDN; rejecting them all would break multimodal entirely).
 * - Adds an internal-service-port denylist on top of
 *   `isInternalHostname`, since a public-DNS hostname can still resolve
 *   to a public IP that is hosting `redis://1.2.3.4:6379` (or that the
 *   attacker controls).
 * - Rejects URLs containing userinfo (`https://user:pass@host/`) — that
 *   pattern is overwhelmingly phishing/exfil, never legitimate images.
 */
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
