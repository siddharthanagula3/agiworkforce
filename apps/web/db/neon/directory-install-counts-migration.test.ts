import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), 'utf8');
const up = read('0379_directory_install_counts.sql');
const down = read('down/0379_directory_install_counts.down.sql');

function functionBody(name: string): string {
  const match = up.match(
    new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`),
  );
  expect(match, name).not.toBeNull();
  return match![0];
}

describe('0379 directory install counts', () => {
  it('keeps the totals table service-owned and readable only through the totals function', () => {
    expect(up).toContain('alter table public.skill_install_counts enable row level security;');
    expect(up).toContain('alter table public.skill_install_counts force row level security;');
    expect(up).toContain('revoke all on public.skill_install_counts from public, app_rls;');
    expect(up).not.toMatch(/create policy[\s\S]*skill_install_counts/);
    expect(up).toContain(
      'grant execute on function public.skill_install_totals(text[]) to app_rls;',
    );
    const totals = functionBody('skill_install_totals');
    expect(totals).toContain('counts.skill_name = any (p_names)');
    expect(totals).toContain('counts.installs > 0');
    expect(totals).not.toMatch(/user_id/);
  });

  it('returns connector totals without any account column and keeps them off app_rls', () => {
    const counts = functionBody('directory_connector_connection_counts');
    expect(counts).toContain('returns table (connector_id text, connections bigint)');
    expect(counts).toContain('count(distinct live.user_id)');
    expect(counts).not.toContain('security definer');
    expect(up).toContain(
      'revoke all on function public.directory_connector_connection_counts() from public, app_rls;',
    );
    expect(up).not.toMatch(
      /grant execute on function public\.directory_connector_connection_counts/,
    );
  });

  it('keeps totals exact from every writer of user_settings, including deletes', () => {
    expect(up).toContain('after insert or update of settings or delete on public.user_settings');
    expect(up).toContain('lock table public.user_settings in share row exclusive mode;');
    const sync = functionBody('sync_skill_install_counts');
    expect(sync).toContain('greatest(counts.installs - 1, 0)');
  });

  it('reverses every object it creates and retracts its ledger row', () => {
    for (const statement of [
      'drop trigger if exists user_settings_skill_install_counts on public.user_settings;',
      'drop function if exists public.directory_connector_connection_counts();',
      'drop function if exists public.skill_install_totals(text[]);',
      'drop function if exists public.sync_skill_install_counts();',
      'drop function if exists public.installed_skill_names(jsonb);',
      'drop table if exists public.skill_install_counts;',
      "delete from public.schema_migrations where filename = '0379_directory_install_counts.sql';",
    ]) {
      expect(down).toContain(statement);
    }
  });
});
