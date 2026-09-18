import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { STUDY_LEVELS, STUDY_MODES } from '@/features/study/lib/study-session';

const MIGRATION = '0247_study_sessions.sql';
const dir = path.join(process.cwd(), 'db/neon');
const sql = readFileSync(path.join(dir, MIGRATION), 'utf8');
const down = readFileSync(path.join(dir, 'down', MIGRATION.replace(/\.sql$/, '.down.sql')), 'utf8');

describe('a study session is a conversation', () => {
  it('owns no messages of its own and points at the conversation', () => {
    expect(sql).toMatch(
      /conversation_id uuid not null unique references public\.web_conversations\(id\) on delete cascade/,
    );
    expect(sql).not.toMatch(/create table[\s\S]*study_messages/);
  });

  it('is deleted with the conversation, so erasure and retention need no new path', () => {
    expect(sql).toMatch(/on delete cascade/);
  });

  it('carries at most one session per conversation', () => {
    expect(sql).toMatch(/conversation_id uuid not null unique/);
  });
});

describe('the vocabulary matches the code', () => {
  it('constrains mode to the modes the feature offers', () => {
    const constraint = /mode text not null check \(mode in \(([^)]*)\)\)/.exec(sql)?.[1] ?? '';
    const modes = constraint.split(',').map((entry) => entry.trim().replace(/'/gu, ''));
    expect(modes.sort()).toEqual([...STUDY_MODES].sort());
  });

  it('constrains level to the levels the feature offers', () => {
    const constraint = /level text not null check \(level in \(([^)]*)\)\)/.exec(sql)?.[1] ?? '';
    const levels = constraint.split(',').map((entry) => entry.trim().replace(/'/gu, ''));
    expect(levels.sort()).toEqual([...STUDY_LEVELS].sort());
  });

  it('refuses a blank topic and bounds its length', () => {
    expect(sql).toMatch(/check \(char_length\(btrim\(topic\)\) between 1 and 200\)/);
  });

  it('refuses a session that ended before it started', () => {
    expect(sql).toMatch(/study_sessions_ends_after_it_starts/);
  });
});

describe('only the owner sees a session', () => {
  it('forces row level security and scopes every statement to the user', () => {
    expect(sql).toMatch(/alter table public\.study_sessions enable row level security/);
    expect(sql).toMatch(/alter table public\.study_sessions force row level security/);
    expect(sql).toMatch(/using \(user_id = public\.current_app_user_id\(\)\)/);
    expect(sql).toMatch(/with check \(user_id = public\.current_app_user_id\(\)\)/);
  });
});

describe('reversal', () => {
  it('drops the table and clears the ledger row', () => {
    expect(down).toMatch(/drop table if exists public\.study_sessions/);
    expect(down).toMatch(new RegExp(`delete from public\\.schema_migrations[\\s\\S]*${MIGRATION}`));
  });

  it('states that conversations survive it', () => {
    expect(down).toMatch(/COST, read this before running it/);
    expect(down).toMatch(/conversations and their messages survive/);
  });
});
