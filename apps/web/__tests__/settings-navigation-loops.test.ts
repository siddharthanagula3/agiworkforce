/**
 * CRIT-008 — `/integrations`, `/apps` and the settings deep-link routes must
 * not form dead navigation loops.
 *
 * Two guards, both reading production source:
 *
 * 1. ROUTE GRAPH. Every automatic redirect an App Router page or layout
 *    performs must land on a route that exists, and following those redirects
 *    must terminate. A cycle here is the original defect: `/integrations`'
 *    primary CTA pointed at `/apps`, and `/apps` answered a signed-out visitor
 *    by replacing with `/integrations` — a button that rendered `null` forever.
 *
 * 2. IN-APP SETTINGS HANDLERS. `/settings/*`, `/connectors`, `/skills` and
 *    `/apps` all render <SettingsModalRedirect>, whose only job is to reopen
 *    the settings modal and `router.replace('/chat')`. They are ENTRY points.
 *    Code already running inside the app shell must therefore open the modal
 *    through `useSettingsModal().openSettings(section)`; routing to one of
 *    those paths instead unmounts and remounts the page underneath the modal
 *    one tick later, discarding an in-flight chat stream or the project /
 *    code session the user was looking at, and lands on a 404 for any section
 *    that has no route (`help`).
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const APP_DIR = join(__dirname, '..', 'app');
const WEB_DIR = join(__dirname, '..');

// ---------------------------------------------------------------------------
// Route inventory
// ---------------------------------------------------------------------------

interface RouteFile {
  /** URL path this file governs, e.g. `/settings/general`. */
  route: string;
  /** Absolute path on disk. */
  file: string;
  /** `page` files own exactly their route; `layout` files own the subtree. */
  kind: 'page' | 'layout';
}

const SKIP_DIRS = new Set(['node_modules', '.next', '__tests__']);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

/** `app/(marketing)/pricing/page.tsx` -> `/pricing`. Route groups are dropped. */
function routeForFile(file: string): string {
  const rel = relative(APP_DIR, file).split(sep);
  rel.pop(); // page.tsx / layout.tsx
  const segments = rel.filter((s) => !(s.startsWith('(') && s.endsWith(')')));
  return `/${segments.join('/')}`.replace(/\/+$/, '') || '/';
}

const allFiles = walk(APP_DIR);

const routeFiles: RouteFile[] = allFiles
  .filter((f) => /(?:^|[\\/])(page|layout)\.tsx?$/.test(f) && !/\.(test|spec)\./.test(f))
  .map((f) => ({
    route: routeForFile(f),
    file: f,
    kind: /layout\.tsx?$/.test(f) ? ('layout' as const) : ('page' as const),
  }));

/** Every path that resolves to something renderable. */
const existingRoutes = new Set<string>([
  ...routeFiles.filter((r) => r.kind === 'page').map((r) => r.route),
  ...allFiles
    .filter((f) => /(?:^|[\\/])route\.tsx?$/.test(f) && !/\.(test|spec)\./.test(f))
    .map(routeForFile),
]);

/** `/chat/projects/abc` matches the `/chat/projects/[id]` page. */
function routeExists(path: string): boolean {
  if (existingRoutes.has(path)) return true;
  const wanted = path.split('/').filter(Boolean);
  return [...existingRoutes].some((candidate) => {
    const parts = candidate.split('/').filter(Boolean);
    if (parts.some((p) => p.startsWith('[...') || p.startsWith('[[...'))) {
      return wanted.length >= parts.length - 1;
    }
    if (parts.length !== wanted.length) return false;
    return parts.every((p, i) => (p.startsWith('[') && p.endsWith(']')) || p === wanted[i]);
  });
}

// ---------------------------------------------------------------------------
// Redirect edges
// ---------------------------------------------------------------------------

function normalizeTarget(raw: string): string | null {
  const path = raw.split('?')[0]!.split('#')[0]!.replace(/\/+$/, '') || '/';
  return path.startsWith('/') ? path : null;
}

/**
 * Automatic navigations a route performs on render, as `route -> target` edges.
 *
 * Deliberately narrow: only redirects that fire without user input are edges.
 * A `<Link>` a user may or may not click is not a redirect and cannot loop on
 * its own.
 */
function redirectEdges(): Map<string, Set<string>> {
  const edges = new Map<string, Set<string>>();
  const add = (from: string, to: string) => {
    const set = edges.get(from) ?? new Set<string>();
    set.add(to);
    edges.set(from, set);
  };

  for (const { route, file } of routeFiles) {
    const source = readFileSync(file, 'utf8');

    // Server redirect(...) and client router.replace/push(...) — string or
    // template literal, captured up to the first interpolation. `router.` is
    // required on the client form so `String.prototype.replace` is not read
    // as a navigation.
    const callRe =
      /(?:(?:^|[^\w.])(?:redirect|permanentRedirect)|router\.(?:replace|push))\(\s*['"`](\/[^'"`$]*)/gu;
    for (const match of source.matchAll(callRe)) {
      const target = normalizeTarget(match[1]!);
      if (target && target !== route) add(route, target);
    }

    // Any route rendering <SettingsModalRedirect> navigates to returnTo,
    // which defaults to /chat.
    if (/<SettingsModalRedirect\b/u.test(source)) {
      const returnTo = /returnTo=\{?['"`](\/[^'"`$]*)/u.exec(source);
      const target = normalizeTarget(returnTo?.[1] ?? '/chat');
      if (target && target !== route) add(route, target);
    }
  }

  return edges;
}

// ---------------------------------------------------------------------------
// Guard 1 — the redirect graph terminates and lands somewhere real
// ---------------------------------------------------------------------------

describe('CRIT-008 route graph', () => {
  const edges = redirectEdges();

  it('scanned the real app router (guard cannot pass by finding nothing)', () => {
    expect(existingRoutes.has('/integrations')).toBe(true);
    expect(existingRoutes.has('/apps')).toBe(true);
    expect(existingRoutes.has('/connectors')).toBe(true);
    expect(edges.size).toBeGreaterThan(10);
  });

  it('never redirects to a route that does not exist', () => {
    const broken: string[] = [];
    for (const [from, targets] of edges) {
      for (const to of targets) {
        if (!routeExists(to)) broken.push(`${from} -> ${to}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('has no redirect cycle', () => {
    const state = new Map<string, 'visiting' | 'done'>();
    const cycles: string[] = [];

    const visit = (node: string, trail: string[]): void => {
      if (state.get(node) === 'done') return;
      if (state.get(node) === 'visiting') {
        cycles.push([...trail.slice(trail.indexOf(node)), node].join(' -> '));
        return;
      }
      state.set(node, 'visiting');
      for (const next of edges.get(node) ?? []) visit(next, [...trail, node]);
      state.set(node, 'done');
    };

    for (const node of edges.keys()) visit(node, []);
    expect(cycles).toEqual([]);
  });

  it('sends a signed-out visitor from /apps to sign-in, not back to /integrations', () => {
    // /integrations' primary CTA is the only inbound edge that matters here.
    const integrations = readFileSync(join(APP_DIR, 'integrations', 'page.tsx'), 'utf8');
    expect(integrations).toContain('href="/apps"');

    const appsTargets = edges.get('/apps') ?? new Set<string>();
    expect([...appsTargets]).toContain('/login');
    expect([...appsTargets]).not.toContain('/integrations');
  });
});

// ---------------------------------------------------------------------------
// Guard 2 — in-app code opens settings, it does not route to it
// ---------------------------------------------------------------------------

describe('CRIT-008 settings modal entry points', () => {
  /** Paths whose page exists only to reopen the modal and bounce to /chat. */
  const BOUNCE_PATHS = /^\/(settings(\/|$)|connectors$|skills$|apps$)/u;

  const SCAN_ROOTS = ['app', 'features', 'components', 'shared'];

  const productionSources = SCAN_ROOTS.flatMap((root) => {
    try {
      return walk(join(WEB_DIR, root));
    } catch {
      return [];
    }
  }).filter((f) => /\.tsx?$/.test(f) && !/\.(test|spec)\./.test(f));

  it('scanned the real client surface', () => {
    expect(productionSources.length).toBeGreaterThan(200);
    expect(
      productionSources.some((f) => f.endsWith(join('components', 'WebSettingsModal.tsx'))),
    ).toBe(true);
  });

  /**
   * Two files route to a bounce path on purpose. Both are asserted below to
   * still match the reason they are listed, so the exception cannot outlive
   * its justification.
   */
  const ENTRY_POINT_EXCEPTIONS = [
    // The palette's "Go to Settings" is filed under its Navigate group and has
    // to work from marketing pages that have no app shell to float a modal
    // over. It is also mounted as a SIBLING of SettingsModalProvider in
    // app/providers.tsx, so useSettingsModal() there resolves to the context
    // default and openSettings() would do nothing at all.
    join('shared', 'components', 'CommandPalette', 'CommandPalette.tsx'),
    // Superseded full-page settings implementation. Its own header says it is
    // mounted by no route; the importer assertion below holds that true.
    join('features', 'settings', 'pages', 'UserSettings.tsx'),
  ];

  it('never opens a settings section by routing to its bounce path', () => {
    const offenders: string[] = [];
    const navRe = /router\.(?:push|replace)\(\s*[`'"](\/[^`'"$]*)/gu;

    for (const file of productionSources) {
      const rel = relative(WEB_DIR, file);
      if (ENTRY_POINT_EXCEPTIONS.includes(rel)) continue;

      const source = readFileSync(file, 'utf8');
      // The bounce pages themselves are the entry points; their own
      // redirect out is the intended behaviour, not a violation.
      if (/<SettingsModalRedirect\b/u.test(source)) continue;

      for (const match of source.matchAll(navRe)) {
        const target = match[1]!.split('?')[0]!;
        if (BOUNCE_PATHS.test(target)) {
          offenders.push(`${rel} -> ${target}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('keeps the CommandPalette exception honest: it is outside the settings provider', () => {
    const providers = readFileSync(join(WEB_DIR, 'app', 'providers.tsx'), 'utf8');
    // openSettings() only works for descendants of SettingsModalProvider.
    // CommandPaletteProvider is rendered after that element closes, so it is
    // not one — routing is the only thing that can work from there.
    expect(providers).toMatch(
      /<SettingsModalProvider>\{children\}<\/SettingsModalProvider>\s*<CommandPaletteProvider\s*\/>/u,
    );
  });

  it('keeps the UserSettings exception honest: nothing imports it', () => {
    const importers = productionSources.filter((file) => {
      if (file.endsWith(join('pages', 'UserSettings.tsx'))) return false;
      // Module specifiers only — `useUserSettings`, `UserSettingsRow` and
      // friends are unrelated names that merely contain the word.
      return /(?:from|import\()\s*['"][^'"]*\/UserSettings['"]/u.test(readFileSync(file, 'utf8'));
    });
    expect(importers).toEqual([]);
  });

  it('does not navigate for a settings section that has no route', () => {
    // `SETTINGS_NAV_GROUPS_WEB` lists a `help` item and there is no
    // `/settings/help` page, so a rail click that routes to `/settings/<key>`
    // drops the user on a 404 with the modal gone. The modal must not own a
    // router at all.
    expect(routeExists('/settings/help')).toBe(false);

    const modal = readFileSync(
      join(WEB_DIR, 'features', 'settings', 'components', 'WebSettingsModal.tsx'),
      'utf8',
    );
    expect(modal).not.toMatch(/\buseRouter\b/u);
  });
});
