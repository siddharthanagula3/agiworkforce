import { stripTrackingParams } from '@agiworkforce/unified-chat/citation-markers';

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

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
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

export function linkDisplayText(url: string): string {
  return url.length > MAX_PROMPT_DISPLAY_LENGTH
    ? `${url.slice(0, MAX_PROMPT_DISPLAY_LENGTH)}…`
    : url;
}

export function linkOpenTarget(url: string): string {
  return classifyExternalLink(url) === 'http' ? stripTrackingParams(url) : url;
}

export function getSystemIntentPrompt(url: string): { title: string; message: string } | null {
  if (classifyExternalLink(url) !== 'system-intent') return null;
  const scheme = /^([a-z][a-z0-9+.-]*:)/i.exec(url)![1]!.toLowerCase();
  const title = SYSTEM_INTENT_PROMPT_TITLES[scheme];
  if (!title) return null;
  const readable = scheme === 'mailto:' ? readableMailto(url) : null;
  return { title, message: linkDisplayText(readable ?? url) };
}

function decodeMailtoPart(part: string): string | null {
  try {
    return decodeURIComponent(part).replace(/\s+/g, ' ').trim();
  } catch {
    return null;
  }
}

function readableMailto(url: string): string | null {
  const rest = url.slice('mailto:'.length);
  const queryStart = rest.indexOf('?');
  const recipients = decodeMailtoPart(queryStart === -1 ? rest : rest.slice(0, queryStart));
  if (recipients === null) return null;
  const fields = new Map<string, string>();
  for (const pair of (queryStart === -1 ? '' : rest.slice(queryStart + 1)).split('&')) {
    const equals = pair.indexOf('=');
    if (equals <= 0) continue;
    const value = decodeMailtoPart(pair.slice(equals + 1));
    if (value === null) return null;
    const name = pair.slice(0, equals).toLowerCase();
    if (!fields.has(name)) fields.set(name, value);
  }
  const to = [recipients, fields.get('to') ?? ''].filter(Boolean).join(', ');
  const lines = [
    to ? `To: ${to}` : '',
    fields.get('cc') ? `Cc: ${fields.get('cc')}` : '',
    fields.get('bcc') ? `Bcc: ${fields.get('bcc')}` : '',
    fields.get('subject') ? `Subject: ${fields.get('subject')}` : '',
  ].filter(Boolean);
  return lines.length > 0 ? lines.join('\n') : null;
}

const GEO_URI =
  /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,-?\d+(?:\.\d+)?)?(?:;[^?]*)?(?:\?(.*))?$/i;
const GEO_QUERY_COORDINATES = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:\((.*)\))?$/;

function readGeoQuery(query: string | undefined): string {
  const raw = /(?:^|&)q=([^&]*)/i.exec(query ?? '')?.[1];
  if (raw === undefined) return '';
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' ')).trim();
  } catch {
    return '';
  }
}

function withinCoordinateRange(latitude: number, longitude: number): boolean {
  return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}

export function appleMapsUrlFromGeo(url: string): string | null {
  const match = GEO_URI.exec(url);
  if (!match) return null;
  let latitude = Number(match[1]);
  let longitude = Number(match[2]);
  let label = readGeoQuery(match[3]);

  const coordinateQuery = GEO_QUERY_COORDINATES.exec(label);
  if (coordinateQuery) {
    latitude = Number(coordinateQuery[1]);
    longitude = Number(coordinateQuery[2]);
    label = coordinateQuery[3]?.trim() ?? '';
  }
  if (!withinCoordinateRange(latitude, longitude)) return null;

  const encodedLabel = encodeURIComponent(label);
  if (latitude === 0 && longitude === 0) {
    return label ? `https://maps.apple.com/?q=${encodedLabel}` : null;
  }
  return `https://maps.apple.com/?ll=${latitude},${longitude}${label ? `&q=${encodedLabel}` : ''}`;
}

export function systemIntentTarget(url: string, platform: string): string | null {
  if (platform === 'ios' && /^geo:/i.test(url)) return appleMapsUrlFromGeo(url);
  return url;
}
