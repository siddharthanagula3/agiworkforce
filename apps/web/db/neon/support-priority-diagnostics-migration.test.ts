import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { HANDOFF_PRIORITIES } from '@/lib/support/handoff/priority';

const MIGRATION_PATH = path.resolve(
  import.meta.dirname,
  '0222_support_priority_and_diagnostics.sql',
);
const DOWN_PATH = path.resolve(
  import.meta.dirname,
  'down/0222_support_priority_and_diagnostics.down.sql',
);

const migration = fs.readFileSync(MIGRATION_PATH, 'utf8');
const down = fs.readFileSync(DOWN_PATH, 'utf8');

const executable = migration
  .split('\n')
  .map((line) => line.replace(/--.*$/u, ''))
  .join('\n');

describe('0222 support priority and diagnostics', () => {
  it('stores the queue priority rather than joining to a contract at read time', () => {
    expect(executable).toMatch(/alter table public\.support_handoff_sessions/iu);
    expect(executable).toMatch(
      /add column if not exists priority text not null default 'normal'/iu,
    );
  });

  /**
   * The constraint and the application's own vocabulary have to be the same
   * list. Two copies is how a value the service can produce becomes a value the
   * database refuses, which surfaces as an escalation that silently fails to
   * insert.
   */
  it('checks priority against exactly the vocabulary the service can produce', () => {
    const match = executable.match(
      /support_handoff_sessions_priority_check\s*\n?\s*check \(priority in \(([^)]+)\)\)/iu,
    );
    expect(match).not.toBeNull();
    const stored = match![1]!
      .split(',')
      .map((value) => value.trim().replace(/'/gu, ''))
      .filter(Boolean)
      .sort();
    expect(stored).toEqual([...HANDOFF_PRIORITIES].sort());
  });

  it('keeps the raw tier beside the derived priority', () => {
    expect(executable).toMatch(/add column if not exists support_tier text/iu);
  });

  it('indexes the queue the way the queue reader orders it', () => {
    expect(executable).toMatch(
      /create index if not exists idx_support_handoff_sessions_queue[\s\S]*?\(priority, created_at\)[\s\S]*?where status = 'waiting'/iu,
    );
  });

  it('gives diagnostics a column of its own rather than folding it into account_context', () => {
    expect(executable).toMatch(/add column if not exists diagnostics jsonb/iu);
    expect(executable).not.toMatch(/account_context\s*=/iu);
  });

  /**
   * The handoff retention sweep is shorter than a ticket's lifetime. A cascade
   * would delete the durable record when the transcript expired.
   */
  it('does not let an expiring handoff take its ticket with it', () => {
    expect(executable).toMatch(
      /handoff_session_id uuid\s*\n?\s*references public\.support_handoff_sessions\(id\) on delete set null/iu,
    );
    expect(executable).not.toMatch(/support_handoff_sessions\(id\) on delete cascade/iu);
  });

  it('grants nothing to app_rls, keeping the 0089 access model', () => {
    expect(executable).not.toMatch(/grant[\s\S]*to app_rls/iu);
  });

  it('is reversible, and the down file deregisters itself', () => {
    expect(down).toMatch(/drop column if exists priority/iu);
    expect(down).toMatch(/drop column if exists diagnostics/iu);
    expect(down).toMatch(/drop column if exists handoff_session_id/iu);
    expect(down).toMatch(
      /delete from public\.schema_migrations\s*\n?\s*where filename = '0222_support_priority_and_diagnostics\.sql'/iu,
    );
  });

  it('does not drop the ticket rows 0024 created when it is reversed', () => {
    expect(down).not.toMatch(/drop table[\s\S]*support_tickets/iu);
    expect(down).not.toMatch(/delete from public\.support_tickets/iu);
  });
});
