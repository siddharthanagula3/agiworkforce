import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.resolve(import.meta.dirname, '0111_credit_top_up_carry.sql'),
  'utf8',
);
const down = fs.readFileSync(
  path.resolve(import.meta.dirname, 'down/0111_credit_top_up_carry.down.sql'),
  'utf8',
);

describe('credit top-up carry migration', () => {
  it('tracks purchased allocation separately without changing the cents ledger', () => {
    expect(migration).toContain('add column if not exists top_up_allocated_cents integer');
    expect(migration).toContain(
      'credits_allocated_cents = credits_allocated_cents + p_amount_cents',
    );
    expect(migration).toContain("case when p_transaction_type = 'purchase'");
    expect(migration).toContain('idx_credit_transactions_top_up_session_receipt');
    expect(migration).toContain("description like 'Credit top-up purchase cs_%'");
  });

  it('carries only unused purchases made during the preceding 12 months', () => {
    expect(migration).toContain("purchase_row.created_at > p_period_start - interval '12 months'");
    expect(migration).toContain('v_previous.top_up_allocated_cents');
    expect(migration).toContain('v_remaining_cents');
    expect(migration).toContain('v_unexpired_purchases_cents');
  });

  it('retires refunded purchases so spent value cannot reappear at renewal', () => {
    expect(migration).toContain('create or replace function public.handle_top_up_refund');
    expect(migration).toContain(
      'top_up_allocated_cents = top_up_allocated_cents - v_purchase_to_retire',
    );
    expect(migration).toContain("'top_up_refund', true");
    expect(down).toContain('drop function if exists public.handle_top_up_refund');
  });

  it('makes a repeated period reset idempotent instead of restoring spent allowance', () => {
    expect(migration).toContain('if v_account_id is not null then');
    expect(migration).toContain('return v_account_id;');
    expect(migration).not.toContain('do update set');
  });

  it('provides a reversible down migration', () => {
    expect(down).toContain('drop column if exists top_up_allocated_cents');
    expect(down).toContain("filename = '0111_credit_top_up_carry.sql'");
  });
});
