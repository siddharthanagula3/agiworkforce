const LINK_TAG = /<link\b[^>]*>/giu;
const LINK_ATTRIBUTE = /\b(rel|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/giu;
const ESCAPED_AMPERSAND = /&amp;/gu;
const WHITESPACE = /\s+/u;
const FETCHABLE_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);
const ICON_TOKEN = 'icon';
const SHORTCUT_TOKEN = 'shortcut';
const APPLE_TOUCH_TOKENS: ReadonlySet<string> = new Set([
  'apple-touch-icon',
  'apple-touch-icon-precomposed',
]);
const ICON_RANK = 0;
const SHORTCUT_ICON_RANK = 1;
const APPLE_TOUCH_ICON_RANK = 2;

interface LinkAttributes {
  readonly rel: string;
  readonly href: string;
}

function linkAttributes(tag: string): LinkAttributes {
  let rel = '';
  let href = '';
  for (const match of tag.matchAll(LINK_ATTRIBUTE)) {
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    if (match[1]?.toLowerCase() === 'rel') rel = value;
    else href = value;
  }
  return { rel, href };
}

function iconRank(rel: string): number | null {
  const tokens = rel.toLowerCase().split(WHITESPACE).filter(Boolean);
  if (tokens.some((token) => APPLE_TOUCH_TOKENS.has(token))) return APPLE_TOUCH_ICON_RANK;
  if (!tokens.includes(ICON_TOKEN)) return null;
  return tokens.includes(SHORTCUT_TOKEN) ? SHORTCUT_ICON_RANK : ICON_RANK;
}

function resolveHref(href: string, baseUrl: string): string | null {
  const cleaned = href.replace(ESCAPED_AMPERSAND, '&').trim();
  if (!cleaned) return null;
  try {
    const url = new URL(cleaned, baseUrl);
    return FETCHABLE_PROTOCOLS.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function discoverIconLinks(html: string, baseUrl: string): string[] {
  const ranked = new Map<string, number>();
  for (const tag of html.match(LINK_TAG) ?? []) {
    const { rel, href } = linkAttributes(tag);
    const rank = iconRank(rel);
    if (rank === null) continue;
    const resolved = resolveHref(href, baseUrl);
    if (!resolved) continue;
    const previous = ranked.get(resolved);
    if (previous === undefined || rank < previous) ranked.set(resolved, rank);
  }
  return [...ranked.entries()].sort((left, right) => left[1] - right[1]).map(([href]) => href);
}
