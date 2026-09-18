// Precedence per capability: admin blocklist denies first; a non-empty admin
// allowlist is the outer bound; the user allowlist grants only inside it.
// An unreadable or malformed admin policy denies everything.

export const SITE_POLICY_CAPABILITIES = ['automation', 'upload', 'download'] as const;

export type SitePolicyCapability = (typeof SITE_POLICY_CAPABILITIES)[number];

export interface SitePolicyRule {
  readonly pattern: string;
  readonly capabilities?: readonly SitePolicyCapability[];
}

export interface AdminSitePolicy {
  readonly version: number;
  readonly blocklist: readonly SitePolicyRule[];
  readonly allowlist: readonly SitePolicyRule[];
}

export const SITE_POLICY_ADMIN_UNAVAILABLE = 'unavailable';

export type SitePolicyAdminState = AdminSitePolicy | typeof SITE_POLICY_ADMIN_UNAVAILABLE | null;

export interface SitePolicyInput {
  readonly admin: SitePolicyAdminState;
  readonly userAllowlist: readonly string[];
}

export type SitePolicyReason =
  | 'allowed'
  | 'invalid-url'
  | 'unsupported-scheme'
  | 'admin-unavailable'
  | 'admin-blocked'
  | 'outside-admin-allowlist'
  | 'not-allowlisted';

export interface SitePolicyEvaluation {
  readonly allowed: boolean;
  readonly reason: SitePolicyReason;
  readonly capability: SitePolicyCapability;
  readonly origin: string | null;
  readonly matchedPattern?: string;
}

interface ParsedPattern {
  readonly scheme: string;
  readonly host: string;
  readonly port: string;
  readonly wildcard: boolean;
}

const WILDCARD_PREFIX = '*.';

export function isSitePolicyCapability(value: unknown): value is SitePolicyCapability {
  return (
    typeof value === 'string' && (SITE_POLICY_CAPABILITIES as readonly string[]).includes(value)
  );
}

/**
 * Parses one pattern. Two shapes are accepted, both scheme-qualified so a
 * pattern can never silently widen from https to http:
 *
 *   `https://example.com`    exact origin, port included
 *   `https://*.example.com`  that host and every subdomain of it
 *
 * Anything else, including a bare host, a path, credentials or a non-http(s)
 * scheme, is rejected rather than guessed at.
 */
export function parseSitePolicyPattern(pattern: unknown): ParsedPattern | null {
  if (typeof pattern !== 'string') return null;
  const trimmed = pattern.trim();
  if (trimmed.length === 0) return null;

  const schemeEnd = trimmed.indexOf('://');
  if (schemeEnd <= 0) return null;
  const scheme = trimmed.slice(0, schemeEnd).toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') return null;

  const rest = trimmed.slice(schemeEnd + 3);
  const wildcard = rest.startsWith(WILDCARD_PREFIX);
  const authority = wildcard ? rest.slice(WILDCARD_PREFIX.length) : rest;
  if (authority.length === 0) return null;

  let parsed: URL;
  try {
    parsed = new URL(`${scheme}://${authority}`);
  } catch {
    return null;
  }
  if (parsed.username || parsed.password) return null;
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) return null;
  if (parsed.hostname.length === 0 || parsed.hostname.includes('*')) return null;

  return {
    scheme,
    host: parsed.hostname.toLowerCase().replace(/\.$/, ''),
    port: parsed.port,
    wildcard,
  };
}

type TargetParse = { ok: true; target: ParsedPattern } | { ok: false; reason: SitePolicyReason };

function parsedUrlParts(url: string): TargetParse {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: 'invalid-url' };
  }
  const scheme = parsed.protocol.replace(/:$/, '').toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') return { ok: false, reason: 'unsupported-scheme' };
  return {
    ok: true,
    target: {
      scheme,
      host: parsed.hostname.toLowerCase().replace(/\.$/, ''),
      port: parsed.port,
      wildcard: false,
    },
  };
}

function patternMatches(pattern: ParsedPattern, target: ParsedPattern): boolean {
  if (pattern.scheme !== target.scheme) return false;
  if (pattern.port !== target.port) return false;
  if (pattern.host === target.host) return true;
  return pattern.wildcard && target.host.endsWith(`.${pattern.host}`);
}

function ruleCovers(rule: SitePolicyRule, capability: SitePolicyCapability): boolean {
  if (rule.capabilities === undefined) return true;
  return rule.capabilities.includes(capability);
}

function findMatch(
  rules: readonly SitePolicyRule[],
  target: ParsedPattern,
  capability: SitePolicyCapability,
): SitePolicyRule | null {
  for (const rule of rules) {
    if (!ruleCovers(rule, capability)) continue;
    const parsed = parseSitePolicyPattern(rule.pattern);
    if (parsed && patternMatches(parsed, target)) return rule;
  }
  return null;
}

function originOf(target: ParsedPattern): string {
  return target.port.length > 0
    ? `${target.scheme}://${target.host}:${target.port}`
    : `${target.scheme}://${target.host}`;
}

function deny(
  reason: SitePolicyReason,
  capability: SitePolicyCapability,
  origin: string | null,
  matchedPattern?: string,
): SitePolicyEvaluation {
  return matchedPattern === undefined
    ? { allowed: false, reason, capability, origin }
    : { allowed: false, reason, capability, origin, matchedPattern };
}

/**
 * The decision. Block beats allow, an unreadable admin policy beats both, and a
 * capability the matching rule does not cover is never granted by it.
 */
export function evaluateSitePolicy(
  input: SitePolicyInput,
  url: string,
  capability: SitePolicyCapability,
): SitePolicyEvaluation {
  const parsed = parsedUrlParts(url);
  if (!parsed.ok) return deny(parsed.reason, capability, null);
  const target = parsed.target;
  const origin = originOf(target);

  if (input.admin === SITE_POLICY_ADMIN_UNAVAILABLE) {
    return deny('admin-unavailable', capability, origin);
  }

  if (input.admin) {
    const blocked = findMatch(input.admin.blocklist, target, capability);
    if (blocked) return deny('admin-blocked', capability, origin, blocked.pattern);

    const adminAllowed = findMatch(input.admin.allowlist, target, capability);
    if (adminAllowed) {
      return {
        allowed: true,
        reason: 'allowed',
        capability,
        origin,
        matchedPattern: adminAllowed.pattern,
      };
    }
    if (input.admin.allowlist.length > 0) {
      return deny('outside-admin-allowlist', capability, origin);
    }
  }

  const userRules: readonly SitePolicyRule[] = input.userAllowlist.map((pattern) => ({ pattern }));
  const userAllowed = findMatch(userRules, target, capability);
  if (userAllowed) {
    return {
      allowed: true,
      reason: 'allowed',
      capability,
      origin,
      matchedPattern: userAllowed.pattern,
    };
  }

  return deny('not-allowlisted', capability, origin);
}

export interface AdminSitePolicyParseFailure {
  readonly ok: false;
  readonly error: string;
}

export interface AdminSitePolicyParseSuccess {
  readonly ok: true;
  readonly policy: AdminSitePolicy;
}

export type AdminSitePolicyParseResult = AdminSitePolicyParseSuccess | AdminSitePolicyParseFailure;

function parseRules(value: unknown, field: string): SitePolicyRule[] | string {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return `${field} must be an array`;
  const rules: SitePolicyRule[] = [];
  for (const entry of value) {
    if (typeof entry === 'string') {
      if (!parseSitePolicyPattern(entry)) return `${field} holds an unparseable pattern`;
      rules.push({ pattern: entry.trim() });
      continue;
    }
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return `${field} holds an entry that is neither a pattern nor a rule`;
    }
    const record = entry as Record<string, unknown>;
    const pattern = record['pattern'];
    if (typeof pattern !== 'string' || !parseSitePolicyPattern(pattern)) {
      return `${field} holds an unparseable pattern`;
    }
    const capabilities = record['capabilities'];
    if (capabilities === undefined) {
      rules.push({ pattern: pattern.trim() });
      continue;
    }
    if (!Array.isArray(capabilities) || capabilities.length === 0) {
      return `${field} holds a rule whose capabilities are not a non-empty array`;
    }
    if (!capabilities.every(isSitePolicyCapability)) {
      return `${field} holds a rule naming an unknown capability`;
    }
    rules.push({ pattern: pattern.trim(), capabilities: [...new Set(capabilities)] });
  }
  return rules;
}

/**
 * Validates an admin policy document. A document that is present but malformed
 * returns a failure, and every caller turns that into
 * {@link SITE_POLICY_ADMIN_UNAVAILABLE} rather than an empty policy: a typo in a
 * blocklist must not unblock the fleet.
 */
export function parseAdminSitePolicy(value: unknown): AdminSitePolicyParseResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, error: 'site policy must be an object' };
  }
  const record = value as Record<string, unknown>;
  const version = record['version'];
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1) {
    return { ok: false, error: 'site policy version must be a positive integer' };
  }
  const blocklist = parseRules(record['blocklist'], 'blocklist');
  if (typeof blocklist === 'string') return { ok: false, error: blocklist };
  const allowlist = parseRules(record['allowlist'], 'allowlist');
  if (typeof allowlist === 'string') return { ok: false, error: allowlist };

  return { ok: true, policy: { version, blocklist, allowlist } };
}

const CAPABILITY_NOUN: Readonly<Record<SitePolicyCapability, string>> = {
  automation: 'Browser automation',
  upload: 'File upload',
  download: 'File download',
};

/**
 * The sentence a surface shows when the policy denies. `fallback` carries the
 * surface's own wording for the ordinary "you have not approved this site yet"
 * case, which is a user action rather than an org decision.
 */
export function sitePolicyDenialMessage(
  evaluation: SitePolicyEvaluation,
  fallback: string,
): string {
  const subject = CAPABILITY_NOUN[evaluation.capability];
  switch (evaluation.reason) {
    case 'admin-blocked':
      return `${subject} on "${evaluation.origin}" is blocked by your organization's site policy.`;
    case 'outside-admin-allowlist':
      return `${subject} on "${evaluation.origin}" is not on your organization's site allowlist.`;
    case 'admin-unavailable':
      return `${subject} is paused: your organization's site policy could not be read.`;
    case 'unsupported-scheme':
      return `${subject} is limited to http and https pages.`;
    case 'invalid-url':
      return `${subject} needs a valid page URL.`;
    default:
      return fallback;
  }
}
