import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isAuthPath, isProductPath } from '@agiworkforce/types/product-routes';
import { describe, expect, it } from 'vitest';

import { RELEASE_NOTES_METADATA } from '@/app/release-notes/release-notes-metadata';
import sitemap from '@/app/sitemap';
import { SITE_URL } from '@/lib/seo/site';

const APP_DIR = join(__dirname, '..', '..');
const WEB_DIR = join(APP_DIR, '..');
const PAGE_FILE = 'page.tsx';
const NOT_PUBLIC_DIRECTORIES = new Set(['api', 'dev', '__tests__']);
const BLOG_INDEX = '/blog';
const RELEASE_ARCHIVE_ADDRESSES = ['/changelog', '/release-notes'];

const UNLISTED_BY_DESIGN: Readonly<Record<string, readonly string[]>> = {
  'a state the product shows, not a destination': [
    '/403',
    '/maintenance',
    '/offline',
    '/payment-failure',
    '/region-unavailable',
  ],
  'opened from a link that carries its own token or state': [
    '/github/connect',
    '/github/installed',
    '/invite',
    '/r/welcome',
    '/slack/link',
    '/trial/cancel',
  ],
  'another address for a page that is listed': ['/ai-skills', '/changelog'],
  'the sitemap itself': ['/sitemap-page'],
};

const isRouteGroup = (name: string) => name.startsWith('(') && name.endsWith(')');
const isDynamic = (name: string) => name.startsWith('[') && name.endsWith(']');

function subdirectories(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function staticPages(dir: string = APP_DIR, route = ''): string[] {
  const here = existsSync(join(dir, PAGE_FILE)) ? [route || '/'] : [];
  const below = subdirectories(dir)
    .filter(
      (name) => !NOT_PUBLIC_DIRECTORIES.has(name) && !name.startsWith('_') && !isDynamic(name),
    )
    .flatMap((name) =>
      staticPages(join(dir, name), isRouteGroup(name) ? route : `${route}/${name}`),
    );
  return [...here, ...below];
}

function pageServes(path: string): boolean {
  const walk = (dir: string, segments: readonly string[]): boolean => {
    const [segment, ...rest] = segments;
    if (segment === undefined) return existsSync(join(dir, PAGE_FILE));
    const names = subdirectories(dir);
    return (
      (names.includes(segment) && walk(join(dir, segment), rest)) ||
      names.filter(isRouteGroup).some((name) => walk(join(dir, name), segments)) ||
      names
        .filter(isDynamic)
        .some((name) =>
          name.startsWith('[...')
            ? existsSync(join(dir, name, PAGE_FILE))
            : walk(join(dir, name), rest),
        )
    );
  };
  return walk(APP_DIR, path.split('/').filter(Boolean));
}

function redirectSources(): Set<string> {
  const config = readFileSync(join(WEB_DIR, 'next.config.ts'), 'utf8');
  const block = config.slice(
    config.indexOf('async redirects()'),
    config.indexOf('async headers()'),
  );
  return new Set([...block.matchAll(/source:\s*'([^':]+)'/g)].flatMap((match) => match[1] ?? []));
}

const publicPages = staticPages()
  .filter((route) => !isProductPath(route) && !isAuthPath(route))
  .sort();
const sitemapPageSource = readFileSync(join(APP_DIR, 'sitemap-page', PAGE_FILE), 'utf8');
const htmlSitemap = new Set(
  [...sitemapPageSource.matchAll(/href: '(\/[^']*)'/g)].flatMap((match) => match[1] ?? []),
);
const unlisted = new Set(Object.values(UNLISTED_BY_DESIGN).flat());
const xmlEntries = sitemap();
const xmlPaths = xmlEntries.map((entry) => entry.url.replace(SITE_URL, '') || '/');
const releaseArchiveCanonical = String(RELEASE_NOTES_METADATA.alternates?.canonical).replace(
  SITE_URL,
  '',
);
const canonicalAddress = (route: string) =>
  RELEASE_ARCHIVE_ADDRESSES.includes(route) ? releaseArchiveCanonical : route;

function asksNotToIndex(route: string): boolean {
  const segments = route.split('/').filter(Boolean);
  const files = [
    ...segments.map((_, depth) => join(APP_DIR, ...segments.slice(0, depth + 1), 'layout.tsx')),
    join(APP_DIR, ...segments, PAGE_FILE),
  ].filter((file) => existsSync(file));
  return files.some((file) => /\bindex:\s*false\b/.test(readFileSync(file, 'utf8')));
}

describe('the HTML sitemap', () => {
  it('finds the public pages to check', () => {
    expect(publicPages.length).toBeGreaterThan(60);
    expect(htmlSitemap.size).toBeGreaterThan(60);
  });

  it('links every public page that a visitor can open as a destination', () => {
    const missing = publicPages.filter((route) => !htmlSitemap.has(route) && !unlisted.has(route));
    expect(missing, `public pages the sitemap page omits: ${missing.join(', ')}`).toEqual([]);
  });

  it('leaves a page out only while that page exists and stays unlinked', () => {
    for (const route of unlisted) {
      expect(publicPages, route).toContain(route);
      expect(htmlSitemap.has(route), route).toBe(false);
    }
  });

  it('links the release archive at the address both of its routes declare canonical', () => {
    expect(htmlSitemap.has(releaseArchiveCanonical)).toBe(true);
    expect(sitemapPageSource).toContain(
      `{ href: '${releaseArchiveCanonical}', label: 'Release notes' }`,
    );
    for (const address of RELEASE_ARCHIVE_ADDRESSES.filter(
      (route) => route !== releaseArchiveCanonical,
    )) {
      expect(htmlSitemap.has(address), address).toBe(false);
    }
  });

  it('describes its own scope without claiming every page', () => {
    expect(sitemapPageSource).not.toMatch(/every public page/i);
    expect(sitemapPageSource).toContain('lede="Public pages of this site, grouped by section."');
  });
});

describe('sitemap.xml', () => {
  it('lists only addresses that a page serves', () => {
    const unserved = xmlPaths.filter((path) => !pageServes(path));
    expect(unserved, `sitemap.xml lists addresses with no page: ${unserved.join(', ')}`).toEqual(
      [],
    );
  });

  it('never lists an address that only redirects', () => {
    const sources = redirectSources();
    expect(sources.size).toBeGreaterThan(20);
    const redirecting = xmlPaths.filter((path) => sources.has(path));
    expect(redirecting, `sitemap.xml lists redirects: ${redirecting.join(', ')}`).toEqual([]);
  });

  it('lists each address once', () => {
    expect(new Set(xmlPaths).size).toBe(xmlPaths.length);
  });

  it('lists the feature pages, the founder page and the beta programme', () => {
    for (const path of [
      '/features/images',
      '/features/video',
      '/features/voice',
      '/founder',
      '/beta',
    ]) {
      expect(xmlPaths, path).toContain(path);
    }
  });

  it('lists the release archive once, at the address both of its routes declare canonical', () => {
    expect(RELEASE_ARCHIVE_ADDRESSES).toContain(releaseArchiveCanonical);
    for (const address of RELEASE_ARCHIVE_ADDRESSES) {
      const page = readFileSync(join(APP_DIR, address, PAGE_FILE), 'utf8');
      expect(page, address).toMatch(/export const metadata = RELEASE_NOTES_METADATA\b/);
    }
    expect(xmlPaths.filter((path) => RELEASE_ARCHIVE_ADDRESSES.includes(path))).toEqual([
      releaseArchiveCanonical,
    ]);
  });

  it('lists every indexable page the HTML sitemap links, under its canonical address', () => {
    const missing = [...htmlSitemap].filter(
      (route) => !xmlPaths.includes(canonicalAddress(route)) && !asksNotToIndex(route),
    );
    expect(missing, `sitemap.xml omits: ${missing.join(', ')}`).toEqual([]);
  });

  it('never lists a page that asks search engines not to index it', () => {
    const noindex = xmlPaths.filter(asksNotToIndex);
    expect(noindex, `sitemap.xml lists noindex pages: ${noindex.join(', ')}`).toEqual([]);
  });

  it('gives no last-modified date, because no page records when it last changed', () => {
    const dated = xmlEntries.filter((entry) => entry.lastModified !== undefined);
    expect(dated.map((entry) => entry.url)).toEqual([]);
  });

  it('keeps the blog index out of search while it carries no posts', () => {
    expect(subdirectories(join(APP_DIR, BLOG_INDEX))).toEqual([]);
    expect(asksNotToIndex(BLOG_INDEX)).toBe(true);
    expect(htmlSitemap.has(BLOG_INDEX)).toBe(true);
    expect(xmlPaths.filter((path) => path.startsWith(BLOG_INDEX))).toEqual([]);
  });
});
