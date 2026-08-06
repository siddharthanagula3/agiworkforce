/**
 * 0088_support_action_proposals.sql — SQL shape.
 *
 * SCOPE AND HONEST LIMITS: this is a static assertion over the migration text.
 * Every DB test in apps/web mocks the adapter, so nothing here proves runtime
 * role or RLS behaviour. Whether `app_rls` is really confined to its own rows
 * MUST be rehearsed manually on a throwaway Neon branch using the checklist at
 * the bottom of the migration. A green run of this file is not that proof, and
 * the application code does not rely on RLS as its primary gate — every
 * statement carries an explicit `user_id = $n` predicate.
 *
 * What it does prove is that the migration keeps the properties the
 * confirmation protocol depends on, so a future edit cannot quietly drop one.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION_PATH = path.resolve(import.meta.dirname, '0088_support_action_proposals.sql');
const migration = fs.readFileSync(MIGRATION_PATH, 'utf8');

// Strip `--` comments so assertions about executable SQL cannot be satisfied by
// prose or by the commented-out rehearsal checklist.
const executable = migration
  .split('\n')
  .map((line) => line.replace(/--.*$/u, ''))
  .join('\n');

describe('0088 support action proposals — token integrity', () => {
  it('stores a hash, uniquely, and constrains it to a sha256 hex digest', () => {
    expect(executable).toMatch(/token_hash text not null unique/iu);
    expect(executable).toMatch(/token_hash ~ '\^\[0-9a-f\]\{64\}\$'/iu);
  });

  it('binds a token to one parameter set', () => {
    expect(executable).toMatch(/params_hash text not null/iu);
    expect(executable).toMatch(/params_hash ~ '\^\[0-9a-f\]\{64\}\$'/iu);
  });

  it('binds a token to one caller and one action', () => {
    expect(executable).toMatch(/user_id text not null/iu);
    expect(executable).toMatch(/action_id text not null/iu);
  });

  it('makes expiry and single use representable', () => {
    expect(executable).toMatch(/expires_at timestamptz not null/iu);
    expect(executable).toMatch(/consumed_at timestamptz/iu);
  });

  it('constrains the outcome vocabulary the store writes', () => {
    for (const outcome of ['proposed', 'executing', 'success', 'failure', 'denied', 'expired']) {
      expect(executable).toContain(`'${outcome}'`);
    }
    expect(executable).toMatch(/outcome text not null default 'proposed'/iu);
  });
});

describe('0088 support action proposals — no content, no credentials', () => {
  it('has no column for message, prompt, model output or key material', () => {
    // The table records that an action was proposed, never what was said.
    for (const forbidden of [
      'message',
      'transcript',
      'prompt',
      'completion',
      'answer',
      'api_key',
      'secret',
      'raw_token',
      'email',
    ]) {
      expect(
        new RegExp(`^\\s*${forbidden}\\s+(text|jsonb|varchar)`, 'imu').test(executable),
        `unexpected content-bearing column: ${forbidden}`,
      ).toBe(false);
    }
  });

  it('keeps the conversation reference an opaque id, not a payload', () => {
    expect(executable).toMatch(/conversation_ref text/iu);
    expect(executable).not.toMatch(/conversation_ref jsonb/iu);
  });
});

describe('0088 support action proposals — isolation', () => {
  it('enables and forces row level security', () => {
    expect(executable).toMatch(
      /alter table public\.support_action_proposals enable row level security/iu,
    );
    expect(executable).toMatch(
      /alter table public\.support_action_proposals force row level security/iu,
    );
  });

  it('scopes the app_rls policy to the session user, both directions', () => {
    expect(executable).toMatch(/create policy support_action_proposals_user_isolation/iu);
    expect(executable).toMatch(/using \(user_id = public\.current_app_user_id\(\)\)/iu);
    expect(executable).toMatch(/with check \(user_id = public\.current_app_user_id\(\)\)/iu);
    expect(executable).toMatch(/drop policy if exists support_action_proposals_user_isolation/iu);
  });

  it('never grants DELETE, and never re-grants schema-wide (the 0043 footgun)', () => {
    expect(executable).not.toMatch(/grant[^;]*delete[^;]*support_action_proposals/iu);
    expect(executable).not.toMatch(/grant[\s\S]{0,80}on all tables in schema/iu);
  });

  it('indexes the two access paths the store actually uses', () => {
    expect(executable).toMatch(
      /on public\.support_action_proposals \(user_id, created_at desc\)/iu,
    );
    expect(executable).toMatch(/on public\.support_action_proposals \(expires_at\)/iu);
  });
});

describe('0088 support action proposals — numbering and rehearsal', () => {
  it('claims a free migration number exactly once', () => {
    const dir = path.dirname(MIGRATION_PATH);
    const numbered = fs
      .readdirSync(dir)
      .filter((name) => /^\d{4}_.*\.sql$/u.test(name))
      .map((name) => Number.parseInt(name.slice(0, 4), 10));
    expect(numbered).toContain(88);
    expect(numbered.filter((n) => n === 88)).toHaveLength(1);
  });

  it('carries the manual Neon-branch rehearsal checklist, since vitest cannot prove RLS', () => {
    expect(migration).toMatch(/VERIFICATION/iu);
    expect(migration).toMatch(/throwaway Neon BRANCH/iu);
    expect(migration).toMatch(/set role app_rls;/iu);
  });
});
