import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.resolve(import.meta.dirname, '0096_plugin_registry.sql'),
  'utf8',
);

describe('plugin registry migration', () => {
  it('stores every field of the PluginRegistryEntry contract', () => {
    expect(migration).toContain('create table if not exists public.plugin_registry_entries');
    for (const column of [
      'name text not null',
      'version text not null',
      'description text not null',
      'category text not null',
      'publisher_id text not null',
      'publisher_name text not null',
      'publisher_kind text not null',
      'source text not null',
      'status text not null',
      'declared_skills jsonb not null',
      'required_connectors jsonb not null',
      'capabilities jsonb not null',
      'permissions jsonb not null',
      'versions jsonb not null',
      'manifest_url text',
      'sha256 text',
      'signature text',
      'signature_algorithm text',
    ]) {
      expect(migration).toContain(column);
    }
  });

  it('constrains the id to a safe URL segment and install directory name', () => {
    expect(migration).toContain("id text primary key check (id ~ '^[a-z0-9][a-z0-9._-]{0,127}$')");
  });

  it('constrains status and source to the contract unions', () => {
    expect(migration).toContain("status in ('preview', 'published', 'deprecated')");
    expect(migration).toContain("source in ('builtin', 'marketplace', 'custom')");
  });

  it('keeps every contract array column array-shaped so a malformed write cannot land', () => {
    for (const column of [
      'declared_skills',
      'required_connectors',
      'capabilities',
      'permissions',
      'versions',
    ]) {
      expect(migration).toContain(`jsonb_typeof(${column}) = 'array'`);
    }
    expect(migration).toContain("jsonb_typeof(manifest) = 'object'");
  });

  it('rejects a loose version string and a non-hex digest', () => {
    expect(migration).toContain(
      "version text not null check (version ~ '^[0-9]+\\.[0-9]+\\.[0-9]+([-+][0-9A-Za-z.-]+)*$')",
    );
    expect(migration).toContain("sha256 ~ '^[0-9a-f]{64}$'");
  });

  it('enforces first-party-only at launch as a droppable constraint', () => {
    expect(migration).toContain('constraint plugin_registry_entries_first_party_only');
    expect(migration).toContain("check (publisher_kind = 'first-party')");
    expect(migration).toContain("publisher_kind in ('first-party', 'third-party')");
  });

  it('keeps signature columns NULL until a verifier exists', () => {
    expect(migration).toContain('constraint plugin_registry_entries_unsigned_until_policy');
    expect(migration).toContain('check (signature is null and signature_algorithm is null)');
  });

  it('makes status unable to lie about availability', () => {
    expect(migration).toContain('constraint plugin_registry_entries_published_needs_artifact');
    expect(migration).toContain("check (status <> 'published' or manifest_url is not null)");
    expect(migration).toContain('constraint plugin_registry_entries_preview_has_no_artifact');
    expect(migration).toContain(
      "check (status <> 'preview' or (manifest_url is null and sha256 is null))",
    );
  });

  it('makes catalogue rows world-readable and mutations service-role only', () => {
    expect(migration).toContain(
      'alter table public.plugin_registry_entries enable row level security',
    );
    expect(migration).toContain('grant select on public.plugin_registry_entries to app_rls');
    expect(migration).toContain('create policy plugin_registry_entries_public_read');
    // No write grant and no write policy for the non-privileged role.
    expect(migration).not.toMatch(/grant[^;]*insert[^;]*plugin_registry_entries/);
    expect(migration).not.toMatch(/grant[^;]*update[^;]*plugin_registry_entries/);
    expect(migration).not.toMatch(/grant[^;]*delete[^;]*plugin_registry_entries/);
    expect(migration).not.toMatch(/for (insert|update|delete) to app_rls/);
  });

  it('indexes the catalogue list and availability filter', () => {
    expect(migration).toContain('idx_plugin_registry_entries_category');
    expect(migration).toContain('idx_plugin_registry_entries_status');
  });

  it('models no download count, install total, or rating', () => {
    // Comments are allowed to explain the omission; the SQL must not define one.
    const sql = migration
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    for (const forbidden of ['download_count', 'downloads', 'install_count', 'rating', 'stars']) {
      expect(sql).not.toContain(forbidden);
    }
  });

  it('seeds only first-party preview rows, replay-safe', () => {
    expect(migration).toContain('insert into public.plugin_registry_entries');
    expect(migration).toContain('on conflict (id) do nothing');
    for (const id of ['github-automation', 'calendar-assistant', 'research-pack', 'crm-sync']) {
      expect(migration).toContain(`'${id}'`);
    }
    const seeded = migration.slice(migration.indexOf('insert into public.plugin_registry_entries'));
    expect(seeded).not.toContain("'published'");
    expect(seeded).not.toContain("'third-party'");
    expect(seeded.match(/'preview'/g)).toHaveLength(4);
  });
});
