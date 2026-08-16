
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION_PATH = path.resolve(import.meta.dirname, '0087_enterprise_audit_event_writes.sql');
const migration = fs.readFileSync(MIGRATION_PATH, 'utf8');

const executable = migration
  .split('\n')
  .map((line) => line.replace(/--.*$/u, ''))
  .join('\n');

describe('0087 enterprise audit write migration — writer function', () => {
  it('creates the writer with the full parameter list the service calls', () => {
    expect(executable).toMatch(
      /create or replace function public\.record_enterprise_audit_event\(/i,
    );
    for (const param of [
      'p_organization_id uuid',
      'p_actor_user_id text',
      'p_surface text',
      'p_action text',
      'p_resource_type text',
      'p_resource_id text',
      'p_outcome text',
      'p_severity text',
      'p_metadata jsonb',
    ]) {
      expect(executable).toContain(param);
    }
  });

  it('runs as the table owner with a hardened search_path', () => {
    expect(executable).toMatch(/security definer/i);
    expect(executable).toMatch(/set search_path = pg_catalog, public, pg_temp/i);
  });

  it('inserts into the canonical enterprise_audit_events table', () => {
    expect(executable).toMatch(/insert into public\.enterprise_audit_events/i);
  });

  it('validates the vocabularies instead of coercing a bad value', () => {
    expect(executable).toMatch(/p_outcome not in \('success', 'failure', 'denied'\)/i);
    expect(executable).toMatch(/p_severity not in \('info', 'warning', 'critical'\)/i);
    expect(executable).toMatch(/raise exception/i);
  });

  it('rejects a missing organization or action rather than writing an orphan row', () => {
    expect(executable).toMatch(/p_organization_id is null/i);
    expect(executable).toMatch(/coalesce\(p_action, ''\) = ''/i);
  });

  it('never trusts a non-object metadata payload', () => {
    expect(executable).toMatch(/jsonb_typeof\(p_metadata\) = 'object'/i);
  });
});

describe('0087 enterprise audit write migration — privileges stay fail-closed', () => {
  it('revokes EXECUTE from public and grants it only to app_rls', () => {
    expect(executable).toMatch(
      /revoke execute on function public\.record_enterprise_audit_event\([\s\S]*?\) from public;/i,
    );
    expect(executable).toMatch(
      /grant execute on function public\.record_enterprise_audit_event\([\s\S]*?\) to app_rls;/i,
    );
  });

  it('makes the table append-only for app_rls (no direct write, no tamper)', () => {
    expect(executable).toMatch(
      /revoke insert, update, delete on public\.enterprise_audit_events from app_rls;/i,
    );
  });

  it('adds an INSERT policy so the definer can complete its write under FORCE RLS', () => {
    expect(executable).toMatch(/create policy enterprise_audit_events_writer_insert/i);
    expect(executable).toMatch(/for insert/i);
    expect(executable).toMatch(/drop policy if exists enterprise_audit_events_writer_insert/i);
  });

  it('does not re-grant privileges schema-wide (the 0043 re-grant footgun)', () => {
    expect(executable).not.toMatch(/grant[\s\S]{0,80}on all tables in schema/i);
  });

  it('does not touch the already-applied 0076 objects', () => {
    expect(executable).not.toMatch(/create table[\s\S]{0,60}enterprise_audit_events/i);
    expect(executable).not.toMatch(/drop table[\s\S]{0,60}enterprise_audit_events/i);
    expect(executable).not.toMatch(/enterprise_audit_events_admin_read/i);
    expect(executable).not.toMatch(/no force row level security/i);
    expect(executable).not.toMatch(/disable row level security/i);
  });
});

describe('0087 enterprise audit write migration — numbering and rehearsal', () => {
  it('takes the next free migration number and does not overwrite an applied one', () => {
    const dir = path.dirname(MIGRATION_PATH);
    const numbered = fs
      .readdirSync(dir)
      .filter((name) => /^\d{4}_.*\.sql$/u.test(name))
      .map((name) => Number.parseInt(name.slice(0, 4), 10))
      .sort((a, b) => a - b);

    expect(numbered).toContain(87);
    expect(numbered.filter((n) => n === 87)).toHaveLength(1);
  });

  it('carries the manual Neon-branch rehearsal checklist, since vitest cannot prove RLS', () => {
    expect(migration).toMatch(/VERIFICATION/i);
    expect(migration).toMatch(/throwaway Neon BRANCH/i);
    expect(migration).toMatch(/set role app_rls;/i);
    expect(migration).toMatch(/permission denied/i);
  });
});
