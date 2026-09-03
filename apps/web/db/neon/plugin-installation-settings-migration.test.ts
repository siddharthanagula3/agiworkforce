import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.resolve(import.meta.dirname, '0160_plugin_installation_settings.sql'),
  'utf8',
);
const reversal = fs.readFileSync(
  path.resolve(import.meta.dirname, 'down/0160_plugin_installation_settings.down.sql'),
  'utf8',
);

describe('0160 plugin installation settings migration', () => {
  it('is marked not yet applied', () => {
    expect(migration).toContain('NOT YET APPLIED');
  });

  it('adds enabled_skills as a not-null array defaulting to empty', () => {
    expect(migration).toContain(
      "add column if not exists enabled_skills jsonb not null default '[]'::jsonb",
    );
    expect(migration).toContain("jsonb_typeof(enabled_skills) = 'array'");
  });

  it('adds custom_example_prompts as nullable so null means the plugin defaults', () => {
    expect(migration).toContain('add column if not exists custom_example_prompts jsonb');
    expect(migration).toContain(
      "custom_example_prompts is null or jsonb_typeof(custom_example_prompts) = 'array'",
    );
  });

  it('backfills enabled_skills from the registry declared_skills for existing rows', () => {
    expect(migration).toContain('update public.plugin_installations installation');
    expect(migration).toContain('set enabled_skills = registry.declared_skills');
    expect(migration).toContain('from public.plugin_registry_entries registry');
    expect(migration).toContain('where registry.id = installation.plugin_id');
  });

  it('reverses by dropping both columns from the existing table', () => {
    expect(reversal).toContain('BEGIN;');
    expect(reversal).toContain(
      'alter table public.plugin_installations\n  drop column if exists enabled_skills;',
    );
    expect(reversal).toContain(
      'alter table public.plugin_installations\n  drop column if exists custom_example_prompts;',
    );
    expect(reversal).toContain("filename = '0160_plugin_installation_settings.sql'");
    expect(reversal).toContain('COMMIT;');
  });
});
