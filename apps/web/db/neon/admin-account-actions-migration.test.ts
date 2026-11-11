import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), 'utf8');
const up = read('0405_admin_account_actions.sql');
const down = read('down/0405_admin_account_actions.down.sql');
const flat = (sql: string) => sql.replace(/\s+/g, ' ');
const service = readFileSync(
  resolve(import.meta.dirname, '../../lib/server/admin-account-actions.ts'),
  'utf8',
);

describe('0405 admin account actions', () => {
  it('creates the table the admin route records into, owned by the account it acts on', () => {
    expect(up).toContain('NOT YET APPLIED : draft only');
    expect(up).toContain('create table if not exists public.admin_account_actions (');
    expect(up).toContain('user_id text not null references public.profiles(id) on delete cascade,');
    expect(service).toContain('insert into public.admin_account_actions');
  });

  it('names every provider step state the service writes', () => {
    expect(flat(up)).toContain(
      "check (provider_status in ('not_required', 'pending', 'completed', 'failed', 'superseded'))",
    );
    for (const status of ['superseded', 'completed', 'not_required', 'pending']) {
      expect(service).toContain(`'${status}'`);
    }
  });

  it('ties a provider step to what the provider must be told, and a completion to its time', () => {
    expect(flat(up)).toContain(
      "check ( (provider_suspended is null) = (provider_status = 'not_required') )",
    );
    expect(flat(up)).toContain(
      "check ( (provider_status = 'completed') = (provider_completed_at is not null) )",
    );
  });

  it('keeps every row away from the application role', () => {
    expect(up).toContain('alter table public.admin_account_actions enable row level security;');
    expect(up).toContain('alter table public.admin_account_actions force row level security;');
    expect(up).toContain('revoke all on public.admin_account_actions from public;');
    expect(up).toContain('revoke all on public.admin_account_actions from app_rls;');
    expect(up).not.toMatch(/grant [a-z, ]+ on public\.admin_account_actions to app_rls/i);
    expect(up).not.toMatch(/create policy/i);
  });

  it('indexes the unfinished steps and keeps updated_at current', () => {
    expect(flat(up)).toContain(
      "on public.admin_account_actions (created_at) where provider_status in ('pending', 'failed');",
    );
    expect(flat(up)).toContain(
      'before update on public.admin_account_actions for each row execute function public.set_row_updated_at();',
    );
  });

  it('rolls back what it adds', () => {
    expect(down).toContain('WHAT THIS COSTS');
    expect(down).toContain('drop table if exists public.admin_account_actions;');
    expect(down).toContain("where filename = '0405_admin_account_actions.sql';");
  });
});
