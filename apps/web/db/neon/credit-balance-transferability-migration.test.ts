import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.resolve(import.meta.dirname, '0126_credit_balance_transferability.sql'),
  'utf8',
);
const down = fs.readFileSync(
  path.resolve(import.meta.dirname, 'down/0126_credit_balance_transferability.down.sql'),
  'utf8',
);

describe('credit balance transferability migration', () => {
  it('refuses to move a credit account to another owner', () => {
    expect(migration).toContain(
      'create or replace function public.token_credits_forbid_owner_transfer',
    );
    expect(migration).toContain('new.user_id is distinct from old.user_id');
    expect(migration).toContain('create trigger token_credits_owner_immutable');
    expect(migration).toContain('before update on public.token_credits');
  });

  it('refuses to re-point a ledger entry at another owner or account', () => {
    expect(migration).toContain(
      'create or replace function public.credit_transactions_forbid_owner_transfer',
    );
    expect(migration).toContain('new.credit_account_id is distinct from old.credit_account_id');
    expect(migration).toContain('create trigger credit_transactions_owner_immutable');
    expect(migration).toContain('before update on public.credit_transactions');
  });

  it('records the balance attributes the debit path already enforces', () => {
    expect(migration).toContain('comment on column public.token_credits.top_up_allocated_cents');
    expect(migration).toContain('non-transferable');
    expect(migration).toContain('comment on column public.token_credits.credits_allocated_cents');
  });

  it('provides a reversible down migration', () => {
    expect(down).toContain(
      'drop trigger if exists token_credits_owner_immutable on public.token_credits',
    );
    expect(down).toContain('drop function if exists public.token_credits_forbid_owner_transfer');
    expect(down).toContain(
      'drop trigger if exists credit_transactions_owner_immutable on public.credit_transactions',
    );
    expect(down).toContain(
      'drop function if exists public.credit_transactions_forbid_owner_transfer',
    );
    expect(down).toContain("filename = '0126_credit_balance_transferability.sql'");
  });
});
