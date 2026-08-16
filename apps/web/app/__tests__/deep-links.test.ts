import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { GET as getAppleAppSiteAssociation } from '@/app/.well-known/apple-app-site-association/route';

const APP_DIRECTORY = path.join(__dirname, '..');
const PAGE_BASENAMES = ['page.tsx', 'page.ts', 'page.jsx', 'page.js', 'route.ts', 'route.js'];

function hasPageFile(directory: string): boolean {
  return PAGE_BASENAMES.some((basename) => fs.existsSync(path.join(directory, basename)));
}

function directoriesIn(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function resolveRoute(segments: readonly string[], directory = APP_DIRECTORY): string | null {
  if (segments.length === 0) {
    return hasPageFile(directory) ? path.relative(APP_DIRECTORY, directory) || '.' : null;
  }

  const [head, ...rest] = segments;
  const children = directoriesIn(directory);

  const literal = children.find((name) => name === head);
  if (literal !== undefined) {
    const match = resolveRoute(rest, path.join(directory, literal));
    if (match !== null) return match;
  }

  const dynamic = children.find((name) => /^\[[^.\]]+\]$/u.test(name));
  if (dynamic !== undefined) {
    const match = resolveRoute(rest, path.join(directory, dynamic));
    if (match !== null) return match;
  }

  const catchAll = children.find((name) => /^\[\.{3}[^\]]+\]$/u.test(name));
  if (catchAll !== undefined && hasPageFile(path.join(directory, catchAll))) {
    return path.relative(APP_DIRECTORY, path.join(directory, catchAll));
  }

  for (const group of children.filter((name) => /^\(.+\)$/u.test(name))) {
    const match = resolveRoute(segments, path.join(directory, group));
    if (match !== null) return match;
  }

  return null;
}

function probePathFor(pattern: string): string {
  return pattern.replace('/*', '/ABCD1234WXYZ');
}

async function claimedPaths(): Promise<string[]> {
  const body = (await getAppleAppSiteAssociation().json()) as {
    applinks: { details: Array<{ components: Array<{ '/': string }> }> };
  };
  return body.applinks.details.flatMap((detail) =>
    detail.components.map((component) => component['/']),
  );
}

describe('universal link paths resolve on web', () => {
  it('claims at least one path (a silently empty document would vacuously pass)', async () => {
    expect((await claimedPaths()).length).toBeGreaterThan(0);
  });

  it('serves an App Router page for every claimed path', async () => {
    const unresolved: string[] = [];

    for (const pattern of await claimedPaths()) {
      const probe = probePathFor(pattern);
      if (resolveRoute(probe.split('/').filter(Boolean)) === null) unresolved.push(pattern);
    }

    expect(unresolved).toEqual([]);
  });

  it('resolves the wildcard pairing path through a dynamic segment, not a stray literal', async () => {
    const patterns = await claimedPaths();
    expect(patterns).toContain('/pair/*');
    expect(resolveRoute(['pair', 'ABCD1234WXYZ'])).toBe(path.join('pair', '[code]'));
  });

  it('rejects the resolver itself on a path nothing claims', () => {
    expect(resolveRoute(['pair', 'ABCD1234WXYZ', 'extra', 'segments'])).toBeNull();
  });
});
