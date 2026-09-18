import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const FILE = '0232_plugin_package_signing_and_permission_review';

const migration = fs.readFileSync(path.resolve(import.meta.dirname, `${FILE}.sql`), 'utf8');
const reversal = fs.readFileSync(
  path.resolve(import.meta.dirname, `down/${FILE}.down.sql`),
  'utf8',
);

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ');
}

function constraintBody(sql: string, name: string): string {
  const match = normalize(sql).match(new RegExp(`add constraint ${name} check \\((.*?)\\);`));
  return match?.[1]?.trim() ?? '';
}

describe('0232 published plugin packages carry provenance or a signature', () => {
  it('exempts a builtin first-party pack and nothing else', () => {
    expect(constraintBody(migration, 'plugin_registry_entries_published_is_signed')).toBe(
      "status <> 'published' or (source = 'builtin' and publisher_kind = 'first-party') or (sha256 is not null and signature is not null)",
    );
  });

  it('still requires a digest and a signature for every other published entry', () => {
    const body = constraintBody(migration, 'plugin_registry_entries_published_is_signed');
    expect(body).toContain('sha256 is not null and signature is not null');
    expect(body).not.toContain("source = 'marketplace'");
    expect(body).not.toContain("source = 'custom'");
  });

  it('keeps a signature paired with an algorithm this deployment accepts', () => {
    expect(
      constraintBody(migration, 'plugin_registry_entries_signature_pairs_with_algorithm'),
    ).toBe(
      "(signature is null and signature_algorithm is null) or (signature is not null and signature_algorithm in ('ed25519'))",
    );
  });

  it('drops 0096 unsigned-until-policy forward and restores it on the way back', () => {
    expect(migration).toContain(
      'drop constraint if exists plugin_registry_entries_unsigned_until_policy',
    );
    expect(migration).not.toContain('add constraint plugin_registry_entries_unsigned_until_policy');
    expect(reversal).toContain(
      'drop constraint if exists plugin_registry_entries_published_is_signed',
    );
    expect(reversal).toContain('add constraint plugin_registry_entries_unsigned_until_policy');
  });

  it('records the scan verdict against the content hash, not the plugin', () => {
    expect(normalize(migration)).toContain(
      'create table if not exists public.plugin_package_scans ( content_hash text primary key',
    );
    expect(reversal).toContain('drop table if exists public.plugin_package_scans');
  });
});
