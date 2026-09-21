import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = join(process.cwd(), 'db/neon');

/**
 * The four objects 2.0 requires to be addressable on their own: a session, a
 * device, a connected external account and a service credential. Each is read
 * out of the schema rather than asserted about, so a rename fails here instead
 * of quietly dropping the object from the check.
 */
const SEPARATELY_IDENTIFIED = /(?:session|device|identit|connector|api_key)/;

function migrationSql(): { file: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^\d{4}_.*\.sql$/.test(name))
    .sort()
    .map((file) => ({
      file,
      sql: readFileSync(join(MIGRATIONS_DIR, file), 'utf8').replace(/--[^\n]*/g, ''),
    }));
}

function tableBody(sql: string, openIndex: number): string {
  let depth = 0;
  for (let index = openIndex; index < sql.length; index++) {
    if (sql[index] === '(') depth++;
    if (sql[index] === ')') {
      depth--;
      if (depth === 0) return sql.slice(openIndex + 1, index);
    }
  }
  return '';
}

interface TableShape {
  body: string;
  columns: Set<string>;
}

function schema(): Map<string, TableShape> {
  const tables = new Map<string, TableShape>();
  const create = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)\s*\(/gi;
  const addColumn =
    /alter\s+table\s+public\.(\w+)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)/gi;

  for (const { sql } of migrationSql()) {
    for (const match of sql.matchAll(create)) {
      const name = (match[1] as string).toLowerCase();
      if (tables.has(name)) continue;
      const body = tableBody(sql, match.index + match[0].length - 1);
      const columns = new Set(
        body
          .split('\n')
          .map((line) => /^\s*(\w+)\s+\S/.exec(line)?.[1]?.toLowerCase())
          .filter(
            (column): column is string =>
              column !== undefined &&
              !['constraint', 'primary', 'unique', 'check'].includes(column),
          ),
      );
      tables.set(name, { body, columns });
    }
    for (const match of sql.matchAll(addColumn)) {
      const shape = tables.get((match[1] as string).toLowerCase());
      shape?.columns.add((match[2] as string).toLowerCase());
    }
  }
  return tables;
}

function indexes(): string[] {
  return migrationSql().flatMap(({ sql }) =>
    [...sql.matchAll(/create\s+(unique\s+)?index[^;]*;/gi)].map((match) =>
      match[0].replace(/\s+/g, ' ').toLowerCase(),
    ),
  );
}

describe('authentication identity object', () => {
  it('is a row of its own, keyed by the provider and the subject that provider issued', () => {
    const identities = schema().get('identities');

    expect(identities).toBeDefined();
    expect(identities?.body).toMatch(/\bid\s+uuid\s+primary\s+key\b/i);
    for (const column of [
      'provider',
      'subject',
      'user_id',
      'created_at',
      'creation_source',
      'last_authenticated_at',
    ]) {
      expect(identities?.columns).toContain(column);
    }
  });

  it('holds no address, so an account cannot be reached by an email a provider reassigned', () => {
    const identities = schema().get('identities');

    for (const column of identities?.columns ?? []) {
      expect(column).not.toMatch(/email/);
    }
    expect(identities?.body).not.toMatch(/email/i);
  });

  it('belongs to an account that outlives it, one identity per provider per account', () => {
    const identities = schema().get('identities');
    const declared = indexes();

    expect(identities?.body).toMatch(
      /user_id\s+text\s+not\s+null\s+references\s+public\.profiles\(id\)\s+on\s+delete\s+cascade/i,
    );
    expect(
      declared.some(
        (statement) =>
          statement.includes('unique') &&
          statement.includes('public.identities(provider, subject)'),
      ),
    ).toBe(true);
    expect(
      declared.some(
        (statement) =>
          statement.includes('unique') &&
          statement.includes('public.identities(provider, user_id)'),
      ),
    ).toBe(true);
  });

  it('gives every account-scoped identity object its own row id rather than the account id', () => {
    const tables = schema();
    const checked: string[] = [];

    for (const [name, shape] of tables) {
      if (!SEPARATELY_IDENTIFIED.test(name)) continue;
      if (!shape.columns.has('user_id')) continue;
      checked.push(name);
      expect(shape.body, `${name} has no row id of its own`).toMatch(
        /\bid\s+\w+[^,]*\bprimary\s+key\b/i,
      );
      expect(shape.body, `${name} keys its rows by the account that owns them`).not.toMatch(
        /\buser_id\s+\w+[^,]*\bprimary\s+key\b/i,
      );
    }

    for (const required of ['account_sessions', 'device_registrations', 'user_connectors']) {
      expect(checked).toContain(required);
    }
    expect(checked.length).toBeGreaterThan(5);
  });

  it('keys a service credential by its own row, not by the account that minted it', () => {
    const apiKeys = schema().get('api_keys');

    expect(apiKeys?.body).toMatch(/\bid\s+\w+[^,]*\bprimary\s+key\b/i);
    expect(apiKeys?.columns).toContain('user_id');
  });
});

describe('the account an identity resolves to', () => {
  it('carries its own profile, locale and address, with the address as one column among them', () => {
    const profiles = schema().get('profiles');

    for (const column of ['id', 'email', 'display_name', 'avatar_url', 'locale']) {
      expect(profiles?.columns).toContain(column);
    }
    expect(profiles?.body).toMatch(/\bid\s+text\s+primary\s+key\b/i);
    expect(profiles?.body).not.toMatch(/email[^,\n]*\bprimary\s+key\b/i);
  });

  it('can belong to more than one organization, because membership is keyed by the pair', () => {
    const members = schema().get('organization_members');

    expect(members?.body).toMatch(/primary\s+key\s*\(\s*organization_id\s*,\s*user_id\s*\)/i);
    expect(
      indexes().some(
        (statement) =>
          statement.includes('unique') &&
          /organization_members\(user_id\)/.test(statement.replace(/\s+/g, '')),
      ),
    ).toBe(false);
  });

  it('can hold more than one device and more than one session at a time', () => {
    const declared = indexes().map((statement) => statement.replace(/\s+/g, ''));

    for (const table of ['device_registrations', 'account_sessions']) {
      expect(schema().get(table)?.columns).toContain('user_id');
      expect(
        declared.some(
          (statement) =>
            statement.includes('unique') && statement.includes(`public.${table}(user_id)`),
        ),
      ).toBe(false);
    }
  });
});
