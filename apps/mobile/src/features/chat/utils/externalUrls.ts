const ALLOWED_EXTERNAL_SCHEMES = new Set(['http:', 'https:']);

const SYSTEM_INTENT_SCHEMES = new Set(['mailto:', 'sms:', 'tel:', 'geo:']);

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

const MAX_PROMPT_DISPLAY_LENGTH = 200;

export function getSystemIntentPrompt(url: string): { title: string; message: string } | null {
  if (classifyExternalLink(url) !== 'system-intent') return null;
  const scheme = /^([a-z][a-z0-9+.-]*:)/i.exec(url)![1]!.toLowerCase();
  const title = SYSTEM_INTENT_PROMPT_TITLES[scheme];
  if (!title) return null;
  const message =
    url.length > MAX_PROMPT_DISPLAY_LENGTH ? `${url.slice(0, MAX_PROMPT_DISPLAY_LENGTH)}…` : url;
  return { title, message };
}
