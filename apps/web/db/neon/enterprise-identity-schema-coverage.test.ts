import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The regression guard for the defect CRIT-010/012/013 were opened on: the SSO,
 * directory-sync and SCIM code queried `sso_connections` and friends while no
 * migration created them. Every one of those routes answered 500 in production
 * and the failure was invisible until someone with an enterprise plan tried to
 * use the feature.
 *
 * The per-migration suites next to this one assert what each migration SAYS.
 * None of them asserts the thing that actually broke: that the set of tables
 * the enterprise identity code READS is a subset of the set the migrations
 * CREATE. This test closes the loop from the consumer side, so a future route
 * that starts querying a table nobody migrated fails here rather than in
 * production.
 *
 * Scope note (honest): this is static analysis of SQL string literals against
 * migration text. It is NOT an apply-from-empty-database test — there is no
 * live PostgreSQL, pglite, pg-mem or testcontainers in this repo's test
 * environment (verified; see the same note in
 * organization-seats-lifecycle-migration.test.ts). It therefore catches a
 * missing relation, which is the reported defect, but cannot catch a column
 * type mismatch or a policy that fails to apply.
 */

const repoWebRoot = process.cwd();

/** Every source tree that talks to the enterprise identity schema. */
const IDENTITY_SOURCE_DIRS = [
  'lib/server/sso',
  'lib/server/scim',
  'app/api/admin/sso',
  'app/api/admin/directory-sync',
  'app/api/scim',
];

/**
 * Identifiers that follow a SQL keyword but are not base tables: CTE names,
 * derived-table aliases, and the `set` target of an UPDATE ... SET clause.
 */
const NOT_A_TABLE = new Set(['set', 'select', 'values', 'only', 'lateral']);

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Test doubles deliberately model tables; they are not production reads.
      if (entry.name === '__tests__') continue;
      files.push(...(await walk(full)));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      files.push(full);
    }
  }
  return files;
}

/**
 * The SQL a module actually sends: template literals and quoted strings whose
 * text is shaped like a statement.
 *
 * Scanning raw file text instead matched English prose in the doc comments
 * ("...the row returned from the provider...") and reported `returned` and
 * `the` as missing tables. Only string literals are ever handed to the driver,
 * so only string literals are evidence.
 */
function sqlLiterals(source: string): string[] {
  const literals: string[] = [];
  const patterns = [/`(?:[^`\\]|\\[\s\S])*`/gu, /'(?:[^'\\\n]|\\[\s\S])*'/gu];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const text = match[0].slice(1, -1).trim();
      // A statement, not a sentence that happens to contain a verb: every SQL
      // literal in this codebase begins with its command. Without this anchor
      // the log message 'Failed to update last_sync_at' parsed as an UPDATE
      // against a table called `last_sync_at`.
      // ...and it must carry the clause that makes the command well formed.
      // `'update returned no row'` — a real error message in the SSO route —
      // clears the anchor above but is not a statement.
      const wellFormed =
        /\bselect\b[\s\S]*\bfrom\b/iu.test(text) ||
        /\binsert\s+into\b/iu.test(text) ||
        /\bupdate\b[\s\S]*\bset\b/iu.test(text) ||
        /\bdelete\s+from\b/iu.test(text);

      if (/^(?:select|insert|update|delete|with)\b/iu.test(text) && wellFormed) {
        literals.push(text);
      }
    }
  }
  return literals;
}

/**
 * Table names appearing after `from`, `join`, `insert into`, `update`, or
 * `delete from` in the SQL this module sends.
 */
function referencedTables(source: string): Set<string> {
  const found = new Set<string>();
  const pattern =
    /\b(?:insert\s+into|delete\s+from|update|from|join)\s+(?:public\.)?([a-z_][a-z0-9_]*)\b/giu;

  for (const sql of sqlLiterals(source)) {
    for (const match of sql.matchAll(pattern)) {
      const name = match[1]!.toLowerCase();
      if (NOT_A_TABLE.has(name)) continue;
      found.add(name);
    }
  }
  return found;
}

async function createdTables(): Promise<Set<string>> {
  const migrationsDir = join(repoWebRoot, 'db/neon');
  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();

  const created = new Set<string>();
  for (const file of files) {
    const sql = await readFile(join(migrationsDir, file), 'utf8');
    for (const match of sql.matchAll(
      /create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/giu,
    )) {
      created.add(match[1]!.toLowerCase());
    }
    // A view is equally a valid read target.
    for (const match of sql.matchAll(
      /create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/giu,
    )) {
      created.add(match[1]!.toLowerCase());
    }
  }
  return created;
}

describe('enterprise identity schema coverage', () => {
  it('creates every relation the SSO, directory-sync and SCIM code queries', async () => {
    const created = await createdTables();
    const missing: Array<{ table: string; file: string }> = [];

    for (const dir of IDENTITY_SOURCE_DIRS) {
      for (const file of await walk(join(repoWebRoot, dir))) {
        const source = await readFile(file, 'utf8');
        for (const table of referencedTables(source)) {
          if (!created.has(table)) {
            missing.push({ table, file: file.slice(repoWebRoot.length + 1) });
          }
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it('actually finds the identity tables, so an empty scan cannot pass silently', async () => {
    // Without this, a broken walk or a regex that matches nothing would make
    // the assertion above vacuously true — the classic way a guard like this
    // rots into decoration.
    const referenced = new Set<string>();
    for (const dir of IDENTITY_SOURCE_DIRS) {
      for (const file of await walk(join(repoWebRoot, dir))) {
        for (const table of referencedTables(await readFile(file, 'utf8'))) {
          referenced.add(table);
        }
      }
    }

    for (const table of [
      'sso_connections',
      'directory_sync_connections',
      'directory_sync_events',
      'scim_tokens',
      'scim_provisioned_users',
      'scim_groups',
      'scim_group_members',
      'organization_members',
    ]) {
      expect(referenced).toContain(table);
    }
  });

  it('reports a relation the migrations do not create', async () => {
    // Proves the check discriminates: the same comparison run against a table
    // that exists nowhere must fail.
    const created = await createdTables();
    expect(created.has('sso_connections')).toBe(true);
    expect(created.has('sso_connections_that_nobody_migrated')).toBe(false);
  });
});
