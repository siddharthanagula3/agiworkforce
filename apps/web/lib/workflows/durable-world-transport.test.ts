import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function repoRoot(): string {
  let dir = resolve(process.cwd());
  while (!existsSync(join(dir, 'node_modules', '.pnpm'))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error('pnpm virtual store not found');
    dir = parent;
  }
  return dir;
}

const ROOT = repoRoot();
const STORE = join(ROOT, 'node_modules', '.pnpm');
const MIN_FLAG_AWARE_MAJOR_MINOR = [4, 7] as const;

/**
 * Every world-vercel that a dependent actually links to. The store keeps each
 * package's own directory, and orphaned copies that left the lockfile but not
 * the disk; neither runs anywhere, so only links from other packages count.
 */
function linkedWorldVercelDirs(): string[] {
  const linked = new Set<string>();
  for (const entry of readdirSync(STORE)) {
    if (entry.startsWith('@workflow+world-vercel@')) continue;
    const candidate = join(STORE, entry, 'node_modules', '@workflow', 'world-vercel');
    if (!existsSync(candidate)) continue;
    linked.add(realpathSync(candidate));
  }
  return [...linked];
}

function readsTheFlag(packageDir: string): boolean {
  const dist = join(packageDir, 'dist');
  if (!existsSync(dist)) return false;
  return readdirSync(dist, { recursive: true, encoding: 'utf8' })
    .filter((entry) => entry.endsWith('.js'))
    .some((entry) => readFileSync(join(dist, entry), 'utf8').includes('WORKFLOW_NODE_HTTP'));
}

function overriddenVersion(): string {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    pnpm?: { overrides?: Record<string, string> };
  };
  const pinned = manifest.pnpm?.overrides?.['@workflow/world-vercel'];
  if (!pinned) throw new Error('@workflow/world-vercel is not pinned in the root pnpm overrides');
  return pinned;
}

// Unread, the flag changes nothing and the world hands its own undici
// dispatcher to fetch, which never settles on Node 24: a run records
// run_created and run_started, no step is ever dispatched, the flow function
// burns its whole limit and the queue redelivers it every fifteen minutes, so
// no durable turn finishes. The env contract keeps WORKFLOW_NODE_HTTP set; this
// keeps the installed world able to act on it. 4.6.x parses and ignores it.
describe('the Vercel world honours the node:http transport flag', () => {
  it('pins a world-vercel new enough to read WORKFLOW_NODE_HTTP', () => {
    const pinned = overriddenVersion();
    const [major = 0, minor = 0] = pinned.split('.').map(Number);
    const [minMajor, minMinor] = MIN_FLAG_AWARE_MAJOR_MINOR;
    expect(
      major > minMajor || (major === minMajor && minor >= minMinor),
      `@workflow/world-vercel is pinned to ${pinned}; ${minMajor}.${minMinor}.0 is the first release that reads WORKFLOW_NODE_HTTP`,
    ).toBe(true);
  });

  it('links no copy that ignores the flag', () => {
    const linked = linkedWorldVercelDirs();
    expect(linked.length).toBeGreaterThan(0);
    const deaf = linked.filter((dir) => !readsTheFlag(dir));
    expect(deaf, `these linked copies never read WORKFLOW_NODE_HTTP: ${deaf.join(', ')}`).toEqual(
      [],
    );
  });
});
