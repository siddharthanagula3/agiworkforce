import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.resolve(import.meta.dirname, '0157_user_skills.sql'),
  'utf8',
);

describe('user skills migration', () => {
  it('creates the table with every editor field and audit timestamps', () => {
    expect(migration).toContain('create table if not exists public.user_skills');
    for (const column of [
      'user_id text not null references public.profiles(id) on delete cascade',
      'name text not null',
      'description text not null',
      'body text not null',
      'created_at timestamptz not null default now()',
      'updated_at timestamptz not null default now()',
    ]) {
      expect(migration).toContain(column);
    }
  });

  it('constrains name to the same slug shape the SKILL.md frontmatter enforces', () => {
    expect(migration).toContain("name ~ '^[a-z0-9][a-z0-9-]{0,63}$'");
  });

  it('bounds description and body length', () => {
    expect(migration).toContain('char_length(description) between 1 and 1000');
    expect(migration).toContain('char_length(body) between 1 and 60000');
  });

  it('enforces one name per user rather than globally', () => {
    expect(migration).toContain('constraint user_skills_user_name_unique unique (user_id, name)');
  });

  it('enables and forces row level security scoped to the owning user', () => {
    expect(migration).toMatch(/enable row level security/i);
    expect(migration).toMatch(/force row level security/i);
    expect(migration).toContain('using (user_id = public.current_app_user_id())');
    expect(migration).toContain('with check (user_id = public.current_app_user_id())');
  });

  it('grants DML only to app_rls', () => {
    expect(migration).toContain(
      'grant select, insert, update, delete on public.user_skills to app_rls',
    );
  });

  it('indexes lookups by owning user', () => {
    expect(migration).toContain('idx_user_skills_user_id');
  });
});
