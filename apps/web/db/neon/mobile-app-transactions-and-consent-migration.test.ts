import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => fs.readFileSync(path.resolve(import.meta.dirname, file), 'utf8');

const migration = read('0377_mobile_app_transactions_and_consent.sql');
const reversal = read('down/0377_mobile_app_transactions_and_consent.down.sql');

describe('mobile app transactions and withdrawn consent migration', () => {
  it('lets one install serve several accounts and one account several installs', () => {
    expect(migration).toContain('primary key (app_transaction_id, user_id)');
    expect(migration).toContain('references public.profiles(id) on delete cascade');
  });

  it('keeps a withdrawal per install whether or not an account registered it', () => {
    expect(migration).toMatch(
      /create table if not exists public\.mobile_app_consent_rescissions \(\s*app_transaction_id text primary key/u,
    );
    expect(migration).toContain('notification_id text not null');
    expect(migration).toContain('consent_rescinded_at timestamptz not null default now()');
  });

  it('keeps both tables service-owned under forced RLS with no app policy', () => {
    for (const table of ['mobile_app_transactions', 'mobile_app_consent_rescissions']) {
      expect(migration).toContain(`alter table public.${table} enable row level security;`);
      expect(migration).toContain(`alter table public.${table} force row level security;`);
    }
    expect(migration).not.toMatch(/create policy/iu);
  });

  it('reverses both tables and forgets the migration', () => {
    expect(reversal).toContain('drop table if exists public.mobile_app_consent_rescissions;');
    expect(reversal).toContain('drop table if exists public.mobile_app_transactions;');
    expect(reversal).toContain(
      "delete from public.schema_migrations where filename = '0377_mobile_app_transactions_and_consent.sql';",
    );
  });
});
