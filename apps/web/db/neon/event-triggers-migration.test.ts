import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { TRIGGER_SOURCES } from '@/lib/triggers/trigger-types';

const migration = fs.readFileSync(
  path.resolve(import.meta.dirname, '0210_event_triggers.sql'),
  'utf8',
);
const reversal = fs.readFileSync(
  path.resolve(import.meta.dirname, 'down/0210_event_triggers.down.sql'),
  'utf8',
);

describe('event triggers migration', () => {
  it('accepts exactly the sources the application knows about', () => {
    const declared = /source text not null\s+check \(source = any \(array\[([^\]]*)\]\)\)/.exec(
      migration,
    )?.[1];
    const sources = [...(declared ?? '').matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
    expect(sources).toEqual([...TRIGGER_SOURCES]);
  });

  it('records every delivery once per trigger so a redelivery cannot run the task twice', () => {
    expect(migration).toContain(
      'constraint event_trigger_events_delivery_unique unique (trigger_id, delivery_id)',
    );
  });

  it('holds a trigger back until its account is verified, storing only the code hash', () => {
    expect(migration).toContain("verification_status text not null default 'pending'");
    expect(migration).toContain('verification_code_sha256 text');
    expect(migration).toContain("~ '^[0-9a-f]{64}$'");
  });

  it('requires an account for the sources that are routed by one', () => {
    expect(migration).toContain('constraint event_triggers_account_required');
    expect(migration).toContain(
      "check (source = any (array['google_calendar', 'connector']) or source_account is not null)",
    );
  });

  it('never lets an account mark its own trigger verified or repoint it', () => {
    expect(migration).toMatch(
      /grant update \(\s*name, event_types, conditions, debounce_seconds, max_attempts, is_enabled, updated_at\s*\) on public\.event_triggers to app_rls/,
    );
    expect(migration).toContain('create policy event_triggers_owner_insert');
    expect(migration).toContain('and verified_at is null');
    expect(migration).toContain("or source = any (array['github', 'connector'])");
  });

  it('only lets a trigger fire a task the same account owns', () => {
    expect(migration).toContain('from public.scheduled_tasks as task');
    expect(migration).toContain('task.id = event_triggers.task_id');
    expect(migration).toContain('task.user_id = event_triggers.user_id');
  });

  it('keeps the delivery trail readable by its owner and written by the service alone', () => {
    expect(migration).toContain('grant select on public.event_trigger_events to app_rls');
    expect(migration).toContain('create policy event_trigger_events_owner_read');
    expect(migration).not.toContain('grant insert on public.event_trigger_events to app_rls');
  });

  it('cascades from the account, the workspace, the task and the trigger', () => {
    expect(migration).toContain(
      'user_id text not null references public.profiles(id) on delete cascade',
    );
    expect(migration).toContain(
      'task_id uuid not null references public.scheduled_tasks(id) on delete cascade',
    );
    expect(migration).toContain(
      'trigger_id uuid not null references public.event_triggers(id) on delete cascade',
    );
  });

  it('is reversible: the reversal names both tables, their indexes, constraints and policies', () => {
    for (const named of [
      'drop table if exists public.event_trigger_events',
      'drop table if exists public.event_triggers',
      'idx_event_triggers_source_account',
      'idx_event_trigger_events_trigger',
      'event_trigger_events_delivery_unique',
      'event_triggers_account_required',
      'event_triggers_owner_insert',
      'event_trigger_events_owner_read',
      'disable row level security',
      'delete from public.schema_migrations',
    ]) {
      expect(reversal).toContain(named);
    }
  });
});
