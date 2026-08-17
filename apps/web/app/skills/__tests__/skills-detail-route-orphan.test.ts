import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = path.resolve(__dirname, '../../..');
const REPO_ROOT = path.resolve(WEB_ROOT, '../..');
const DETAIL_ROUTE_DIR = path.join(WEB_ROOT, 'app', 'skills', '[name]');

const SEARCH_ROOTS = [
  path.join(WEB_ROOT, 'app'),
  path.join(WEB_ROOT, 'features'),
  path.join(WEB_ROOT, 'shared'),
  path.join(WEB_ROOT, 'components'),
  path.join(WEB_ROOT, 'lib'),
  path.join(REPO_ROOT, 'packages', 'ui', 'ui', 'src'),
];

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', '__tests__', 'e2e']);

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      out.push(...sourceFiles(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    if (/\.(test|spec)\.tsx?$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}

// A navigation into the detail route: a string or template literal that starts
// at /skills/ and carries a further segment. Anchoring on the opening quote
// keeps prose like "connectors/skills/plugins" and the /api/skills/ namespace
// out of the match.
const DETAIL_LINK = /["'`(]\/skills\/(?![\s"'`)?#])/;

function filesLinkingToSkillDetail(): string[] {
  return SEARCH_ROOTS.flatMap(sourceFiles).filter((file) => {
    const rel = path.relative(REPO_ROOT, file);
    if (rel.includes(`app${path.sep}skills${path.sep}[name]`)) return false;
    return DETAIL_LINK.test(readFileSync(file, 'utf8'));
  });
}

describe('/skills/[name] reachability', () => {
  it('does not ship a skill detail route that nothing links to', () => {
    const reachable = filesLinkingToSkillDetail().length > 0;
    expect(
      reachable || !existsSync(DETAIL_ROUTE_DIR),
      'apps/web/app/skills/[name] exists but no source file links to it — wire a click-through or delete the route',
    ).toBe(true);
  });

  it('keeps a single skill source-label projection', () => {
    const duplicates = sourceFiles(path.join(WEB_ROOT, 'app', 'skills')).filter((file) =>
      /['"]managed-local['"]/.test(readFileSync(file, 'utf8')),
    );
    expect(duplicates.map((f) => path.relative(REPO_ROOT, f))).toEqual([]);
  });
});
