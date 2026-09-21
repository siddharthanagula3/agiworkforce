import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CANONICAL_POLICY_ROUTES } from '@/lib/legal-constants';
import { CODE_ROUTES } from '@/features/code/code-surface';
import { helpHrefForPath } from '@/lib/support/help-entry-points';

import { APP_NAV_DESTINATIONS } from '../app-nav-items';
import { conversationHref } from '../sidebar-session-actions';
import { projectHref, projectNewChatHref } from '../sidebar-project-actions';

const LAYOUT_DIR = path.resolve(__dirname, '..');
const APP_DIR = path.resolve(LAYOUT_DIR, '../../../app');

const SKIP_DIRS = new Set(['node_modules', '.next', 'api', '__tests__', '__mocks__']);

const isGroup = (name: string) => name.startsWith('(') && name.endsWith(')');
const isDynamic = (name: string) => /^\[[^.\]]+\]$/.test(name);
const isCatchAll = (name: string) => /^\[\.{3}[^\]]+\]$/.test(name);

function hasPage(dir: string): boolean {
  return ['page.tsx', 'page.ts'].some((basename) => existsSync(path.join(dir, basename)));
}

function childDirs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !SKIP_DIRS.has(entry.name))
    .map((entry) => entry.name);
}

function resolveSegments(dir: string, segments: readonly string[]): boolean {
  if (segments.length === 0) {
    if (hasPage(dir)) return true;
    return childDirs(dir)
      .filter(isGroup)
      .some((group) => resolveSegments(path.join(dir, group), segments));
  }
  const [head, ...rest] = segments;
  const children = childDirs(dir);
  const literal = children.find((name) => name === head);
  if (literal && resolveSegments(path.join(dir, literal), rest)) return true;
  const dynamic = children.find(isDynamic);
  if (dynamic && resolveSegments(path.join(dir, dynamic), rest)) return true;
  const catchAll = children.find(isCatchAll);
  if (catchAll && hasPage(path.join(dir, catchAll))) return true;
  return children.filter(isGroup).some((group) => resolveSegments(path.join(dir, group), segments));
}

function routeIsServed(href: string): boolean {
  const [pathname] = href.split(/[?#]/);
  const segments = (pathname ?? '').split('/').filter(Boolean);
  return resolveSegments(APP_DIR, segments);
}

function pageRouteDirs(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (hasPage(dir)) out.push(dir);
    for (const child of childDirs(dir)) walk(path.join(dir, child));
  };
  walk(APP_DIR);
  return out;
}

function nearestAncestorWith(dir: string, basename: string): string | null {
  let current = dir;
  for (;;) {
    if (existsSync(path.join(current, basename))) return current;
    if (current === APP_DIR) return null;
    current = path.dirname(current);
  }
}

function errorBoundaryFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const basename of ['error.tsx', 'global-error.tsx']) {
      const candidate = path.join(dir, basename);
      if (existsSync(candidate)) out.push(candidate);
    }
    for (const child of childDirs(dir)) walk(path.join(dir, child));
  };
  walk(APP_DIR);
  return out;
}

const shellSource = readFileSync(path.join(LAYOUT_DIR, 'WebAppShell.tsx'), 'utf8');

function literalDestinations(source: string): string[] {
  const patterns = [/router\.push\(\s*'([^']+)'/g, /redirectUrl:\s*'([^']+)'/g];
  const found = new Set<string>();
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]?.startsWith('/')) found.add(match[1]);
    }
  }
  return [...found];
}

const SAMPLE_ID = 'c0ffee00-0000-4000-8000-000000000001';

const mintedDestinations: ReadonlyArray<readonly [string, string]> = [
  ...APP_NAV_DESTINATIONS.map((destination) => [destination.id, destination.href] as const),
  ...literalDestinations(shellSource).map((href) => [`WebAppShell push ${href}`, href] as const),
  ['conversation row', conversationHref(SAMPLE_ID)],
  ['project row', projectHref(SAMPLE_ID)],
  ['new chat in project', projectNewChatHref(SAMPLE_ID)],
  ['sidebar Code control', CODE_ROUTES.root],
  ['account menu Help', helpHrefForPath('/chat')],
  ['account menu Help on billing', helpHrefForPath('/billing')],
  ...Object.entries(CANONICAL_POLICY_ROUTES).map(
    ([name, href]) => [`account menu ${name}`, href] as const,
  ),
];

describe('every destination the app shell mints is served by a route', () => {
  it('finds the shell pushes it scrapes, so a silent rename cannot empty this set', () => {
    expect(literalDestinations(shellSource).length).toBeGreaterThan(2);
    expect(mintedDestinations.length).toBeGreaterThan(APP_NAV_DESTINATIONS.length);
  });

  it.each(mintedDestinations.map(([label, href]) => [label, href]))('%s -> %s', (_label, href) => {
    expect(routeIsServed(href as string), `${href} resolves to no page in apps/web/app`).toBe(true);
  });

  it('resolves a dynamic segment rather than only literal paths', () => {
    expect(routeIsServed('/chat/some-conversation-id')).toBe(true);
    expect(routeIsServed('/chat/projects/some-project-id')).toBe(true);
  });

  it('reports an address with no page behind it', () => {
    expect(routeIsServed('/chat/projects/some-project-id/nothing-here')).toBe(false);
    expect(routeIsServed('/a-route-that-was-never-shipped')).toBe(false);
  });

  it('carries no credential in any address it hands the browser', () => {
    const credentialParam = /[?&](?:token|key|secret|signature|password|api_?key)=/i;
    for (const [label, href] of mintedDestinations) {
      expect(credentialParam.test(href), `${label} puts a credential in the URL`).toBe(false);
    }
  });
});

describe('every route answers a failure and a missing address', () => {
  const routes = pageRouteDirs();

  it('enumerates the whole App Router tree', () => {
    expect(routes.length).toBeGreaterThan(100);
  });

  it('gives every route an error boundary', () => {
    const uncovered = routes
      .filter((dir) => nearestAncestorWith(dir, 'error.tsx') === null)
      .map((dir) => path.relative(APP_DIR, dir));
    expect(uncovered).toEqual([]);
  });

  it('gives every route a not-found answer', () => {
    const uncovered = routes
      .filter((dir) => nearestAncestorWith(dir, 'not-found.tsx') === null)
      .map((dir) => path.relative(APP_DIR, dir));
    expect(uncovered).toEqual([]);
  });

  const boundaries = errorBoundaryFiles();

  it('enumerates the error boundaries it checks', () => {
    expect(boundaries.length).toBeGreaterThan(10);
  });

  it.each(boundaries.map((file) => [path.relative(APP_DIR, file), file]))(
    '%s offers a way out and never prints the raw failure',
    (_rel, file) => {
      const source = readFileSync(file as string, 'utf8');
      expect(/\breset\b/.test(source), 'no reset affordance').toBe(true);
      expect(/\{\s*error\.(?:message|stack)\s*\}/.test(source)).toBe(false);
      expect(/\{\s*String\(\s*error\s*\)\s*\}/.test(source)).toBe(false);
    },
  );
});
