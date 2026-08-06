import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.resolve(import.meta.dirname, '0094_research_reports.sql'),
  'utf8',
);

describe('research reports migration', () => {
  it('stores every field of the ResearchReport contract', () => {
    expect(migration).toContain('create table if not exists public.research_reports');
    for (const column of [
      'user_id text not null',
      'request_id text not null',
      'conversation_id uuid references public.web_conversations(id) on delete cascade',
      'title text not null',
      'summary text not null',
      'content text not null',
      'citations jsonb not null',
      'steps jsonb not null',
      'key_findings jsonb not null',
      'sources_consulted integer not null',
      'duration_ms integer',
      'completed_at timestamptz',
    ]) {
      expect(migration).toContain(column);
    }
  });

  it('constrains status to the contract lifecycle including interrupted', () => {
    expect(migration).toContain(
      "'pending', 'researching', 'synthesizing', 'completed', 'interrupted', 'failed'",
    );
  });

  it('keeps jsonb columns array-shaped so a malformed write cannot land', () => {
    expect(migration).toContain("jsonb_typeof(citations) = 'array'");
    expect(migration).toContain("jsonb_typeof(steps) = 'array'");
    expect(migration).toContain("jsonb_typeof(key_findings) = 'array'");
  });

  it('makes (user_id, request_id) the idempotency key so a retry upserts', () => {
    expect(migration).toContain('unique (user_id, request_id)');
  });

  it('forces RLS and scopes every policy to the owning user', () => {
    expect(migration).toContain('alter table public.research_reports enable row level security');
    expect(migration).toContain('alter table public.research_reports force row level security');
    expect(migration).toContain('grant select, insert, update, delete on public.research_reports');
    for (const policy of [
      'research_reports_owner_read',
      'research_reports_owner_insert',
      'research_reports_owner_update',
      'research_reports_owner_delete',
    ]) {
      expect(migration).toContain(`create policy ${policy}`);
    }
    expect(migration).toContain('user_id = public.current_app_user_id()');
  });

  it('verifies conversation ownership on insert and update', () => {
    const withChecks = migration.match(
      /with check \(\s*user_id = public\.current_app_user_id\(\)/g,
    );
    expect(withChecks).toHaveLength(2);
    expect(migration).toContain('conversation.user_id = public.current_app_user_id()');
  });

  it('indexes the list, conversation, and resumable lookups', () => {
    expect(migration).toContain('idx_research_reports_user_created');
    expect(migration).toContain('idx_research_reports_conversation');
    expect(migration).toContain('idx_research_reports_resumable');
  });
});
