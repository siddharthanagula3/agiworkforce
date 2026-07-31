import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.resolve(import.meta.dirname, '0078_conversation_branching_runtime.sql'),
  'utf8',
);

describe('conversation branching migration', () => {
  it('adds a stable idempotency key and lookup indexes', () => {
    expect(migration).toContain('add column if not exists request_id uuid');
    expect(migration).toContain('set request_id = id');
    expect(migration).toContain('idx_conversation_branches_user_request');
    expect(migration).toContain('idx_conversation_branches_source_point');
    expect(migration).toContain('idx_conversation_branches_target');
    expect(migration).toContain('create table if not exists public.conversation_branch_messages');
    expect(migration).toContain('source_message_id uuid not null');
    expect(migration).toContain('target_message_id uuid not null');
  });

  it('forces RLS and verifies both conversation owners on insert', () => {
    expect(migration).toContain('force row level security');
    expect(migration).toContain('conversation_branches_owner_insert');
    expect(migration).toContain('conversation_branch_messages_owner_insert');
    expect(migration).toContain('source.user_id = public.current_app_user_id()');
    expect(migration).toContain('target.user_id = public.current_app_user_id()');
  });
});
