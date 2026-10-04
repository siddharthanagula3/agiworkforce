import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import {
  AVAILABLE_NOW_LABEL,
  COMING_SOON_LABEL,
  SURFACE_NAMES,
  SURFACE_STATUS,
} from '@/lib/marketing-constants';
import { interpolateFacts } from '@/lib/support/agent/corpus';

type SurfaceKey = keyof typeof SURFACE_STATUS;

const WEB_ROOT = join(__dirname, '..');
const APP_ROOT = join(WEB_ROOT, 'app');
const PUBLIC_ROOT = join(WEB_ROOT, 'public');

const SURFACE_LANDING_PAGES: Partial<Record<SurfaceKey, string>> = {
  desktop: 'app/desktop/page.tsx',
  cli: 'app/cli/page.tsx',
  mobile: 'app/mobile/page.tsx',
  chrome: 'app/chrome-extension/page.tsx',
  vscode: 'app/vscode-extension/page.tsx',
};

const SURFACE_NAME_PATTERNS: Record<SurfaceKey, RegExp> = {
  web: /\bAGI Web\b/i,
  desktop: /\bAGI Desktop\b|\bDesktop app\b|\bDesktop\b/i,
  cli: /\bAGI CLI\b|\bagi binary\b|\bCLI\b/i,
  mobile: /\bAGI Mobile\b|\bMobile app\b/i,
  chrome: /\bAGI in Chrome\b|\bChrome extension\b/i,
  vscode: /\bAGI in VS Code\b|\bVS Code extension\b/i,
};

const UNRELEASED_PHRASES = [
  /coming soon/i,
  /at public launch/i,
  /ahead of public launch/i,
  /opens? for public launch/i,
  /is(?:n't| not) distributed yet/i,
  /not yet available/i,
  /developer preview/i,
  /get notified when/i,
  /when (?:it|they) ships?/i,
];

const STORE_LISTING_PATTERNS: Partial<Record<SurfaceKey, RegExp>> = {
  mobile: /apps\.apple\.com\/(?!account\b)|play\.google\.com\/store\/apps/i,
  chrome: /chromewebstore\.google\.com|chrome\.google\.com\/webstore/i,
  vscode: /marketplace\.visualstudio\.com/i,
};

function isReleased(surface: SurfaceKey): boolean {
  return SURFACE_STATUS[surface] !== COMING_SOON_LABEL;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'api') continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const PUBLIC_SOURCES = [
  ...walk(APP_ROOT),
  ...walk(join(WEB_ROOT, 'features', 'marketing')),
  ...walk(join(WEB_ROOT, 'shared', 'components', 'layout')),
].map((file) => ({ file, rel: relative(WEB_ROOT, file), source: readFileSync(file, 'utf8') }));

function stripComments(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[ \t]*\/\/.*$/gm, ' ');
}

function decode(text: string): string {
  return text
    .replace(/&rsquo;|&#8217;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PROSE_PROP =
  /\b(?:eyebrow|title|body|stamp|lede|tagline|description|blurb|subtitle)\s*[=:]\s*(?:\{?\s*)(["'])((?:\\.|(?!\1)[^\\])*)\1/g;

function claimUnits(source: string): string[] {
  const clean = stripComments(source);
  const units: string[] = [];

  const elementStarts = [...clean.matchAll(/<[A-Z][A-Za-z0-9]*/g)].map((m) => m.index ?? 0);
  for (let i = 0; i < elementStarts.length; i += 1) {
    const chunk = clean.slice(elementStarts[i], elementStarts[i + 1] ?? clean.length);
    const props = [...chunk.matchAll(PROSE_PROP)].map((m) => m[2]);
    if (props.length) units.push(decode(props.join(' ')));
  }

  const text = clean.replace(/<\/?[A-Za-z][^>]*>/g, '\n').replace(/\{[^{}]*\}/g, ' ');
  for (const sentence of text.match(/[^.!?\n]+[.!?]?/g) ?? []) {
    const decoded = decode(sentence);
    if (decoded) units.push(decoded);
  }

  return units;
}

function unreleasedPhraseIn(unit: string): string | null {
  for (const phrase of UNRELEASED_PHRASES) {
    const match = unit.match(phrase);
    if (match) return match[0];
  }
  return null;
}

const CLAIM_TAIL_CHARS = 40;

function claimScopes(unit: string): { phrase: string; scope: string }[] {
  const scopes: { phrase: string; scope: string }[] = [];

  for (const sentence of unit.match(/[^.!?]+[.!?]?/g) ?? []) {
    const offset = unit.indexOf(sentence);
    for (const phrase of UNRELEASED_PHRASES) {
      const match = sentence.match(phrase);
      if (!match || match.index === undefined) continue;
      const end = offset + match.index + match[0].length;
      scopes.push({
        phrase: match[0],
        scope: `${sentence} ${unit.slice(end, end + CLAIM_TAIL_CHARS)}`,
      });
    }
  }

  return scopes;
}

describe('distribution state matches the release-state registry', () => {
  it('keeps a released surface off unreleased copy on the page it owns', () => {
    const violations: string[] = [];

    for (const [surface, page] of Object.entries(SURFACE_LANDING_PAGES) as [SurfaceKey, string][]) {
      if (!isReleased(surface)) continue;
      const entry = PUBLIC_SOURCES.find((candidate) => candidate.rel === page);
      expect(entry, `${page} is the landing page for ${surface} and must exist`).toBeDefined();

      for (const unit of claimUnits(entry!.source)) {
        const phrase = unreleasedPhraseIn(unit);
        if (phrase) {
          violations.push(
            `${page} (${surface} = "${SURFACE_STATUS[surface]}") says "${phrase}": ${unit.slice(0, 160)}`,
          );
        }
      }
    }

    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('never pairs a released surface with unreleased copy on any public page', () => {
    const violations: string[] = [];

    for (const { rel, source } of PUBLIC_SOURCES) {
      for (const unit of claimUnits(source)) {
        for (const { phrase, scope } of claimScopes(unit)) {
          for (const surface of Object.keys(SURFACE_STATUS) as SurfaceKey[]) {
            if (!isReleased(surface)) continue;
            if (!SURFACE_NAME_PATTERNS[surface].test(scope)) continue;
            violations.push(
              `${rel}: "${phrase}" claimed of ${surface} ("${SURFACE_STATUS[surface]}"): ${scope.slice(0, 160)}`,
            );
          }
        }
      }
    }

    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('reads every surface-card status from the registry instead of typing one', () => {
    const hrefToSurface = new Map<string, SurfaceKey>([
      ['/desktop', 'desktop'],
      ['/cli', 'cli'],
      ['/mobile', 'mobile'],
      ['/chrome-extension', 'chrome'],
      ['/vscode-extension', 'vscode'],
    ]);
    const violations: string[] = [];

    for (const { rel, source } of PUBLIC_SOURCES) {
      const clean = stripComments(source);
      for (const match of clean.matchAll(/\{(?:[^{}]|\{[^{}]*\})*\}/g)) {
        const block = match[0];
        if (!/\bstatus\s*:/.test(block)) continue;
        const href = block.match(/\bhref\s*:\s*['"]([^'"]+)['"]/)?.[1];
        const surface = href ? hrefToSurface.get(href) : undefined;
        if (!surface) continue;
        const status = block.match(/\bstatus\s*:\s*([^,\n]+)/)?.[1]?.trim() ?? '';
        if (!status.startsWith('SURFACE_STATUS.')) {
          violations.push(
            `${rel}: card for ${href} types status ${status} instead of SURFACE_STATUS.${surface}`,
          );
        } else if (status !== `SURFACE_STATUS.${surface}`) {
          violations.push(
            `${rel}: card for ${href} shows ${status}, not SURFACE_STATUS.${surface}`,
          );
        }
      }
    }

    expect(violations, violations.join('\n')).toEqual([]);
  });
});

describe('public links', () => {
  it('links to no store listing for a surface the registry reports unreleased', () => {
    const violations: string[] = [];

    for (const { rel, source } of PUBLIC_SOURCES) {
      for (const [surface, pattern] of Object.entries(STORE_LISTING_PATTERNS) as [
        SurfaceKey,
        RegExp,
      ][]) {
        if (isReleased(surface)) continue;
        for (const match of stripComments(source).matchAll(/href[=:]\s*['"]([^'"]+)['"]/g)) {
          const target = match[1] ?? '';
          if (pattern.test(target)) {
            violations.push(`${rel} links ${target} for unreleased surface ${surface}`);
          }
        }
      }
    }

    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('resolves every internal href to a route or a public asset', () => {
    const violations: string[] = [];

    const routeExists = (route: string): boolean => {
      const path = (route.split(/[?#]/)[0] ?? '').replace(/\/$/, '');
      if (path === '') return existsSync(join(APP_ROOT, 'page.tsx'));
      if (/\.[a-z0-9]+$/i.test(path)) return existsSync(join(PUBLIC_ROOT, path));

      let dir = APP_ROOT;
      for (const segment of path.split('/').filter(Boolean)) {
        if (existsSync(join(dir, segment))) {
          dir = join(dir, segment);
          continue;
        }
        const siblings = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
        const group = siblings.find(
          (e) => /^\(.*\)$/.test(e.name) && existsSync(join(dir, e.name, segment)),
        );
        if (group) {
          dir = join(dir, group.name, segment);
          continue;
        }
        const dynamic = siblings.find((e) => /^\[.*\]$/.test(e.name));
        if (dynamic) {
          dir = join(dir, dynamic.name);
          continue;
        }
        return false;
      }
      return existsSync(join(dir, 'page.tsx')) || existsSync(join(dir, 'route.ts'));
    };

    for (const { rel, source } of PUBLIC_SOURCES) {
      for (const match of stripComments(source).matchAll(/href[=:]\s*['"](\/[^'"\s]*)['"]/g)) {
        const route = match[1] ?? '';
        if (!route || route.startsWith('/api/')) continue;
        if (!routeExists(route))
          violations.push(`${rel} links ${route}, which resolves to nothing`);
      }
    }

    expect(violations, violations.join('\n')).toEqual([]);
  });
});

const REPO_ROOT = join(WEB_ROOT, '..', '..');
const PENDING_ROOT = join(__dirname, 'availability-pending');
const SUPPORT_ARTICLES_ROOT = join(WEB_ROOT, 'content', 'support');
const PRICING_STRINGS = 'packages/ui/i18n/locales/en/pricing.json';

const DATED_SOURCES = [
  'app/release-notes/',
  'app/changelog/',
  'lib/changelog-entries.ts',
  'content/legal/policy-archive/',
];

const HELD_ELSEWHERE = [
  'app/privacy/page.tsx',
  'app/privacy/india/page.tsx',
  'app/terms/page.tsx',
  'app/subprocessors/page.tsx',
  'app/data-use/page.tsx',
  'app/trust/page.tsx',
  'app/security/page.tsx',
  'app/status/page.tsx',
  'app/connectors/mcp-directory/page.tsx',
  'app/plugins/[id]/page.tsx',
];

const ALL_SURFACES = Object.keys(SURFACE_STATUS) as SurfaceKey[];
const UNRELEASED_SURFACES = ALL_SURFACES.filter((surface) => !isReleased(surface));

const RELEASED_CLAIMS = [
  /\breleased\b/i,
  /\bpublished releases?\b/i,
  /\bavailable now\b/i,
  /\bavailable today\b/i,
  /\b(?:has|have) shipped\b/i,
  /\btoday\b/i,
];

const NEGATION = String.raw`not|no|nor|never|none|nothing|neither|without|cannot|yet|\w+n't`;
const CONDITION = 'until|once|when|whenever|if|unless|before|after|whether';
const BUILD_STATE = 'source|repository|codebase';
const CLAIM_QUALIFIER = new RegExp(`^(?:${NEGATION}|${CONDITION}|${BUILD_STATE})$`, 'i');

const ATTRIBUTIVE_NEGATION = /\b(?:not[- ]yet|yet[- ]to[- ]be|to[- ]be|soon[- ]to[- ]be)[- ]$/i;

const SURFACE_CLAIM_NAMES = Object.fromEntries(
  ALL_SURFACES.map((surface) => [
    surface,
    [
      SURFACE_NAME_PATTERNS[surface],
      new RegExp(`\\b${SURFACE_NAMES[surface].replace(/ /g, '\\s')}\\b`),
    ],
  ]),
) as Record<SurfaceKey, RegExp[]>;

function surfaceNamedIn(text: string, surfaces: readonly SurfaceKey[]): SurfaceKey | null {
  return (
    surfaces.find((surface) => SURFACE_CLAIM_NAMES[surface].some((name) => name.test(text))) ?? null
  );
}

function startsWithSurfaceName(text: string, surfaces: readonly SurfaceKey[]): boolean {
  return surfaces.some((surface) =>
    SURFACE_CLAIM_NAMES[surface].some((name) =>
      new RegExp(`^\\s+(?:AGI\\s+)?(?:${name.source})`, name.flags).test(text),
    ),
  );
}

function decodeProse(text: string): string {
  return text
    .replace(/&rsquo;|&#8217;|&apos;/g, "'")
    .replace(/&ldquo;|&rdquo;|&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\\n/g, '\n\n')
    .replace(/\\(['"`])/g, '$1');
}

const REGISTRY_LABELS: Record<string, string> = {
  AVAILABLE_NOW_LABEL,
  COMING_SOON_LABEL,
  ...Object.fromEntries(
    ALL_SURFACES.map((surface) => [`SURFACE_STATUS.${surface}`, SURFACE_STATUS[surface]]),
  ),
};

function proseBlocksFromSource(source: string): string[] {
  const resolved = stripComments(source)
    .replace(
      /\$?\{\s*((?:SURFACE_STATUS\.)?\w+)(\.toLowerCase\(\))?\s*\}/g,
      (match, reference: string, lowerCased: string | undefined) => {
        const label = REGISTRY_LABELS[reference];
        if (label === undefined) return match;
        return lowerCased ? label.toLowerCase() : label;
      },
    )
    .replace(/\{\s*(['"])\s*\1\s*\}/g, ' ')
    .replace(/\$\{[^{}]*\}/g, ' value ')
    .replace(/\{\s*[A-Za-z_$][\w$.]*(?:\(\))?\s*\}/g, ' value ')
    .replace(/(?:\b[\w-]+\s*[=:]\s*)?(['"])(?:[/#]|https?:)[^'"\s]*\1/g, ' ')
    .replace(/<\/?[A-Za-z][\w.:-]*|\/?>/g, ' ');

  return decodeProse(resolved)
    .split(/[{}]|\n\s*\n/)
    .flatMap((block) => block.split(/(?<=['"`])\s*,\s*(?=['"`])/));
}

function proseBlocksFromMarkdown(markdown: string): string[] {
  return markdown
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .split(/\n\s*\n|\n(?=\s*(?:[-*]|\d+\.)\s)|\n(?=#)/);
}

function proseBlocksFromJson(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(proseBlocksFromJson);
  if (value && typeof value === 'object') return Object.values(value).flatMap(proseBlocksFromJson);
  return [];
}

function clausesOf(block: string): string[] {
  return block
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+|[;()]/)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function releasedClaimIn(clause: string, unreleased: readonly SurfaceKey[]): string | null {
  for (const claim of RELEASED_CLAIMS) {
    const match = clause.match(claim);
    if (!match || match.index === undefined) continue;
    const before = clause.slice(0, match.index);
    const after = clause.slice(match.index + match[0].length);

    if (startsWithSurfaceName(after, unreleased)) {
      if (ATTRIBUTIVE_NEGATION.test(before)) continue;
      return match[0].toLowerCase();
    }

    if (!surfaceNamedIn(clause, unreleased)) continue;
    const trailingYet = after
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .filter((word) => /^yet\b/i.test(word));
    const qualified = [...before.split(/\s+/), ...trailingYet]
      .map((word) => word.replace(/^[^\w]+|[^\w']+$/g, ''))
      .some((word) => CLAIM_QUALIFIER.test(word));
    if (!qualified) return match[0].toLowerCase();
  }
  return null;
}

interface AvailabilityHit {
  phrase: string;
  detail: string;
}

function releasedClaims(blocks: string[], unreleased: readonly SurfaceKey[]): AvailabilityHit[] {
  const hits: AvailabilityHit[] = [];
  for (const block of blocks) {
    for (const clause of clausesOf(block)) {
      const phrase = releasedClaimIn(clause, unreleased);
      if (phrase) hits.push({ phrase, detail: clause.slice(0, 200) });
    }
  }
  return hits;
}

const HREF_SURFACES: [RegExp, SurfaceKey][] = [
  [/^\/desktop(?:[/?#]|$)|#desktop-downloads$/, 'desktop'],
  [/^\/cli(?:[/?#]|$)|#cli-downloads$/, 'cli'],
  [/^\/mobile(?:[/?#]|$)/, 'mobile'],
  [/^\/chrome-extension(?:[/?#]|$)/, 'chrome'],
  [/^\/vscode-extension(?:[/?#]|$)/, 'vscode'],
];

function surfaceOfHref(href: string, surfaces: readonly SurfaceKey[]): SurfaceKey | null {
  const targets = [
    ...HREF_SURFACES,
    ...(Object.entries(STORE_LISTING_PATTERNS) as [SurfaceKey, RegExp][]).map(
      ([surface, pattern]): [RegExp, SurfaceKey] => [pattern, surface],
    ),
  ];
  return (
    targets.find(([pattern, surface]) => surfaces.includes(surface) && pattern.test(href))?.[1] ??
    null
  );
}

const INSTALL_VERB = /^(?:Get|Install|Download)\b/;
const LABEL_LITERAL = /(?<![-\w])\w*[lL]abel\s*[:=]\s*\{?\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
const CHILD_LABEL =
  /<([A-Za-z][\w.]*)\b([^<>]*)>\s*((?:Get|Install|Download)\b[^<>{}]*?)\s*<\/\1>/g;
const HREF_LITERAL = /\b(?:href|ctaHref)\s*[:=]\s*\{?\s*(['"`])([^'"`]*)\1/;

function enclosingSegment(source: string, index: number): string {
  let start = index;
  while (start > 0 && !'{<'.includes(source[start - 1] ?? '')) start -= 1;
  let end = index;
  while (end < source.length && !'}>'.includes(source[end] ?? '')) end += 1;
  return source.slice(start, end);
}

function handTypedInstallLabels(
  source: string,
  unreleased: readonly SurfaceKey[],
): AvailabilityHit[] {
  const clean = stripComments(source);
  const hits: AvailabilityHit[] = [];

  const consider = (label: string, context: string) => {
    const phrase = label.replace(/\s+/g, ' ').trim();
    if (!INSTALL_VERB.test(phrase)) return;
    const href = context.match(HREF_LITERAL)?.[2] ?? '';
    const surface = surfaceNamedIn(phrase, unreleased) ?? surfaceOfHref(href, unreleased);
    if (surface) hits.push({ phrase, detail: `${surface}${href ? ` at ${href}` : ''}` });
  };

  for (const match of clean.matchAll(LABEL_LITERAL)) {
    consider(match[2] ?? '', enclosingSegment(clean, match.index ?? 0));
  }
  for (const match of clean.matchAll(CHILD_LABEL)) consider(match[3] ?? '', match[2] ?? '');

  return hits;
}

const TYPED_RELEASED_COUNT = 'surfaces released';
const RELEASED_COUNT_LABEL = /\bsurfaces?\s+released\b/i;
const TYPED_NUMBER_FIELD = /:\s*(['"`]?)\d+\1\s*(?:,|$)/m;
const SPELLED_RELEASED_COUNT = /\b(?:\d+|one|two|three|four|five|six)\s+surfaces?\s+released\b/gi;

function typedReleasedCounts(source: string): AvailabilityHit[] {
  const clean = stripComments(source);
  const fields = [...clean.matchAll(/\{([^{}]*)\}/g)]
    .map((match) => (match[1] ?? '').trim())
    .filter((block) => RELEASED_COUNT_LABEL.test(block) && TYPED_NUMBER_FIELD.test(block));
  const prose = [...clean.matchAll(SPELLED_RELEASED_COUNT)].map((match) => match[0]);
  return [...fields, ...prose].map((detail) => ({
    phrase: TYPED_RELEASED_COUNT,
    detail: detail.replace(/\s+/g, ' ').slice(0, 200),
  }));
}

interface LocatedHit extends AvailabilityHit {
  file: string;
}

interface PendingEntry {
  file: string;
  phrase: string;
}

function isScanned(rel: string): boolean {
  return !DATED_SOURCES.some((dated) => rel.startsWith(dated)) && !HELD_ELSEWHERE.includes(rel);
}

const SCRIPT_SOURCES = [
  ...PUBLIC_SOURCES,
  ...['lib/support/static-data.ts', 'lib/marketing-constants.ts'].map((rel) => ({
    rel,
    source: readFileSync(join(WEB_ROOT, rel), 'utf8'),
  })),
].filter(({ rel }) => isScanned(rel));

const SUPPORT_ARTICLES = readdirSync(SUPPORT_ARTICLES_ROOT)
  .filter((entry) => entry.endsWith('.md'))
  .map((entry) => {
    const rel = `content/support/${entry}`;
    return {
      rel,
      source: interpolateFacts(readFileSync(join(SUPPORT_ARTICLES_ROOT, entry), 'utf8'), rel),
    };
  });

function located(file: string, hits: AvailabilityHit[]): LocatedHit[] {
  return hits.map((hit) => ({ file, ...hit }));
}

const RELEASED_CLAIM_HITS: LocatedHit[] = [
  ...SCRIPT_SOURCES.flatMap(({ rel, source }) =>
    located(rel, releasedClaims(proseBlocksFromSource(source), UNRELEASED_SURFACES)),
  ),
  ...SUPPORT_ARTICLES.flatMap(({ rel, source }) =>
    located(rel, releasedClaims(proseBlocksFromMarkdown(source), UNRELEASED_SURFACES)),
  ),
  ...located(
    PRICING_STRINGS,
    releasedClaims(
      proseBlocksFromJson(JSON.parse(readFileSync(join(REPO_ROOT, PRICING_STRINGS), 'utf8'))),
      UNRELEASED_SURFACES,
    ),
  ),
];

const INSTALL_ACTION_HITS: LocatedHit[] = SCRIPT_SOURCES.flatMap(({ rel, source }) =>
  located(rel, [
    ...handTypedInstallLabels(source, UNRELEASED_SURFACES),
    ...typedReleasedCounts(source),
  ]),
);

function readPending(): (PendingEntry & { list: string })[] {
  if (!existsSync(PENDING_ROOT)) return [];
  return readdirSync(PENDING_ROOT)
    .filter((entry) => entry.endsWith('.json'))
    .sort()
    .flatMap((list) =>
      (JSON.parse(readFileSync(join(PENDING_ROOT, list), 'utf8')) as PendingEntry[]).map(
        (entry) => ({ ...entry, list }),
      ),
    );
}

const PENDING = readPending();

function without<T extends PendingEntry>(
  entries: readonly T[],
  taken: readonly PendingEntry[],
): T[] {
  const budget = new Map<string, number>();
  const keyOf = (entry: PendingEntry) => `${entry.file}\u0000${entry.phrase}`;
  for (const entry of taken) budget.set(keyOf(entry), (budget.get(keyOf(entry)) ?? 0) + 1);
  return entries.filter((entry) => {
    const left = budget.get(keyOf(entry)) ?? 0;
    if (left === 0) return true;
    budget.set(keyOf(entry), left - 1);
    return false;
  });
}

describe('an unreleased surface is never described as released', () => {
  const unreleased: SurfaceKey[] = ['desktop', 'cli', 'mobile', 'vscode', 'chrome'];

  it.each([
    ['The released CLI stores provider keys.', 'released'],
    ['The released AGI CLI implements the Model Context Protocol.', 'released'],
    ['The released agi binary lands a session diff as a git patch.', 'released'],
    ['The CLI has a published release.', 'published release'],
    ['Web and CLI: Available now.', 'available now'],
    ['The web app and the CLI are available today.', 'available today'],
    ['of which the web app, desktop app, and CLI have shipped.', 'have shipped'],
    ['Local and BYOK run on the CLI today', 'today'],
    [
      "label: 'Available now', value: 'AGI Web, in any browser · AGI CLI, coming soon'",
      'available now',
    ],
    ["value: '3', label: 'surfaces released: Web, Desktop, CLI'", 'released'],
  ])('reads "%s" as a released claim', (clause, phrase) => {
    expect(releasedClaimIn(clause, unreleased)).toBe(phrase);
  });

  it.each([
    'AGI Web is available now.',
    'The CLI is coming soon.',
    'Mobile has no published release.',
    'Desktop, Mobile, VS Code and Chrome are not released yet',
    'VS Code BYOK arrives once the extension is released.',
    'The CLI installs from /download when a signed release is available today.',
    'There is no Chrome extension listing to install from today.',
    'The not-yet-released CLI is built from this repository.',
    'Every command above is in the agi binary source today',
    'Which surfaces have shipped is listed on the download page.',
  ])('leaves "%s" alone', (clause) => {
    expect(releasedClaimIn(clause, unreleased)).toBeNull();
  });

  it('follows the registry: a released surface may be called released', () => {
    expect(releasedClaimIn('The released CLI stores provider keys.', ['desktop'])).toBeNull();
    expect(releasedClaimIn('The CLI has a published release.', [])).toBeNull();
  });

  it('reads attributes, label and value pairs and templates, and keeps list items apart', () => {
    const phrasesIn = (source: string) =>
      releasedClaims(proseBlocksFromSource(source), unreleased).map((hit) => hit.phrase);

    expect(phrasesIn('<PageHero lede="The released CLI supports both." />')).toEqual(['released']);
    expect(
      phrasesIn("const ROW = { label: 'Released', value: 'The CLI. VS Code later.' };"),
    ).toEqual(['released']);
    expect(phrasesIn('const LEDE = `Web and CLI: ${AVAILABLE_NOW_LABEL}.`;')).toEqual([
      'available now',
    ]);
    expect(
      phrasesIn('<p>\n  Start in the released{\' \'}\n  <Link href="/cli">CLI</Link> today.\n</p>'),
    ).toEqual(['released']);
    expect(phrasesIn("const FACTS = ['Web available now', 'CLI coming soon'];")).toEqual([]);
    expect(phrasesIn('<Link href="/cli">Read more</Link> about what is available now.')).toEqual(
      [],
    );
  });

  it('reads help articles and locale strings', () => {
    const article =
      '---\nid: probe\n---\n\n## Local\n\nThe released CLI runs models\non your machine.\n';
    expect(
      releasedClaims(proseBlocksFromMarkdown(article), unreleased).map((hit) => hit.phrase),
    ).toEqual(['released']);
    expect(
      releasedClaims(
        proseBlocksFromJson({ plans: { byok: 'CLI today; VS Code when released' } }),
        unreleased,
      ).map((hit) => hit.phrase),
    ).toEqual(['today']);
  });

  it('makes no released, published, shipped or today claim about an unreleased surface', () => {
    const unlisted = without(RELEASED_CLAIM_HITS, PENDING).map(
      (hit) => `${hit.file}: "${hit.phrase}" claimed of an unreleased surface: ${hit.detail}`,
    );

    expect(
      unlisted,
      `${unlisted.join('\n')}\nName the surface without a release word and take its state from lib/surface-status.ts.`,
    ).toEqual([]);
  });
});

describe('an install action for an unreleased surface comes from the registry', () => {
  const unreleased: SurfaceKey[] = ['desktop', 'cli', 'mobile', 'vscode', 'chrome'];
  const labelsIn = (source: string, surfaces: readonly SurfaceKey[] = unreleased) =>
    handTypedInstallLabels(source, surfaces).map((hit) => hit.phrase);

  it('recognises a hand-typed Get, Install or Download label by its name or its target', () => {
    expect(labelsIn("const CTA = { href: '/download', label: 'Get AGI Desktop' };")).toEqual([
      'Get AGI Desktop',
    ]);
    expect(labelsIn('<Button href="/download#cli-downloads">Get the CLI</Button>')).toEqual([
      'Get the CLI',
    ]);
    expect(labelsIn("const CTA = { label: 'Install the CLI', href: CLI_HREF };")).toEqual([
      'Install the CLI',
    ]);
    expect(labelsIn("const CTA = { href: '/vscode-extension', label: 'Download' };")).toEqual([
      'Download',
    ]);
    expect(labelsIn('<WaitlistTrigger ctaLabel="Get AGI Mobile" source="mobile" />')).toEqual([
      'Get AGI Mobile',
    ]);
  });

  it('leaves registry labels, the notify action and labels for released surfaces alone', () => {
    expect(labelsIn("const CTA = surfaceCta('desktop');")).toEqual([]);
    expect(labelsIn('<Button href={desktopCta.href}>{desktopCta.label}</Button>')).toEqual([]);
    expect(labelsIn("const CTA = { href: '/download', label: 'Get notified' };")).toEqual([]);
    expect(labelsIn("const CTA = { href: '/get-started', label: 'Get Started' };")).toEqual([]);
    expect(labelsIn('<ol aria-label="Install AGI Desktop on macOS" />')).toEqual([]);
    expect(labelsIn("const CTA = { href: '/download', label: 'Get AGI Desktop' };", [])).toEqual(
      [],
    );
  });

  it('recognises a typed count of released surfaces', () => {
    const countsIn = (source: string) => typedReleasedCounts(source).length;

    expect(
      countsIn("const STAT = { value: '3', label: 'surfaces released: Web, Desktop, CLI' };"),
    ).toBe(1);
    expect(countsIn('<p>Three surfaces released so far.</p>')).toBe(1);
    expect(
      countsIn(
        "const STAT = { value: String(RELEASED_SURFACES.length), label: 'surfaces released' };",
      ),
    ).toBe(0);
  });

  it('types no Get, Install or Download label, and no released count, for an unreleased surface', () => {
    const unlisted = without(INSTALL_ACTION_HITS, PENDING).map(
      (hit) => `${hit.file}: "${hit.phrase}" is typed by hand (${hit.detail})`,
    );

    expect(
      unlisted,
      `${unlisted.join('\n')}\nUse surfaceCta() or NOTIFY_CTA for the action and RELEASED_SURFACES for the count.`,
    ).toEqual([]);
  });
});

describe('the pending availability list only shrinks', () => {
  it('lists well-formed entries for files this guard scans', () => {
    const malformed = PENDING.filter(
      (entry) => typeof entry.file !== 'string' || typeof entry.phrase !== 'string',
    ).map((entry) => `${entry.list}: ${JSON.stringify(entry)}`);
    const unscanned = PENDING.filter((entry) => !isScanned(entry.file)).map(
      (entry) => `${entry.list}: ${entry.file} is dated or held elsewhere, so it is never scanned`,
    );

    expect([...malformed, ...unscanned]).toEqual([]);
  });

  it('drops an entry as soon as its site is fixed', () => {
    const stale = without(PENDING, [...RELEASED_CLAIM_HITS, ...INSTALL_ACTION_HITS]).map(
      (entry) => `${entry.list}: ${entry.file} no longer says "${entry.phrase}"; delete the entry`,
    );

    expect(stale, stale.join('\n')).toEqual([]);
  });

  it('holds only pages that exist', () => {
    const missing = HELD_ELSEWHERE.filter((rel) => !existsSync(join(WEB_ROOT, rel)));

    expect(missing).toEqual([]);
  });
});
