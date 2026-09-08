import 'server-only';

/**
 * What the account's audit rows mean, in the reader's language.
 *
 * The rows are security audit records keyed by endpoint, so rendering them
 * directly produced a server log: a path, a raw address and a timestamp. That
 * is not an account activity feed, and a reader cannot tell from it whether
 * anything happened that they should care about.
 *
 * A row this map does not recognise is DROPPED rather than shown raw. A feed
 * that admits it only understands some of the record is more useful than one
 * that pads itself out with paths, and anything worth adding here can be added
 * deliberately.
 */

export interface PresentedActivity {
  id: string;
  sentence: string;
  device: string | null;
  createdAt: string;
}

/** Exact endpoint matches, checked before the prefix rules below. */
const ENDPOINT_SENTENCES: Record<string, string> = {
  '/api/connectors': 'Viewed connected apps',
  '/api/connectors/permissions': 'Changed connector permissions',
  '/api/skills': 'Viewed skills',
  '/api/skills/installs': 'Installed or removed a skill',
  '/api/projects': 'Viewed projects',
  '/api/chat/sync': 'Synced artifacts to the account',
  '/api/code/sessions': 'Opened a code session',
  '/api/settings/activity': 'Viewed recent activity',
  '/api/settings/sessions': 'Viewed active sessions',
  '/api/user/export': 'Exported account data',
  '/api/billing/checkout': 'Started a checkout',
};

/** Falls back to the longest matching prefix, so sub-paths stay understood. */
const ENDPOINT_PREFIX_SENTENCES: ReadonlyArray<readonly [string, string]> = [
  ['/api/connectors/', 'Changed a connector'],
  ['/api/skills/', 'Changed a skill'],
  ['/api/plugins/', 'Changed a plugin'],
  ['/api/projects/', 'Changed a project'],
  ['/api/memory', 'Changed saved memories'],
  ['/api/settings/2fa', 'Changed two-factor authentication'],
  ['/api/settings/preferences', 'Changed settings'],
  ['/api/billing/', 'Changed billing'],
];

/**
 * Event types the audit writer classifies itself. These win over the endpoint,
 * because "Signed in on a new device" is what happened and the path it arrived
 * on is incidental.
 */
const EVENT_TYPE_SENTENCES: Record<string, string> = {
  login: 'Signed in on a new device',
  logout: 'Signed out',
  password_change: 'Changed the account password',
  mfa_enabled: 'Turned on two-factor authentication',
  mfa_disabled: 'Turned off two-factor authentication',
  backup_codes_regenerated: 'Regenerated backup codes',
  payment: 'Billing was charged',
  account_deletion_requested: 'Requested account deletion',
  rate_limit_exceeded: 'Was rate limited',
};

const MOBILE_HINT = /Mobile|Android|iPhone|iPad/i;

const BROWSER_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Edg\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/Chrome\//, 'Chrome'],
  [/Firefox\//, 'Firefox'],
  [/Safari\//, 'Safari'],
];

const PLATFORM_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/iPhone/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/Macintosh|Mac OS X/, 'Mac'],
  [/Windows/, 'Windows'],
  [/Linux/, 'Linux'],
];

function matchFirst(
  patterns: ReadonlyArray<readonly [RegExp, string]>,
  value: string,
): string | null {
  for (const [pattern, label] of patterns) if (pattern.test(value)) return label;
  return null;
}

/**
 * The same shape the sessions list shows: what the person was using, never the
 * address they were using it from. An audit row carries no city or country, so
 * where a session says "Chrome on Mac, London", this can only say the first
 * half, and says nothing rather than falling back to an IP.
 */
export function describeDevice(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const browser = matchFirst(BROWSER_PATTERNS, userAgent);
  const platform =
    matchFirst(PLATFORM_PATTERNS, userAgent) ?? (MOBILE_HINT.test(userAgent) ? 'Mobile' : null);
  if (browser && platform) return `${browser} on ${platform}`;
  return browser ?? platform;
}

function sentenceForEndpoint(endpoint: string | null): string | null {
  if (!endpoint) return null;
  const path = endpoint.split('?')[0] ?? endpoint;
  const exact = ENDPOINT_SENTENCES[path];
  if (exact) return exact;
  let best: { prefix: string; sentence: string } | null = null;
  for (const [prefix, sentence] of ENDPOINT_PREFIX_SENTENCES) {
    if (!path.startsWith(prefix)) continue;
    if (!best || prefix.length > best.prefix.length) best = { prefix, sentence };
  }
  return best?.sentence ?? null;
}

export function presentActivity(row: {
  id: string;
  event_type: string;
  endpoint: string | null;
  user_agent: string | null;
  created_at: string;
}): PresentedActivity | null {
  const sentence = EVENT_TYPE_SENTENCES[row.event_type] ?? sentenceForEndpoint(row.endpoint);
  if (!sentence) return null;
  return {
    id: row.id,
    sentence,
    device: describeDevice(row.user_agent),
    createdAt: row.created_at,
  };
}
