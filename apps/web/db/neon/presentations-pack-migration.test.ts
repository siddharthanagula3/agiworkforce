import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.resolve(import.meta.dirname, '0161_presentations_pack.sql'),
  'utf8',
);
const reversal = fs.readFileSync(
  path.resolve(import.meta.dirname, 'down/0161_presentations_pack.down.sql'),
  'utf8',
);

describe('0161 presentations pack migration', () => {
  it('is marked not yet applied', () => {
    expect(migration).toContain('NOT YET APPLIED');
  });

  it('seeds presentations-pack as published, first-party and web installable', () => {
    expect(migration).toContain("'presentations-pack'");
    expect(migration).toContain("'builtin', 'published', true");
    expect(migration).toContain("'agi', 'AGI', 'first-party'");
  });

  it('declares only presentation-creation as its skill', () => {
    expect(migration).toContain('\'["presentation-creation"]\'::jsonb');
  });

  it('requires no connectors', () => {
    const seeded = migration.slice(migration.indexOf('insert into public.plugin_registry_entries'));
    expect(seeded).toContain("'[]'::jsonb");
  });

  it('is replay-safe on conflict', () => {
    expect(migration).toContain('on conflict (id) do nothing');
  });

  it('reverses by removing installations then the registry row', () => {
    expect(reversal).toContain('BEGIN;');
    expect(reversal).toContain(
      "delete from public.plugin_installations where plugin_id = 'presentations-pack';",
    );
    expect(reversal).toContain(
      "delete from public.plugin_registry_entries where id = 'presentations-pack';",
    );
    expect(reversal.indexOf('plugin_installations')).toBeLessThan(
      reversal.indexOf('plugin_registry_entries where'),
    );
    expect(reversal).toContain("filename = '0161_presentations_pack.sql'");
  });
});
