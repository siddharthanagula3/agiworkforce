import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.resolve(import.meta.dirname, '0095_published_artifacts.sql'),
  'utf8',
);

describe('published artifacts migration', () => {
  it('creates the table with every column the publish contract writes', () => {
    expect(migration).toContain('create table if not exists public.published_artifacts');
    for (const column of [
      'token text not null unique',
      'user_id text not null',
      'artifact_id text not null',
      'conversation_id uuid references public.web_conversations(id) on delete cascade',
      'title text not null default',
      'kind text not null',
      'language text',
      'content text not null',
      'created_at timestamptz not null default now()',
      'updated_at timestamptz not null default now()',
    ]) {
      expect(migration).toContain(column);
    }
  });

  it('constrains the token to the 24-char base64url shape the routes validate', () => {
    // The API and the public page both gate on /^[A-Za-z0-9_-]{24}$/; the
    // database must not accept a shape those paths would refuse to serve.
    expect(migration).toContain("check (token ~ '^[A-Za-z0-9_-]{24}$')");
  });

  it('constrains kind to the artifact kinds the public page can actually render', () => {
    expect(migration).toContain(
      "kind in ('html', 'react', 'svg', 'mermaid', 'markdown', 'text', 'code')",
    );
    // Binary/document kinds have no safe public serving path yet and must not
    // be storable as rows the page cannot honour.
    for (const unsupported of ["'pdf'", "'docx'", "'image'", "'spreadsheet'", "'presentation'"]) {
      expect(migration).not.toContain(unsupported);
    }
  });

  it('bounds the stored content so one publish cannot bloat a row', () => {
    expect(migration).toContain('check (length(content) <= 1000000)');
  });

  it('makes (user_id, artifact_id) the republish key so a re-publish upserts', () => {
    expect(migration).toContain('unique (user_id, artifact_id)');
  });

  it('ships no TTL column, because no TTL policy has been approved', () => {
    // TTL/quota are founder-pending for CAP-015. A defaulted expiry column
    // would silently start deleting live public pages on an unapproved policy.
    expect(migration).not.toMatch(/^\s*expires_at\s/m);
    expect(migration).not.toMatch(/\bdelete from\b/i);
  });

  it('forces RLS and scopes every policy to the publishing user', () => {
    expect(migration).toContain('alter table public.published_artifacts enable row level security');
    expect(migration).toContain('alter table public.published_artifacts force row level security');
    expect(migration).toContain(
      'grant select, insert, update, delete on public.published_artifacts',
    );
    for (const policy of [
      'published_artifacts_owner_read',
      'published_artifacts_owner_insert',
      'published_artifacts_owner_update',
      'published_artifacts_owner_delete',
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

  it('indexes the management list and the conversation lookup', () => {
    expect(migration).toContain('idx_published_artifacts_user_created');
    expect(migration).toContain('idx_published_artifacts_conversation');
  });
});
