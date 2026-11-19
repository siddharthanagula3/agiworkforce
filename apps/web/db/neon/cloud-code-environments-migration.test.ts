import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLOUD_CODE_ENVIRONMENT_LIMITS, CLOUD_CODE_NETWORK_ACCESS } from '@agiworkforce/types';

const MIGRATION_FILE = '0423_cloud_code_environments.sql';
const TABLE = 'cloud_code_environments';
const migration = fs.readFileSync(path.resolve(import.meta.dirname, MIGRATION_FILE), 'utf8');
const reversal = fs.readFileSync(
  path.resolve(import.meta.dirname, 'down/0423_cloud_code_environments.down.sql'),
  'utf8',
);
const sql = migration.replace(/--[^\n]*/g, '');
const reversalSql = reversal.replace(/--[^\n]*/g, '');
const tableBody =
  new RegExp(`create table public\\.${TABLE} \\(([\\s\\S]*?)\\n\\);`).exec(sql)?.[1] ?? '';

describe('cloud code environments migration', () => {
  it('holds its number alone', () => {
    const numbers = fs
      .readdirSync(import.meta.dirname)
      .map((name) => /^(\d{4})_.+\.sql$/.exec(name)?.[1])
      .filter((value): value is string => value !== undefined);

    expect(numbers.filter((value) => value === MIGRATION_FILE.slice(0, 4))).toHaveLength(1);
  });

  it('creates every column the environment service reads and writes', () => {
    for (const column of [
      'id uuid primary key',
      'user_id text not null',
      'organization_id uuid',
      'request_id text not null',
      'name text not null',
      'network_access text not null',
      'extra_hosts text[] not null',
      'allow_package_managers boolean not null default true',
      'setup_script text not null',
      'env_vars_encrypted text',
      'env_var_names text[] not null',
      'is_default boolean not null default false',
      'created_at timestamptz not null',
      'updated_at timestamptz not null',
    ]) {
      expect(tableBody).toContain(column);
    }
  });

  it('bounds the columns with the limits the contract states', () => {
    expect(tableBody).toContain(
      `char_length(name) between 1 and ${CLOUD_CODE_ENVIRONMENT_LIMITS.name}`,
    );
    expect(tableBody).toContain(
      `octet_length(setup_script) <= ${CLOUD_CODE_ENVIRONMENT_LIMITS.setupScriptBytes}`,
    );
    expect(tableBody).toContain(
      `network_access in (${CLOUD_CODE_NETWORK_ACCESS.map((value) => `'${value}'`).join(', ')})`,
    );
  });

  it('keeps a request id unique per owner under the constraint name the service maps', () => {
    expect(tableBody).toContain(
      'constraint cloud_code_environments_request_key unique (user_id, request_id)',
    );
  });

  it('keeps names unique per owner and scope ignoring case, and one default at most', () => {
    expect(sql).toMatch(
      /create unique index cloud_code_environments_owner_name_key[\s\S]*?user_id,\s+\(coalesce\(organization_id, '00000000-0000-0000-0000-000000000000'::uuid\)\),\s+lower\(name\)/,
    );
    expect(sql).toMatch(
      /create unique index cloud_code_environments_owner_default_key[\s\S]*?\)\s+where is_default;/,
    );
  });

  it('sets the sealed values and their names together or not at all', () => {
    expect(tableBody).toContain('(env_vars_encrypted is null) = (cardinality(env_var_names) = 0)');
  });

  it('puts the table behind forced row level security with the tenant policy', () => {
    expect(sql).toContain(`revoke all on public.${TABLE} from public, app_rls;`);
    expect(sql).toContain(`grant select, insert, update, delete on public.${TABLE} to app_rls;`);
    expect(sql).toContain(`alter table public.${TABLE} enable row level security;`);
    expect(sql).toContain(`alter table public.${TABLE} force row level security;`);
    expect(sql).toMatch(
      new RegExp(
        `create policy ${TABLE}_tenant_isolation\\s+on public\\.${TABLE} for all to app_rls\\s+` +
          `using \\(public\\.app_row_is_visible\\(user_id, organization_id\\)\\)\\s+` +
          `with check \\(public\\.app_row_is_writable\\(user_id, organization_id\\)\\)`,
      ),
    );
  });

  it('runs in one transaction and its reversal retracts the ledger row', () => {
    expect(sql.trim().startsWith('begin;')).toBe(true);
    expect(sql.trim().endsWith('commit;')).toBe(true);
    expect(reversalSql).toContain(`drop table if exists public.${TABLE};`);
    expect(reversalSql).toContain(
      `delete from public.schema_migrations\n where filename = '${MIGRATION_FILE}';`,
    );
  });
});
