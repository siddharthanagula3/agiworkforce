import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = '0151_web_push_subscriptions.sql';

const migration = fs.readFileSync(path.resolve(import.meta.dirname, MIGRATION), 'utf8');
const reversal = fs.readFileSync(
  path.resolve(import.meta.dirname, 'down', MIGRATION.replace(/\.sql$/, '.down.sql')),
  'utf8',
);

describe('web push subscriptions migration', () => {
  it('is marked as not yet applied, like every other unapplied draft', () => {
    expect(migration).toContain('NOT YET APPLIED');
  });

  it('stores every field RFC 8291 delivery needs', () => {
    expect(migration).toContain('create table if not exists public.web_push_subscriptions');
    for (const column of [
      'user_id text not null references public.profiles(id) on delete cascade',
      'endpoint text not null',
      'p256dh text not null',
      'auth text not null',
      'created_at timestamptz not null default now()',
      'last_seen_at timestamptz not null default now()',
    ]) {
      expect(migration).toContain(column);
    }
  });

  it('rejects key material that could never be encrypted against', () => {
    expect(migration).toContain("p256dh ~ '^[A-Za-z0-9_-]{86,88}$'");
    expect(migration).toContain("auth ~ '^[A-Za-z0-9_-]{22,24}$'");
    expect(migration).toContain("endpoint ~ '^https://'");
  });

  it('keeps one row per endpoint so a shared browser cannot notify two accounts', () => {
    expect(migration).toContain(
      'constraint web_push_subscriptions_endpoint_unique unique (endpoint)',
    );
  });

  it('isolates rows per user the way mobile_devices is isolated', () => {
    expect(migration).toContain(
      'alter table public.web_push_subscriptions enable row level security',
    );
    expect(migration).toContain(
      'alter table public.web_push_subscriptions force row level security',
    );
    expect(migration).toContain('create policy web_push_subscriptions_user_isolation');
    expect(migration).toContain('for all to app_rls');
    expect(migration).toContain('using (user_id = (select public.current_app_user_id()))');
    expect(migration).toContain('with check (user_id = (select public.current_app_user_id()))');
  });

  it('indexes the per-user delivery lookup', () => {
    expect(migration).toContain('idx_web_push_subscriptions_user_id');
  });

  it('erases with the account rather than relying on a hand-maintained table list', () => {
    expect(migration).toContain('on delete cascade');
  });

  it('reverses itself and retracts its own ledger row', () => {
    expect(reversal).toContain('drop table if exists public.web_push_subscriptions');
    expect(reversal).toContain(`where filename = '${MIGRATION}'`);
    expect(reversal.trim().startsWith('--') || reversal.trim().startsWith('begin')).toBe(true);
    expect(reversal.trim().endsWith('commit;')).toBe(true);
  });
});
