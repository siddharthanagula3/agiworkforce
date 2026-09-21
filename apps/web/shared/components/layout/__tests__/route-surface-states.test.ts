import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const appRoot = resolve(process.cwd(), 'app');

interface Segment {
  dir: string;
  files: Set<string>;
}

function walk(dir: string, out: Segment[] = []): Segment[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  out.push({
    dir,
    files: new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name)),
  });
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== 'api' && !entry.name.startsWith('_')) {
      walk(join(dir, entry.name), out);
    }
  }
  return out;
}

const segments = walk(appRoot);
const byDir = new Map(segments.map((segment) => [segment.dir, segment]));
const pages = segments.filter((segment) => segment.files.has('page.tsx'));
const loadingFiles = segments
  .filter((segment) => segment.files.has('loading.tsx'))
  .map((segment) => join(segment.dir, 'loading.tsx'));

const rel = (path: string) => relative(appRoot, path);
const source = (path: string) => readFileSync(path, 'utf8');

function resolvesUpward(dir: string, satisfied: (segment: Segment) => boolean): boolean {
  let current = dir;
  for (;;) {
    const segment = byDir.get(current);
    if (segment && satisfied(segment)) return true;
    if (current === appRoot) return false;
    const parent = dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

const ALIASES: Array<[RegExp, string]> = [
  [/^@shared\//, 'shared/'],
  [/^@features\//, 'features/'],
  [/^@\//, ''],
];

function resolveModule(specifier: string): string | null {
  const alias = ALIASES.find(([pattern]) => pattern.test(specifier));
  if (!alias) return null;
  const base = resolve(process.cwd(), specifier.replace(alias[0], alias[1]));
  for (const candidate of [`${base}.tsx`, `${base}.ts`, join(base, 'index.tsx')]) {
    try {
      return readFileSync(candidate, 'utf8');
    } catch {
      continue;
    }
  }
  return null;
}

// A wait has to be marked as one and carry text for it, whether that is a live
// region or a busy region: a spinning div alone says nothing to a reader.
const MARKED = /role=(?:"|')status(?:"|')|aria-live|aria-busy/;
const NAMED = /sr-only|aria-label|aria-live/;

const announces = (text: string) => MARKED.test(text) && NAMED.test(text);

/** Inline announcement, or a component this repository can be shown to make one. */
function announcesAWait(text: string): boolean {
  if (announces(text)) return true;
  const rendered = [...text.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)].map((match) => match[1]);
  return rendered.some((name) => {
    const specifier = new RegExp(
      `import\\s+\\{[^}]*\\b${name}\\b[^}]*\\}\\s+from\\s+'([^']+)'`,
    ).exec(text)?.[1];
    if (!specifier) return false;
    const module = resolveModule(specifier);
    return module !== null && announces(module);
  });
}

const declaresTitle = (segment: Segment) =>
  ['page.tsx', 'layout.tsx'].some(
    (file) =>
      segment.files.has(file) &&
      /export\s+(?:const|async\s+function|function)\s+(?:metadata|generateMetadata)\b/.test(
        source(join(segment.dir, file)),
      ),
  );

/**
 * Routes whose server work is awaited but which paint no loading boundary of
 * their own. Each entry says why that is the right answer; a seventh route
 * joining them fails, which is the point of holding the list here.
 */
const ROUTES_WITHOUT_A_LOADING_BOUNDARY: Record<string, string> = {
  'auth/sso-callback': 'awaits only its own searchParams, so there is no request to wait on',
  'copyright/report': 'awaits only its own searchParams, so there is no request to wait on',
  'use-cases/[slug]':
    'prerendered through generateStaticParams, so nothing resolves at request time',
  'open/[target]/[id]':
    'resolves to a redirect or a not-found answer and paints no page of its own',
  'shared-artifact/[token]': 'fetches the published artifact with nothing shown while it resolves',
  'features/plugins':
    'force-dynamic and fetches the directory with nothing shown while it resolves',
};

describe('every route segment answers loading, failure and a missing address', () => {
  it('enumerates the whole App Router tree rather than a sample', () => {
    expect(pages.length).toBeGreaterThan(100);
    expect(loadingFiles.length).toBeGreaterThan(0);
  });

  it('gives every page a title, from itself or from a layout above it', () => {
    const untitled = pages.filter((segment) => !resolvesUpward(segment.dir, declaresTitle));
    expect(untitled.map((segment) => rel(segment.dir))).toEqual([]);
  });

  it('never puts a loading boundary at the root, which would blank the whole shell', () => {
    expect(loadingFiles.map(rel)).not.toContain('loading.tsx');
  });

  it('announces every wait to a screen reader instead of painting a silent spinner', () => {
    const silent = loadingFiles.filter((file) => !announcesAWait(source(file)));
    expect(silent.map(rel)).toEqual([]);
  });

  it('follows the delegation rather than accepting any imported component as an answer', () => {
    expect(
      announcesAWait(
        "import { ThemeProvider } from '@shared/components/ThemeProvider';\n<ThemeProvider />",
      ),
    ).toBe(false);
    expect(announcesAWait('<div className="animate-spin" />')).toBe(false);
    expect(
      announcesAWait(
        'import { RouteLoading } from \'@shared/components/RouteLoading\';\n<RouteLoading label="x" />',
      ),
    ).toBe(true);
  });

  it('answers reduced motion wherever a loading boundary spins something itself', () => {
    const unanswered = loadingFiles.filter((file) => {
      const text = source(file);
      return /\banimate-(?!none)/.test(text) && !/motion-reduce:/.test(text);
    });
    expect(unanswered.map(rel)).toEqual([]);
  });

  it('gives every route that awaits server work a loading boundary, or a reason', () => {
    const awaiting = pages.filter((segment) =>
      /export\s+default\s+async\s+function/.test(source(join(segment.dir, 'page.tsx'))),
    );
    const uncovered = awaiting
      .filter((segment) => !resolvesUpward(segment.dir, (found) => found.files.has('loading.tsx')))
      .map((segment) => rel(segment.dir));

    expect(uncovered.sort()).toEqual(Object.keys(ROUTES_WITHOUT_A_LOADING_BOUNDARY).sort());
    for (const reason of Object.values(ROUTES_WITHOUT_A_LOADING_BOUNDARY)) {
      expect(reason.length).toBeGreaterThan(0);
    }
  });

  it('keeps every route failure inside a boundary rather than letting it reach the shell', () => {
    const unguarded = pages
      .filter((segment) => !resolvesUpward(segment.dir, (found) => found.files.has('error.tsx')))
      .map((segment) => rel(segment.dir));
    expect(unguarded).toEqual([]);
  });

  it('resolves the boundary from the nearest ancestor, so a new subtree cannot inherit nothing', () => {
    const orphan = join(appRoot, 'a-subtree-that-was-never-shipped');
    expect(resolvesUpward(orphan, (found) => found.files.has('error.tsx'))).toBe(true);
    expect(byDir.has(orphan)).toBe(false);
  });
});
