import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.resolve(import.meta.dirname, '0159_plugin_marketplace_sources.sql'),
  'utf8',
);
const reversal = fs.readFileSync(
  path.resolve(import.meta.dirname, 'down/0159_plugin_marketplace_sources.down.sql'),
  'utf8',
);

describe('0159 plugin marketplace sources migration', () => {
  it('is marked not yet applied', () => {
    expect(migration).toContain('NOT YET APPLIED');
  });

  it('creates the sources table restricted to github.com repositories', () => {
    expect(migration).toContain('create table if not exists public.plugin_marketplace_sources');
    expect(migration).toContain(
      "repository_url ~ '^https://github\\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'",
    );
    expect(migration).toContain("status in ('active', 'error')");
  });

  it('creates the cached entries table keyed by source and plugin key', () => {
    expect(migration).toContain('create table if not exists public.plugin_marketplace_entries');
    expect(migration).toContain(
      'references public.plugin_marketplace_sources(id) on delete cascade',
    );
    expect(migration).toContain(
      'constraint plugin_marketplace_entries_source_key_unique unique (source_id, plugin_key)',
    );
    for (const column of [
      'declared_skills',
      'required_connectors',
      'agents',
      'example_prompts',
      'permissions',
    ]) {
      expect(migration).toContain(`jsonb_typeof(${column}) = 'array'`);
    }
    expect(migration).toContain(
      "content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$')",
    );
  });

  it('creates the per-user marketplace installations table', () => {
    expect(migration).toContain(
      'create table if not exists public.plugin_marketplace_installations',
    );
    expect(migration).toContain(
      'references public.plugin_marketplace_entries(id) on delete cascade',
    );
    expect(migration).toContain(
      'constraint plugin_marketplace_installations_user_entry_unique unique (user_id, entry_id)',
    );
  });

  it('force-enables row level security on every user-scoped table', () => {
    for (const table of [
      'plugin_marketplace_sources',
      'plugin_marketplace_entries',
      'plugin_marketplace_installations',
    ]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain(`alter table public.${table} force row level security`);
    }
  });

  it('scopes source and installation policies to the owning user', () => {
    expect(migration).toContain(
      'create policy plugin_marketplace_sources_user_isolation\n  on public.plugin_marketplace_sources for all to app_rls\n  using (user_id = public.current_app_user_id())',
    );
    expect(migration).toContain(
      'create policy plugin_marketplace_installations_user_isolation\n  on public.plugin_marketplace_installations for all to app_rls\n  using (user_id = public.current_app_user_id())',
    );
  });

  it('scopes the entries policy through the owning source rather than a direct user_id column', () => {
    expect(migration).toContain('create policy plugin_marketplace_entries_owner_isolation');
    expect(migration).toContain(
      'source_id in (\n      select id from public.plugin_marketplace_sources\n       where user_id = public.current_app_user_id()\n    )',
    );
  });

  it('reverses by dropping all three tables in dependency order', () => {
    expect(reversal).toContain('BEGIN;');
    expect(reversal).toContain('drop table if exists public.plugin_marketplace_installations;');
    expect(reversal).toContain('drop table if exists public.plugin_marketplace_entries;');
    expect(reversal).toContain('drop table if exists public.plugin_marketplace_sources;');
    expect(reversal.indexOf('plugin_marketplace_installations')).toBeLessThan(
      reversal.indexOf('plugin_marketplace_entries'),
    );
    expect(reversal.indexOf('plugin_marketplace_entries')).toBeLessThan(
      reversal.indexOf('plugin_marketplace_sources'),
    );
    expect(reversal).toContain("filename = '0159_plugin_marketplace_sources.sql'");
    expect(reversal).toContain('COMMIT;');
  });
});
