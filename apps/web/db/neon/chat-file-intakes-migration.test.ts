import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { MAX_CHAT_ATTACHMENT_BYTES } from '@/lib/chat-attachment-policy';

const MIGRATION_FILE = '0422_chat_file_intakes.sql';
const migration = fs.readFileSync(path.resolve(import.meta.dirname, MIGRATION_FILE), 'utf8');
const reversal = fs.readFileSync(
  path.resolve(import.meta.dirname, 'down/0422_chat_file_intakes.down.sql'),
  'utf8',
);
const sql = migration.replace(/--[^\n]*/g, '');
const reversalSql = reversal.replace(/--[^\n]*/g, '');

const TABLES = ['chat_file_intakes', 'chat_file_preparations'] as const;

describe('chat file intakes migration', () => {
  it('holds its number alone, directly after the one before it', () => {
    const numbers = fs
      .readdirSync(import.meta.dirname)
      .map((name) => /^(\d{4})_.+\.sql$/.exec(name)?.[1])
      .filter((value): value is string => value !== undefined)
      .map(Number);

    expect(numbers.filter((value) => value === 422)).toHaveLength(1);
    expect(numbers).toContain(421);
  });

  it('refuses unscanned chat files above exactly the limit the attachment policy states', () => {
    const limits = [...sql.matchAll(/new\.byte_size\s*>\s*(\d+)/g)].map((match) =>
      Number(match[1]),
    );

    expect(limits).toEqual([MAX_CHAT_ATTACHMENT_BYTES]);
    expect(MAX_CHAT_ATTACHMENT_BYTES).toBe(26214400);
  });

  it('demands a scan verdict that equals the content hash, and checks only inserts', () => {
    expect(sql).toMatch(
      /new\.scanned_sha256 is null\s+or new\.content_sha256 is null\s+or new\.scanned_sha256 <> new\.content_sha256/,
    );
    expect(sql).toMatch(
      /create trigger media_assets_refuse_unscanned_large_chat_file\s+before insert on public\.media_assets\s+for each row/,
    );
    expect(sql).not.toMatch(/refuse_unscanned_large_chat_file[\s\S]*?before (?:insert or )?update/);
  });

  it('pins the trigger function search path and keeps it from app_rls', () => {
    expect(sql).toMatch(
      /create function public\.refuse_unscanned_large_chat_file\(\)[\s\S]*?set search_path = pg_catalog, public/,
    );
    expect(sql).toContain(
      'revoke all on function public.refuse_unscanned_large_chat_file() from public, app_rls;',
    );
  });

  it.each(TABLES)('puts %s behind forced row level security with the tenant policy', (table) => {
    expect(sql).toContain(`revoke all on public.${table} from public, app_rls;`);
    expect(sql).toContain(`grant select, insert, update on public.${table} to app_rls;`);
    expect(sql).not.toMatch(new RegExp(`grant[^;]*\\bdelete\\b[^;]*on public\\.${table}\\b`));
    expect(sql).toContain(`alter table public.${table} enable row level security;`);
    expect(sql).toContain(`alter table public.${table} force row level security;`);
    expect(sql).toMatch(
      new RegExp(
        `create policy ${table}_tenant_isolation\\s+on public\\.${table} for all to app_rls\\s+` +
          `using \\(public\\.app_row_is_visible\\(user_id, organization_id\\)\\)\\s+` +
          `with check \\(public\\.app_row_is_writable\\(user_id, organization_id\\)\\)`,
      ),
    );
  });

  it('never cascades an owner delete through a row that is the only pointer to stored bytes', () => {
    for (const table of TABLES) {
      const body = new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\n\\);`).exec(
        sql,
      )?.[1];
      expect(body, table).toBeDefined();
      expect(body).not.toContain('on delete cascade');
      expect(body).toMatch(
        /user_id text not null references public\.profiles\(id\) on delete restrict/,
      );
    }
  });

  it('ties each terminal state to the code that explains it', () => {
    expect(sql).toContain("check ((state = 'rejected') = (refusal_code is not null))");
    expect(sql).toContain("check ((state = 'failed') = (failure_code is not null))");
    expect(sql).toContain("check ((state = 'cancelled') = (cancel_reason is not null))");
  });

  it('adds the verdict column without a default, so no existing row is rewritten', () => {
    expect(sql).toContain('alter table public.media_assets add column scanned_sha256 text;');
  });

  it('runs in one transaction with a bounded lock wait', () => {
    expect(sql.trim().startsWith('begin;')).toBe(true);
    expect(sql.trim().endsWith('commit;')).toBe(true);
    expect(sql).toMatch(/set local lock_timeout = '\d+s';/);
  });
});

describe('chat file intakes reversal', () => {
  it('refuses while any row it would orphan still exists', () => {
    for (const table of TABLES) {
      expect(reversalSql).toContain(`exists (select 1 from public.${table})`);
    }
    expect(reversalSql).toContain(
      'exists (select 1 from public.media_assets where scanned_sha256 is not null)',
    );
    expect(reversalSql.indexOf('raise exception')).toBeLessThan(reversalSql.indexOf('drop '));
  });

  it('drops every object the migration creates and forgets the migration', () => {
    const created = [
      ...[...sql.matchAll(/create table public\.(\w+)/g)].map(
        (match) => `table if exists public.${match[1]}`,
      ),
      ...[...sql.matchAll(/create index (\w+)/g)].map(
        (match) => `index if exists public.${match[1]}`,
      ),
      ...[...sql.matchAll(/create function public\.(\w+)\(\)/g)].map(
        (match) => `function if exists public.${match[1]}()`,
      ),
      ...[...sql.matchAll(/create trigger (\w+)\s+\w+ \w+ on (public\.\w+)/g)].map(
        (match) => `trigger if exists ${match[1]} on ${match[2]}`,
      ),
      ...[...sql.matchAll(/create policy (\w+)\s+on (public\.\w+)/g)].map(
        (match) => `policy if exists ${match[1]} on ${match[2]}`,
      ),
    ];

    expect(created.length).toBeGreaterThan(10);
    for (const object of created) expect(reversalSql, object).toContain(`drop ${object}`);
    expect(reversalSql).toContain(
      'alter table public.media_assets drop column if exists scanned_sha256;',
    );
    expect(reversalSql).toMatch(
      new RegExp(`delete from public\\.schema_migrations\\s+where filename = '${MIGRATION_FILE}'`),
    );
    expect(reversalSql.trim().startsWith('begin;')).toBe(true);
    expect(reversalSql.trim().endsWith('commit;')).toBe(true);
  });
});
