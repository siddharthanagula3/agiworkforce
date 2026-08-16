
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION_PATH = path.resolve(import.meta.dirname, '0089_support_live_handoff.sql');
const migration = fs.readFileSync(MIGRATION_PATH, 'utf8');

const executable = migration
  .split('\n')
  .map((line) => line.replace(/--.*$/u, ''))
  .join('\n');

describe('0089 support live handoff · the no-indefinite-wait guarantee', () => {
  it('makes an indefinite waiting state unstorable', () => {
    expect(executable).toMatch(/constraint\s+support_handoff_waiting_has_deadline/iu);
    expect(executable).toMatch(
      /check\s*\(\s*status\s*<>\s*'waiting'\s+or\s+wait_expires_at\s+is\s+not\s+null\s*\)/iu,
    );
  });

  it('has no `connecting` status anywhere in the vocabulary', () => {
    expect(executable).not.toMatch(/'connecting'/iu);
  });

  it('pins the status vocabulary to exactly the seven states the service handles', () => {
    const match = executable.match(
      /status\s+text\s+not null\s*\n?\s*check \(status in \(([^)]+)\)\)/iu,
    );
    expect(match).not.toBeNull();
    const statuses = match![1]!
      .split(',')
      .map((value) => value.trim().replace(/'/gu, ''))
      .filter(Boolean)
      .sort();
    expect(statuses).toEqual([
      'cancelled',
      'closed',
      'connected',
      'emailed',
      'timed_out_emailed',
      'undeliverable',
      'waiting',
    ]);
  });
});

describe('0089 support live handoff · presence', () => {
  it('creates the roster table with an explicit online/offline check', () => {
    expect(executable).toMatch(/create table if not exists public\.support_agent_presence/iu);
    expect(executable).toMatch(/check \(status in \('online', 'offline'\)\)/iu);
  });

  it('carries a heartbeat column, so availability is liveness and not a stale boolean', () => {
    expect(executable).toMatch(/last_heartbeat_at\s+timestamptz/iu);
  });

  it('defaults an agent to OFFLINE', () => {
    expect(executable).toMatch(/status\s+text not null default 'offline'/iu);
  });

  it('bounds concurrent sessions so capacity is a real gate', () => {
    expect(executable).toMatch(/max_concurrent_sessions\s+int not null default 3/iu);
    expect(executable).toMatch(/check \(max_concurrent_sessions between 0 and 50\)/iu);
  });
});

describe('0089 support live handoff · sessions and messages', () => {
  it('makes the reference id unique so a user can quote exactly one thing', () => {
    expect(executable).toMatch(/reference_id\s+text not null unique/iu);
  });

  it('indexes the sweep, ownership, idle and retention access paths', () => {
    for (const index of [
      'idx_support_handoff_waiting',
      'idx_support_handoff_owner',
      'idx_support_handoff_connected_idle',
      'idx_support_handoff_retention',
      'idx_support_handoff_agent_active',
    ]) {
      expect(executable).toContain(index);
    }
  });

  it('scopes the waiting index to waiting rows, so the cron sweep stays cheap', () => {
    expect(executable).toMatch(
      /create index if not exists idx_support_handoff_waiting[\s\S]{0,160}where status = 'waiting'/iu,
    );
  });

  it('requires an owner key on every session', () => {
    expect(executable).toMatch(/owner_session_key\s+text not null/iu);
  });

  it('makes duplicate message cursors impossible', () => {
    expect(executable).toMatch(/unique \(session_id, seq\)/iu);
  });

  it('cascades messages when a session is purged, so retention cannot orphan content', () => {
    expect(executable).toMatch(
      /references public\.support_handoff_sessions\(id\) on delete cascade/iu,
    );
  });
});

describe('0089 support live handoff · access model', () => {
  it('grants NOTHING to the user-context role', () => {
    expect(executable).not.toMatch(/grant\s+[^;]*\s+to\s+app_rls/iu);
  });

  it('explicitly revokes access from app_rls on all three tables', () => {
    for (const table of [
      'support_agent_presence',
      'support_handoff_sessions',
      'support_handoff_messages',
    ]) {
      expect(executable).toMatch(new RegExp(`revoke all on public\\.${table} from app_rls`, 'iu'));
    }
  });

  it('contains no blanket schema-wide GRANT (the 0043 re-grant footgun)', () => {
    expect(executable).not.toMatch(/on all tables in schema public/iu);
  });
});
