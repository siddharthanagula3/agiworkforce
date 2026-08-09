/**
 * distribution-state.test.ts
 *
 * DOC-028. Two guards over the public site:
 *
 *   1. DISTRIBUTION STATE — a page may not tell a visitor a surface is
 *      unreleased when `SURFACE_STATUS`, the release-state registry the same
 *      pages render, reports it released. That contradiction shipped: on
 *      `/download` the CLI card printed `SURFACE_STATUS.cli` ("Released ·
 *      v1.0.0") two sections above a band headed "Two developer surfaces, both
 *      coming soon", and `/cli` opened with "AGI CLI · coming soon" while the
 *      header dropdown on that same page read "Released · v1.0.0".
 *
 *   2. LINKS — every internal href on a public page resolves to a real route
 *      or a real file in `public/`, and no page links to a store or
 *      marketplace listing for a surface the registry reports unreleased. The
 *      second half is the guard for the defect DOC-003 was opened for: `/mobile`
 *      once carried live App Store and Google Play links for an app that was
 *      never published (stripped in 35653e948).
 *
 * The rules read `SURFACE_STATUS` at run time, so they follow the registry
 * rather than a list typed here: the day mobile ships, the landing-page rule
 * starts policing `/mobile` and the store-listing rule starts permitting its
 * store links, with no edit to this file. Availability is a claim about a
 * surface; keep it in the registry and render it.
 *
 * Scope, deliberately: these rules judge SURFACE-level availability only. Copy
 * about one PLATFORM of a released surface ("macOS and Windows installers are
 * not yet published" on `/desktop`) is resolved per request by `/download`
 * against the release API and is not a surface-state claim — see the
 * `SURFACE_STATUS.desktop` note in `lib/marketing-constants.ts`.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { COMING_SOON_LABEL, SURFACE_STATUS } from '@/lib/marketing-constants';

type SurfaceKey = keyof typeof SURFACE_STATUS;

const WEB_ROOT = join(__dirname, '..');
const APP_ROOT = join(WEB_ROOT, 'app');
const PUBLIC_ROOT = join(WEB_ROOT, 'public');

/** Landing page each surface owns. Every claim on it is a claim about it. */
const SURFACE_LANDING_PAGES: Partial<Record<SurfaceKey, string>> = {
  desktop: 'app/desktop/page.tsx',
  cli: 'app/cli/page.tsx',
  mobile: 'app/mobile/page.tsx',
  chrome: 'app/chrome-extension/page.tsx',
  vscode: 'app/vscode-extension/page.tsx',
};

/** How a visitor names each surface in prose. */
const SURFACE_NAME_PATTERNS: Record<SurfaceKey, RegExp> = {
  web: /\bAGI Web\b/i,
  desktop: /\bAGI Desktop\b|\bDesktop app\b|\bDesktop\b/i,
  cli: /\bAGI CLI\b|\bagi binary\b|\bCLI\b/i,
  mobile: /\bAGI Mobile\b|\bMobile app\b/i,
  chrome: /\bAGI in Chrome\b|\bChrome extension\b/i,
  vscode: /\bAGI in VS Code\b|\bVS Code extension\b/i,
};

/** Phrases that tell a visitor a surface has not been distributed yet. */
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

/** Product-listing URLs. A live one is a distribution claim. */
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
      // API route handlers serve JSON, not marketing copy.
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

/** Source comments explain the copy; they are not shown to a visitor. */
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

/**
 * Prose the page renders, cut into the units a reader takes as one claim:
 * a sentence of JSX text, and the prose props of one component (a band's
 * eyebrow/title/body/stamp are read together, so they are judged together).
 * Link and CTA labels are excluded — "See the CLI" names a destination, it
 * does not assert a release state.
 */
const PROSE_PROP =
  /\b(?:eyebrow|title|body|stamp|lede|tagline|description|blurb|subtitle)\s*[=:]\s*(?:\{?\s*)(["'])((?:\\.|(?!\1)[^\\])*)\1/g;

function claimUnits(source: string): string[] {
  const clean = stripComments(source);
  const units: string[] = [];

  // One component's prose props, grouped per element occurrence.
  const elementStarts = [...clean.matchAll(/<[A-Z][A-Za-z0-9]*/g)].map((m) => m.index ?? 0);
  for (let i = 0; i < elementStarts.length; i += 1) {
    const chunk = clean.slice(elementStarts[i], elementStarts[i + 1] ?? clean.length);
    const props = [...chunk.matchAll(PROSE_PROP)].map((m) => m[2]);
    if (props.length) units.push(decode(props.join(' ')));
  }

  // JSX text, tag-free, split into sentences.
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

/**
 * The text an unreleased phrase actually speaks about: the sentence it sits in,
 * plus what follows it up to the next claim. A band titled "Two developer
 * surfaces, both coming soon" names the CLI in the sentence after the phrase,
 * so the tail has to count — but only the next clause, which is why it is short.
 * Text BEFORE the phrase in an earlier sentence does not count: "Try AGI Web in
 * the browser. Get notified when the apps open" says nothing about AGI Web's
 * release state, and flagging it would teach the next author to delete this
 * rule instead of the false claim.
 */
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
    // A card that links to a surface page and types its own status is how two
    // pages start disagreeing. The status must be `SURFACE_STATUS.<surface>`.
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
      // Each surface-card object literal: `status: ...` and `href: '/cli'`
      // within the same `{ ... }` block, at most one nesting level deep.
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
        // Only a live href is a distribution claim; the comments in
        // MobileHeroVisual quote the removed URLs on purpose.
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
        // A route group `(name)` is transparent in the URL; a dynamic segment
        // `[param]` matches anything.
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
