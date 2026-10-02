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
