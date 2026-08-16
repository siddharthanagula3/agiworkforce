import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoWebRoot = process.cwd();

const IDENTITY_SOURCE_DIRS = [
  'lib/server/sso',
  'lib/server/scim',
  'app/api/admin/sso',
  'app/api/admin/directory-sync',
  'app/api/scim',
];

// `from unnest($1::uuid[])` names a set-returning function, not a relation, so
// no migration will ever create it. Listed explicitly rather than inferred from
// a following parenthesis, because `insert into t (cols)` has one too and
// skipping on that would quietly stop checking real tables.
const SET_RETURNING_FUNCTIONS = [
  'unnest',
  'generate_series',
  'jsonb_array_elements',
  'json_array_elements',
  'jsonb_array_elements_text',
  'jsonb_to_recordset',
  'json_to_recordset',
  'regexp_split_to_table',
  'string_to_table',
];

const NOT_A_TABLE = new Set([
  'set',
  'select',
  'values',
  'only',
  'lateral',
  ...SET_RETURNING_FUNCTIONS,
]);

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      files.push(...(await walk(full)));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      files.push(full);
    }
  }
  return files;
}

function sqlLiterals(source: string): string[] {
  const literals: string[] = [];
  const patterns = [/`(?:[^`\\]|\\[\s\S])*`/gu, /'(?:[^'\\\n]|\\[\s\S])*'/gu];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const text = match[0].slice(1, -1).trim();
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
    const created = await createdTables();
    expect(created.has('sso_connections')).toBe(true);
    expect(created.has('sso_connections_that_nobody_migrated')).toBe(false);
  });
});
