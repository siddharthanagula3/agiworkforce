const ALLOWED_EXTERNAL_SCHEMES = new Set(['http:', 'https:']);

/**
 * System-intent schemes that hand off to the default system app (mail
 * composer, SMS composer, dialer, maps). These are pure URL handoffs —
 * they require zero app permissions and never auto-send/auto-dial — but
 * taps on them are still gated behind a confirmation prompt because the
 * URL comes from untrusted assistant output.
 */
const SYSTEM_INTENT_SCHEMES = new Set(['mailto:', 'sms:', 'tel:', 'geo:']);

/** Anything longer than this is not a link a human meant to tap. */
const MAX_SYSTEM_INTENT_URL_LENGTH = 2048;

export function isValidExternalHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_EXTERNAL_SCHEMES.has(parsed.protocol);
  } catch {
    return false;
  }
}

export type ExternalLinkKind = 'http' | 'system-intent' | 'blocked';

/**
 * Classifies an assistant-emitted link URL for tap handling:
 *   - 'http'          → open directly (existing behavior, unchanged)
 *   - 'system-intent' → mailto:/sms:/tel:/geo: handoff, open after confirmation
 *   - 'blocked'       → everything else (javascript:, file:, intent:, malformed…)
 *
 * System-intent candidates are sanitized before being offered: embedded
 * whitespace/control characters or an oversize URL means the link was not
 * a plain scheme handoff, so it is blocked.
 */
export function classifyExternalLink(url: string): ExternalLinkKind {
  if (typeof url !== 'string' || url.length === 0) return 'blocked';
  if (isValidExternalHttpUrl(url)) return 'http';
  if (url.length > MAX_SYSTEM_INTENT_URL_LENGTH) return 'blocked';
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f\u007f]/.test(url)) return 'blocked';
  const schemeMatch = /^([a-z][a-z0-9+.-]*:)/i.exec(url);
  const scheme = schemeMatch?.[1]?.toLowerCase();
  if (scheme && SYSTEM_INTENT_SCHEMES.has(scheme)) return 'system-intent';
  return 'blocked';
}

const SYSTEM_INTENT_PROMPT_TITLES: Record<string, string> = {
  'mailto:': 'Open in Mail?',
  'sms:': 'Compose SMS?',
  'tel:': 'Open in Phone?',
  'geo:': 'Open in Maps?',
};

/** Cap the URL shown inside the confirmation alert so it stays readable. */
const MAX_PROMPT_DISPLAY_LENGTH = 200;

/**
 * Returns the confirmation prompt (title + message) for a system-intent URL,
 * or null when the URL is not an allowed system-intent link.
 */
export function getSystemIntentPrompt(url: string): { title: string; message: string } | null {
  if (classifyExternalLink(url) !== 'system-intent') return null;
  const scheme = /^([a-z][a-z0-9+.-]*:)/i.exec(url)![1]!.toLowerCase();
  const title = SYSTEM_INTENT_PROMPT_TITLES[scheme];
  if (!title) return null;
  const message =
    url.length > MAX_PROMPT_DISPLAY_LENGTH ? `${url.slice(0, MAX_PROMPT_DISPLAY_LENGTH)}…` : url;
  return { title, message };
}
