const PRIMARY_REFERENCE_BASE = new URL('https://relative-reference-a.invalid/');
const RELATIVE_REFERENCE_BASES: readonly URL[] = [
  PRIMARY_REFERENCE_BASE,
  new URL('https://relative-reference-b.invalid/'),
];
const EMBEDDED_PROTOCOLS: ReadonlySet<string> = new Set(['data:', 'blob:']);
const REMOTE_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);

export type MarkdownImageSource =
  | { readonly kind: 'embedded'; readonly src: string }
  | { readonly kind: 'same-origin'; readonly src: string }
  | {
      readonly kind: 'cross-origin';
      readonly src: string;
      readonly key: string;
      readonly host: string;
    };

function parseUrl(value: string, base?: URL): URL | null {
  try {
    return new URL(value, base);
  } catch {
    return null;
  }
}

function urlKey(url: URL): string {
  const key = new URL(url.href);
  key.hash = '';
  return key.href;
}

function crossOrigin(url: URL | null): MarkdownImageSource | null {
  return url && REMOTE_PROTOCOLS.has(url.protocol)
    ? { kind: 'cross-origin', src: url.href, key: urlKey(url), host: url.host }
    : null;
}

export function markdownImageSource(value: string): MarkdownImageSource | null {
  const src = value.trim();
  if (!src) return null;
  const absolute = parseUrl(src);
  if (absolute) {
    return EMBEDDED_PROTOCOLS.has(absolute.protocol)
      ? { kind: 'embedded', src }
      : crossOrigin(absolute);
  }
  const relative = RELATIVE_REFERENCE_BASES.every(
    (base) => parseUrl(src, base)?.origin === base.origin,
  );
  return relative
    ? { kind: 'same-origin', src }
    : crossOrigin(parseUrl(src, PRIMARY_REFERENCE_BASE));
}

export function trustedImageKeys(urls: readonly string[]): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const value of urls) {
    const url = parseUrl(value.trim());
    if (url && REMOTE_PROTOCOLS.has(url.protocol)) keys.add(urlKey(url));
  }
  return keys;
}

export const FILENAME_ALT = /^[\w.-]+\.(?:png|jpe?g|gif|webp|svg|avif)$/i;

export function readableImageAlt(alt: string | undefined): string {
  const trimmed = alt?.trim() ?? '';
  if (!trimmed || !FILENAME_ALT.test(trimmed)) return trimmed;
  const stem = trimmed
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  if (!stem) return '';
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

export function imageTitle(title: string | undefined, alt: string | undefined): string | undefined {
  const explicit = title?.trim();
  if (explicit && !FILENAME_ALT.test(explicit)) return explicit;
  const readable = readableImageAlt(alt);
  if (!readable || FILENAME_ALT.test(alt?.trim() ?? '')) return undefined;
  return readable;
}
