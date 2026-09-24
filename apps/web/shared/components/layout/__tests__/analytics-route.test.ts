import { readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import {
  DYNAMIC_PAGE_ROUTES,
  STATIC_SEGMENTS_BESIDE_PARAMS,
  UNMATCHED_SEGMENTS,
  canonicalRoutePath,
} from '../analytics-route';

const appRoot = resolve(process.cwd(), 'app');
const PARAM = /^\[([^\]]+)\]$/;
const isRouteDir = (name: string) => name !== 'api' && !/^[_(@]/.test(name);

function pageDirs(dir: string, out: string[] = []): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  if (entries.some((entry) => entry.isFile() && /^page\.tsx?$/.test(entry.name))) out.push(dir);
  for (const entry of entries) {
    if (entry.isDirectory() && isRouteDir(entry.name)) pageDirs(join(dir, entry.name), out);
  }
  return out;
}

const routeOf = (dir: string) => `/${relative(appRoot, dir)}`.replace(/\/$/, '') || '/';
const pages = pageDirs(appRoot).map(routeOf);
const dynamicPages = pages.filter((route) => route.split('/').some((part) => PARAM.test(part)));
const staticPages = pages.filter((route) => !dynamicPages.includes(route));

function staticSiblingsOnTheTree(): Record<string, string[]> {
  const found: Record<string, string[]> = {};
  for (const route of dynamicPages) {
    const parts = route.split('/').slice(1);
    parts.forEach((part, index) => {
      if (!PARAM.test(part)) return;
      const parent = `/${parts.slice(0, index).join('/')}`;
      const siblings = readdirSync(join(appRoot, ...parts.slice(0, index)), { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && isRouteDir(entry.name) && !PARAM.test(entry.name))
        .map((entry) => entry.name)
        .sort();
      if (siblings.length > 0) found[parent] = siblings;
    });
  }
  return found;
}

/** Fills every dynamic segment with a value shaped like the secret it would carry. */
function visit(route: string): { pathname: string; values: string[] } {
  const values: string[] = [];
  const pathname = route
    .split('/')
    .map((part) => {
      const match = PARAM.exec(part);
      if (!match) return part;
      const value = `${match[1]}_Zp81Qw7x`;
      values.push(value);
      return value;
    })
    .join('/');
  return { pathname, values };
}

describe('analytics hears the route a page was served by, never its address', () => {
  it('knows exactly the dynamic pages the App Router serves', () => {
    expect([...DYNAMIC_PAGE_ROUTES].sort()).toEqual([...dynamicPages].sort());
    expect(dynamicPages).toEqual(expect.arrayContaining(['/share/[token]', '/pair/[code]']));
  });

  it('knows every static route that sits beside a parameter, so it wins as Next.js lets it', () => {
    expect(
      Object.fromEntries(
        Object.entries(STATIC_SEGMENTS_BESIDE_PARAMS).map(([parent, names]) => [
          parent,
          [...names].sort(),
        ]),
      ),
    ).toEqual(staticSiblingsOnTheTree());
  });

  it.each(dynamicPages)('reports %s by its route and drops the value', (route) => {
    const { pathname, values } = visit(route);
    const reported = canonicalRoutePath(pathname);
    expect(reported).toBe(route);
    for (const value of values) expect(reported).not.toContain(value);
  });

  it('reports every static page as itself', () => {
    const misreported = staticPages.filter((route) => canonicalRoutePath(route) !== route);
    expect(staticPages.length).toBeGreaterThan(100);
    expect(misreported).toEqual([]);
  });

  it('never repeats a value past the route it belongs to', () => {
    const reported = canonicalRoutePath('/share/tok_Zp81Qw7x/extra/more');
    expect(reported).toBe(`/share/[token]/${UNMATCHED_SEGMENTS}`);
    expect(reported).not.toContain('tok_Zp81Qw7x');
  });

  it('drops a query string or fragment and a trailing slash', () => {
    expect(canonicalRoutePath('/share/tok_Zp81Qw7x/?invite=abc#top')).toBe('/share/[token]');
  });
});
