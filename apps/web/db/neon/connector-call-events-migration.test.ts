import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { USER_SCOPED_TABLES } from '@/lib/server/account-erasure';

const migration = fs.readFileSync(
  path.resolve(import.meta.dirname, '0223_connector_call_events.sql'),
  'utf8',
);
const reversal = fs.readFileSync(
  path.resolve(import.meta.dirname, 'down/0223_connector_call_events.down.sql'),
  'utf8',
);

describe('connector call events migration', () => {
  it('accepts exactly the outcomes the executor records', () => {
    const outcomes = /outcome = any \(array\[([^\]]+)\]\)/.exec(migration)?.[1];
    expect(outcomes).toBeDefined();
    const accepted = [...outcomes!.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
    expect(new Set(accepted)).toEqual(new Set(['succeeded', 'failed', 'blocked']));
  });

  it('indexes both reads the table exists for: the log and the health streak', () => {
    expect(migration).toContain('idx_connector_call_events_user_occurred');
    expect(migration).toContain('idx_connector_call_events_health');
    expect(migration).toMatch(
      /idx_connector_call_events_health\s+on public\.connector_call_events \(user_id, connector_id, occurred_at desc\)/,
    );
  });

  it('lets an account read and write only its own rows, and never update one', () => {
    expect(migration).toContain(
      'alter table public.connector_call_events enable row level security',
    );
    expect(migration).toContain(
      'alter table public.connector_call_events force row level security',
    );
    expect(migration).toContain('create policy connector_call_events_user_isolation');
    expect(migration).toContain('using (user_id = (select public.current_app_user_id()))');
    expect(migration).toContain('with check (user_id = (select public.current_app_user_id()))');
    expect(migration).not.toMatch(
      /grant\s+[^;]*update[^;]*on public\.connector_call_events to app_rls/,
    );
  });

  it('cascades the subject so erasing an account takes its call log with it', () => {
    expect(migration).toContain(
      'user_id text not null references public.profiles(id) on delete cascade',
    );
    expect(migration).toContain(
      'organization_id uuid references public.organizations(id) on delete set null',
    );
  });

  it('is named by account erasure, so the export inventory has to answer for it', () => {
    expect(USER_SCOPED_TABLES).toContainEqual({
      table: 'connector_call_events',
      column: 'user_id',
    });
  });

  it('is reversible: the reversal names the table, its indexes, policy and RLS toggles', () => {
    for (const named of [
      'drop table if exists public.connector_call_events',
      'idx_connector_call_events_user_occurred',
      'idx_connector_call_events_health',
      'idx_connector_call_events_organization',
      'connector_call_events_user_isolation',
      'disable row level security',
      'no force row level security',
      'delete from public.schema_migrations',
    ]) {
      expect(reversal).toContain(named);
    }
  });
});
