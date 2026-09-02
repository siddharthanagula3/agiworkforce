import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const APP_DIR = join(__dirname, '..', 'app');
const WEB_DIR = join(__dirname, '..');

interface RouteFile {
  route: string;
  file: string;
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

function routeForFile(file: string): string {
  const rel = relative(APP_DIR, file).split(sep);
  rel.pop();
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

const existingRoutes = new Set<string>([
  ...routeFiles.filter((r) => r.kind === 'page').map((r) => r.route),
  ...allFiles
    .filter((f) => /(?:^|[\\/])route\.tsx?$/.test(f) && !/\.(test|spec)\./.test(f))
    .map(routeForFile),
]);

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

function normalizeTarget(raw: string): string | null {
  const path = raw.split('?')[0]!.split('#')[0]!.replace(/\/+$/, '') || '/';
  return path.startsWith('/') ? path : null;
}

function redirectEdges(): Map<string, Set<string>> {
  const edges = new Map<string, Set<string>>();
  const add = (from: string, to: string) => {
    const set = edges.get(from) ?? new Set<string>();
    set.add(to);
    edges.set(from, set);
  };

  for (const { route, file } of routeFiles) {
    const source = readFileSync(file, 'utf8');

    const callRe =
      /(?:(?:^|[^\w.])(?:redirect|permanentRedirect)|router\.(?:replace|push))\(\s*['"`](\/[^'"`$]*)/gu;
    for (const match of source.matchAll(callRe)) {
      const target = normalizeTarget(match[1]!);
      if (target && target !== route) add(route, target);
    }

    if (/<SettingsModalRedirect\b/u.test(source)) {
      const returnTo = /returnTo=\{?['"`](\/[^'"`$]*)/u.exec(source);
      const target = normalizeTarget(returnTo?.[1] ?? '/chat');
      if (target && target !== route) add(route, target);
    }
  }

  return edges;
}

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

  it('offers a signed-out /apps visitor sign-in, and never routes them back to /integrations', () => {
    const integrations = readFileSync(join(APP_DIR, 'integrations', 'page.tsx'), 'utf8');
    expect(integrations).toContain("href: '/apps'");

    // /apps no longer forces navigation at all: it renders an explanation with
    // a sign-in link, so it contributes no redirect edge. The loop this guards
    // against is a forced one, so the graph stays redirect-only — the offer is
    // asserted directly instead.
    const appsTargets = edges.get('/apps') ?? new Set<string>();
    expect([...appsTargets]).not.toContain('/integrations');

    const appsSource = readFileSync(join(APP_DIR, 'apps', 'page.tsx'), 'utf8');
    expect(appsSource).toContain('/login?redirectTo=%2Fapps');
    expect(appsSource).not.toMatch(/router\.(replace|push)\(/u);
  });
});

describe('CRIT-008 settings modal entry points', () => {
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

  const ENTRY_POINT_EXCEPTIONS = [
    join('shared', 'components', 'CommandPalette', 'CommandPalette.tsx'),
    join('features', 'settings', 'pages', 'UserSettings.tsx'),
  ];

  it('never opens a settings section by routing to its bounce path', () => {
    const offenders: string[] = [];
    const navRe = /router\.(?:push|replace)\(\s*[`'"](\/[^`'"$]*)/gu;

    for (const file of productionSources) {
      const rel = relative(WEB_DIR, file);
      if (ENTRY_POINT_EXCEPTIONS.includes(rel)) continue;

      const source = readFileSync(file, 'utf8');
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
    expect(providers).toMatch(
      /<SettingsModalProvider>\{children\}<\/SettingsModalProvider>\s*<CommandPaletteProvider\s*\/>/u,
    );
  });

  it('keeps the UserSettings exception honest: nothing imports it', () => {
    const importers = productionSources.filter((file) => {
      if (file.endsWith(join('pages', 'UserSettings.tsx'))) return false;
      return /(?:from|import\()\s*['"][^'"]*\/UserSettings['"]/u.test(readFileSync(file, 'utf8'));
    });
    expect(importers).toEqual([]);
  });

  it('does not navigate between sections from inside the modal', () => {
    // This used to assert that /settings/help had no route, using that absence
    // as proof the modal could not navigate there. The absence was incidental:
    // every section now resolves through app/settings/[section], which is what
    // makes a shared or bookmarked settings link work.
    //
    // The invariant CRIT-008 actually protects is that section switching inside
    // the modal does not go through the router — those routes redirect back to
    // /chat, so navigating to one from inside the modal is the loop. Asserted
    // directly now, which is stronger than the old proxy.
    const modal = readFileSync(
      join(WEB_DIR, 'features', 'settings', 'components', 'WebSettingsModal.tsx'),
      'utf8',
    );
    expect(modal).not.toMatch(/\buseRouter\b/u);

    const link = readFileSync(
      join(WEB_DIR, 'features', 'settings', 'components', 'SettingsSectionLink.tsx'),
      'utf8',
    );
    // Inside the modal the navigation context is present and the link is a
    // button calling onNavigate; only outside it does it fall back to <Link>.
    expect(link).toContain('SettingsSectionNavigationContext');
    expect(link).toMatch(/if \(!navigation\)/u);
    expect(link).toContain('navigation.onNavigate(section)');
  });

  it('resolves every settings section, so a shared link never 404s', () => {
    expect(routeExists('/settings/[section]')).toBe(true);
  });
});
