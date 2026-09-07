import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.resolve(import.meta.dirname, '0175_plugin_marketplace_uploads.sql'),
  'utf8',
);
const reversal = fs.readFileSync(
  path.resolve(import.meta.dirname, 'down/0175_plugin_marketplace_uploads.down.sql'),
  'utf8',
);
const sources = fs.readFileSync(
  path.resolve(import.meta.dirname, '0159_plugin_marketplace_sources.sql'),
  'utf8',
);

describe('0175 plugin marketplace uploads migration', () => {
  it('is marked not yet applied', () => {
    expect(migration).toContain('NOT YET APPLIED');
  });

  it('adds a kind column that defaults every existing source to repository', () => {
    expect(migration).toContain("add column if not exists kind text not null default 'repository'");
    expect(migration).toContain("check (kind in ('repository', 'upload', 'authored'))");
  });

  it('keeps the github url shape for repository sources and forbids one otherwise', () => {
    expect(migration).toContain('alter column repository_url drop not null');
    expect(migration).toContain(
      'drop constraint if exists plugin_marketplace_sources_repository_url_check',
    );
    expect(migration).toContain(
      "when kind = 'repository' then\n        repository_url is not null\n        and repository_url ~ '^https://github\\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'",
    );
    expect(migration).toContain('else repository_url is null');
  });

  it('reuses the exact url pattern 0159 wrote rather than a looser copy of it', () => {
    const pattern = "repository_url ~ '^https://github\\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'";
    expect(sources).toContain(pattern);
    expect(migration).toContain(pattern);
  });

  it('stores file bodies keyed by entry and path, with a size that cannot disagree', () => {
    expect(migration).toContain('create table if not exists public.plugin_marketplace_entry_files');
    expect(migration).toContain(
      'references public.plugin_marketplace_entries(id) on delete cascade',
    );
    expect(migration).toContain(
      'constraint plugin_marketplace_entry_files_entry_path_unique unique (entry_id, path)',
    );
    expect(migration).toContain(
      "content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$')",
    );
    expect(migration).toContain(
      'byte_size integer not null check (byte_size = octet_length(content))',
    );
  });

  it('force-enables row level security on the new table', () => {
    expect(migration).toContain(
      'alter table public.plugin_marketplace_entry_files enable row level security',
    );
    expect(migration).toContain(
      'alter table public.plugin_marketplace_entry_files force row level security',
    );
    expect(migration).toContain(
      'grant select, insert, update, delete on public.plugin_marketplace_entry_files to app_rls',
    );
  });

  it('scopes files through the entry owning source, matching the entries policy', () => {
    expect(migration).toContain('create policy plugin_marketplace_entry_files_owner_isolation');
    expect(migration).toContain(
      'join public.plugin_marketplace_sources sources on sources.id = entries.source_id\n       where sources.user_id = public.current_app_user_id()',
    );
    expect(sources).toContain('where user_id = public.current_app_user_id()');
  });

  it('reverses by deleting the sources that cannot satisfy the restored not null', () => {
    expect(reversal).toContain('begin;');
    expect(reversal).toContain(
      "delete from public.plugin_marketplace_sources\n where kind <> 'repository' or repository_url is null",
    );
    expect(reversal).toContain('alter column repository_url set not null');
    expect(reversal).toContain('add constraint plugin_marketplace_sources_repository_url_check');
    expect(reversal).toContain('drop column if exists kind');
    expect(reversal).toContain('drop table if exists public.plugin_marketplace_entry_files;');
    expect(reversal).toContain("filename = '0175_plugin_marketplace_uploads.sql'");
    expect(reversal).toContain('commit;');
  });

  it('deletes the unrepeatable rows before it restores the not null that forbids them', () => {
    expect(reversal.indexOf('delete from public.plugin_marketplace_sources')).toBeLessThan(
      reversal.indexOf('alter column repository_url set not null'),
    );
    expect(
      reversal.indexOf('drop constraint if exists plugin_marketplace_sources_kind_known'),
    ).toBeLessThan(reversal.indexOf('drop column if exists kind'));
  });

  it('says what the reversal destroys', () => {
    expect(reversal).toContain('WHAT THIS COSTS');
  });
});
