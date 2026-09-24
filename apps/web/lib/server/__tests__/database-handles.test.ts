import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { DATA_REGION_IDS, dataRegionEnvName } from '@agiworkforce/compliance';

/**
 * Authorization, entitlement and billing decisions read whatever handle their
 * module was given, so the only way to keep them off a lagging copy is for no
 * handle to point at one. This walks every production module in the
 * TypeScript tree, finds each place a database connection is opened, and
 * requires its connection string to come from the primary database a
 * deployment or a data region is configured with.
 */

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const SEARCH_ROOTS = ['apps/web/app', 'apps/web/lib', 'apps/web/features', 'packages', 'services'];
const FACTORY = 'packages/platform/data-layer/src/factory.ts';
const ADAPTERS = 'packages/platform/data-layer/src/adapters';
const SKIP_DIRECTORIES = new Set(['node_modules', '.next', 'dist', '__tests__', 'generated']);
const PRIMARY_KEYS = new Set(['AGI_DATABASE_URL', 'DATABASE_URL', 'NEON_DATABASE_URL']);
const REGION_PRIMARY = 'runtime.databaseUrl';
const CONNECTION_OPENERS = /\b(createDatabaseClient|new Pool|neon)\(/g;

function sourceFiles(directory: string, collected: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRECTORIES.has(entry)) sourceFiles(full, collected);
      continue;
    }
    if (!/\.(ts|tsx|mts|js|mjs)$/.test(entry)) continue;
    if (/\.(test|spec)\.[a-z]+$/.test(entry) || entry.endsWith('.d.ts')) continue;
    collected.push(full);
  }
  return collected;
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function argumentsAt(source: string, open: number): string {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '(') depth += 1;
    if (source[index] === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  return source.slice(open + 1);
}

function envKeysRead(expression: string): string[] {
  return [...expression.matchAll(/(?:process\.env|readEnv)(?:\[|\()\s*'([A-Z0-9_]+)'/g)].map(
    (match) => match[1] as string,
  );
}

interface ConnectionSite {
  file: string;
  opener: string;
  moduleSource: string;
  args: string;
}

function connectionSites(): ConnectionSite[] {
  const sites: ConnectionSite[] = [];
  for (const root of SEARCH_ROOTS) {
    for (const file of sourceFiles(path.join(REPO_ROOT, root))) {
      const relative = path.relative(REPO_ROOT, file).split(path.sep).join('/');
      if (relative === FACTORY || relative.startsWith(`${ADAPTERS}/`)) continue;
      const moduleSource = withoutComments(readFileSync(file, 'utf8'));
      for (const match of moduleSource.matchAll(CONNECTION_OPENERS)) {
        const open = (match.index ?? 0) + match[0].length - 1;
        sites.push({
          file: relative,
          opener: match[1] as string,
          moduleSource,
          args: argumentsAt(moduleSource, open),
        });
      }
    }
  }
  return sites;
}

/** Where a site's connection string comes from, or why it cannot be told. */
function connectionSource(site: ConnectionSite): { primary: boolean; detail: string } {
  const given = /\bconnectionString\s*:\s*([^,}\n]+)/.exec(site.args)?.[1]?.trim();
  if (given === undefined) {
    return site.opener === 'createDatabaseClient'
      ? { primary: true, detail: 'the factory default' }
      : { primary: false, detail: 'no connection string the test can read' };
  }
  if (given === REGION_PRIMARY) return { primary: true, detail: 'the data region database' };
  const direct = envKeysRead(given);
  const declared =
    new RegExp(`\\bconst ${given}\\s*=\\s*([^;]+);`).exec(site.moduleSource)?.[1] ?? '';
  const keys = direct.length > 0 ? direct : envKeysRead(declared);
  if (keys.length === 0) return { primary: false, detail: `an unresolved value "${given}"` };
  const other = keys.filter((key) => !PRIMARY_KEYS.has(key));
  return other.length === 0
    ? { primary: true, detail: keys.join(' or ') }
    : { primary: false, detail: other.join(', ') };
}

describe('every database handle the product opens reads the primary', () => {
  const sites = connectionSites();

  it('finds the handles rather than passing over an empty tree', () => {
    expect(sites.length).toBeGreaterThanOrEqual(4);
    expect(new Set(sites.map((site) => site.file)).size).toBeGreaterThanOrEqual(3);
  });

  it('opens each one against the deployment or data region primary', () => {
    const elsewhere = sites
      .map((site) => ({ site, source: connectionSource(site) }))
      .filter(({ source }) => !source.primary)
      .map(({ site, source }) => `${site.file} ${site.opener}(): ${source.detail}`);

    expect(elsewhere).toEqual([]);
  });

  it('falls back only to primary keys when a caller names no connection string', () => {
    const factory = readFileSync(path.join(REPO_ROOT, FACTORY), 'utf8');
    const resolution = /const connectionString =([\s\S]*?);/.exec(factory)?.[1] ?? '';
    const keys = envKeysRead(resolution);

    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((key) => !PRIMARY_KEYS.has(key))).toEqual([]);
  });

  it('gives every data region one database, named for that region', () => {
    for (const region of DATA_REGION_IDS) {
      expect(dataRegionEnvName(region, 'databaseUrl')).toMatch(/DATABASE_URL$/);
    }
  });
});
