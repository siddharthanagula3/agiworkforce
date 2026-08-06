import 'server-only';

/**
 * Validation for identity-provider configuration supplied by a customer admin.
 *
 * Everything here is treated as hostile input. Two threat models apply:
 *
 *   SSRF — a metadata or discovery URL is fetched by Clerk (and would be
 *   fetched by us if we ever resolved it), so an attacker-supplied URL must not
 *   be able to name a loopback, private, link-local, or cloud metadata host.
 *
 *   Domain hijack — this deployment creates instance-level Clerk enterprise
 *   connections, so a connection claiming `gmail.com` would capture every
 *   Gmail-addressed sign-in. Public mailbox providers are refused outright and
 *   every other domain must pass DNS ownership verification before activation.
 *
 * SAML XML is never parsed here. Clerk is the SAML implementation; we only
 * bound the payload's size and confirm it is shaped like an EntityDescriptor
 * before forwarding, so a hand-crafted entity-expansion or external-entity
 * payload never meets an XML parser we own.
 */

export class IdpValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = 'IdpValidationError';
    this.field = field;
  }
}

/**
 * Clerk's SAML attribute mapping accepts exactly these keys. An allowlist keeps
 * an unbounded caller-supplied record from reaching the provider.
 */
export const ALLOWED_ATTRIBUTE_MAPPING_KEYS = [
  'userId',
  'emailAddress',
  'firstName',
  'lastName',
] as const;

export type AllowedAttributeMappingKey = (typeof ALLOWED_ATTRIBUTE_MAPPING_KEYS)[number];

export type SamlAttributeMapping = Partial<Record<AllowedAttributeMappingKey, string>>;

/**
 * Mailbox providers whose domains are shared by unrelated people. Claiming one
 * would hand the claimant every sign-in on that domain.
 */
const PUBLIC_MAILBOX_DOMAINS = new Set([
  'aol.com',
  'fastmail.com',
  'gmail.com',
  'googlemail.com',
  'gmx.com',
  'gmx.de',
  'gmx.net',
  'hey.com',
  'hotmail.co.uk',
  'hotmail.com',
  'hotmail.fr',
  'icloud.com',
  'inbox.com',
  'live.co.uk',
  'live.com',
  'mac.com',
  'mail.com',
  'mail.ru',
  'me.com',
  'msn.com',
  'outlook.com',
  'pm.me',
  'proton.me',
  'protonmail.com',
  'qq.com',
  'rediffmail.com',
  'tutanota.com',
  'yahoo.co.in',
  'yahoo.co.jp',
  'yahoo.co.uk',
  'yahoo.com',
  'yandex.com',
  'yandex.ru',
  'zoho.com',
]);

/** Hostnames that name the caller's own network rather than a public IdP. */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
]);

const BLOCKED_HOSTNAME_SUFFIXES = ['.localhost', '.local', '.internal', '.localdomain'];

const DOMAIN_LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const DOMAIN_PATTERN = new RegExp(`^(?:${DOMAIN_LABEL}\\.)+[a-z]{2,63}$`);

function isDecimal(value: string): boolean {
  return /^\d+$/.test(value);
}

/**
 * True when the hostname is a literal IP in a range that is not routable on the
 * public internet. DNS names that *resolve* into these ranges cannot be caught
 * here — that is Clerk's fetch, and the domain-verification requirement is what
 * bounds the blast radius — but literal addresses are the cheap, common case.
 */
export function isPrivateOrReservedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;

  // IPv6 (bracket-stripped above).
  if (host.includes(':')) {
    if (host === '::' || host === '::1') return true;
    // Unique-local fc00::/7 and link-local fe80::/10.
    if (/^f[cd][0-9a-f]{2}:/.test(host)) return true;
    if (/^fe[89ab][0-9a-f]:/.test(host)) return true;
    // IPv4-mapped ::ffff:a.b.c.d — re-check the embedded address.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(host);
    if (mapped) return isPrivateOrReservedHost(mapped[1]!);
    return false;
  }

  const parts = host.split('.');
  if (parts.length === 4 && parts.every(isDecimal)) {
    const octets = parts.map((part) => Number(part));
    if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
      // Not a valid dotted quad; treat as unusable rather than as a hostname.
      return true;
    }
    const [a, b] = octets as [number, number, number, number];
    if (a === 0) return true; // "this network"
    if (a === 10) return true; // RFC1918
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
    if (a === 192 && b === 168) return true; // RFC1918
    if (a === 192 && b === 0) return true; // IETF protocol assignments
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast + reserved + broadcast
    return false;
  }

  return false;
}

/**
 * Accept only an https URL that names a public host. Rejects http, file,
 * data, javascript, embedded credentials, and non-default ports that are a
 * common way to reach an internal service on a public-looking name.
 */
export function assertSafeIdpUrl(field: string, rawValue: string): string {
  const value = rawValue.trim();

  if (value.length === 0 || value.length > 2048) {
    throw new IdpValidationError(field, `${field} must be between 1 and 2048 characters`);
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new IdpValidationError(field, `${field} must be a valid absolute URL`);
  }

  if (parsed.protocol !== 'https:') {
    throw new IdpValidationError(field, `${field} must use https`);
  }

  if (parsed.username !== '' || parsed.password !== '') {
    throw new IdpValidationError(field, `${field} must not embed credentials`);
  }

  if (parsed.port !== '' && parsed.port !== '443') {
    throw new IdpValidationError(field, `${field} must use the default https port`);
  }

  if (isPrivateOrReservedHost(parsed.hostname)) {
    throw new IdpValidationError(
      field,
      `${field} must reference a publicly resolvable identity provider host`,
    );
  }

  if (!parsed.hostname.includes('.')) {
    throw new IdpValidationError(field, `${field} must reference a fully qualified host`);
  }

  return parsed.toString();
}

/** Normalize and validate the email domain a connection claims. */
export function assertClaimableDomain(rawValue: string): string {
  const domain = rawValue.trim().toLowerCase().replace(/\.$/, '');

  if (domain.length < 3 || domain.length > 253) {
    throw new IdpValidationError('domain', 'domain must be between 3 and 253 characters');
  }

  if (!DOMAIN_PATTERN.test(domain)) {
    throw new IdpValidationError(
      'domain',
      'domain must be a fully qualified domain name such as example.com',
    );
  }

  if (PUBLIC_MAILBOX_DOMAINS.has(domain)) {
    throw new IdpValidationError(
      'domain',
      'domain is a public mailbox provider and cannot be claimed for enterprise SSO',
    );
  }

  return domain;
}

const MAX_METADATA_XML_BYTES = 500_000;

/**
 * Bound and shape-check SAML metadata without parsing it.
 *
 * We never run an XML parser over this: no DTD processing, no entity
 * expansion, no external entity resolution can occur in our process. Clerk
 * parses it, and a payload that is not plausibly an EntityDescriptor is
 * rejected before it gets that far.
 */
export function assertSafeMetadataXml(rawValue: string): string {
  const xml = rawValue.trim();

  const byteLength = Buffer.byteLength(xml, 'utf8');
  if (byteLength === 0) {
    throw new IdpValidationError('metadata_xml', 'metadata_xml must not be empty');
  }
  if (byteLength > MAX_METADATA_XML_BYTES) {
    throw new IdpValidationError(
      'metadata_xml',
      `metadata_xml must be at most ${MAX_METADATA_XML_BYTES} bytes`,
    );
  }

  if (/<!DOCTYPE/i.test(xml)) {
    throw new IdpValidationError(
      'metadata_xml',
      'metadata_xml must not declare a DOCTYPE; document type definitions are not accepted',
    );
  }

  if (/<!ENTITY/i.test(xml)) {
    throw new IdpValidationError(
      'metadata_xml',
      'metadata_xml must not declare entities; entity declarations are not accepted',
    );
  }

  if (!/<(?:[a-z0-9._-]+:)?EntityDescriptor[\s>]/i.test(xml)) {
    throw new IdpValidationError(
      'metadata_xml',
      'metadata_xml must contain a SAML EntityDescriptor element',
    );
  }

  return xml;
}

/**
 * Pull the attribute mapping off the *raw* request body rather than a parsed
 * copy.
 *
 * zod silently strips dangerous keys such as `__proto__` while parsing a
 * record. That is safe in itself, but it would let a caller submit a key the
 * API then reports as accepted, so the allowlist below is applied to what was
 * actually sent.
 */
export function rawAttributeMapping(body: unknown): Record<string, unknown> | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const value = Object.getOwnPropertyDescriptor(body, 'attribute_mapping')?.value;
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new IdpValidationError('attribute_mapping', 'attribute_mapping must be an object');
  }
  return value as Record<string, unknown>;
}

const MAX_ATTRIBUTE_VALUE_LENGTH = 256;

/**
 * Reduce a caller-supplied mapping to the four keys Clerk accepts, rejecting
 * anything else rather than silently dropping it — silent drops would leave an
 * admin believing an attribute was mapped when it was not.
 */
export function assertSafeAttributeMapping(
  rawValue: Record<string, unknown> | undefined | null,
): SamlAttributeMapping {
  if (rawValue === undefined || rawValue === null) {
    return {};
  }

  const allowed = new Set<string>(ALLOWED_ATTRIBUTE_MAPPING_KEYS);
  const mapping: SamlAttributeMapping = {};

  const keys = Object.keys(rawValue);
  if (keys.length > ALLOWED_ATTRIBUTE_MAPPING_KEYS.length) {
    throw new IdpValidationError(
      'attribute_mapping',
      `attribute_mapping accepts at most ${ALLOWED_ATTRIBUTE_MAPPING_KEYS.length} keys`,
    );
  }

  for (const key of keys) {
    if (!allowed.has(key)) {
      throw new IdpValidationError(
        'attribute_mapping',
        `attribute_mapping key "${key}" is not supported; allowed keys are ${ALLOWED_ATTRIBUTE_MAPPING_KEYS.join(', ')}`,
      );
    }

    // Read through the descriptor: for a key such as `__proto__` a plain
    // property access can return the prototype rather than the stored value.
    const value = Object.getOwnPropertyDescriptor(rawValue, key)?.value;
    if (typeof value !== 'string') {
      throw new IdpValidationError(
        'attribute_mapping',
        `attribute_mapping value for "${key}" must be a string`,
      );
    }

    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_ATTRIBUTE_VALUE_LENGTH) {
      throw new IdpValidationError(
        'attribute_mapping',
        `attribute_mapping value for "${key}" must be between 1 and ${MAX_ATTRIBUTE_VALUE_LENGTH} characters`,
      );
    }

    mapping[key as AllowedAttributeMappingKey] = trimmed;
  }

  return mapping;
}
