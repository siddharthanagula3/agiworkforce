import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(__dirname, '0112_mobile_native_iap.sql'), 'utf8');

describe('0112 mobile native IAP migration', () => {
  it('binds purchases to an account UUID and makes each store receipt idempotent', () => {
    expect(sql).toContain('app_account_token uuid not null');
    expect(sql).toContain('unique (platform, store_transaction_id)');
    expect(sql).toContain('unique (platform, purchase_token_hash)');
  });

  it('keeps raw store tokens out of the durable receipt table', () => {
    expect(sql).toContain('purchase_token_hash text not null');
    expect(sql).not.toMatch(/\bpurchase_token\s+text\b/);
  });

  it('tracks bounded partial refunds so retries and reversals cannot over-credit', () => {
    expect(sql).toContain('refunded_amount_cents integer not null default 0');
    expect(sql).toContain('refunded_amount_cents <= intended_amount_cents');
  });

  it('keeps receipt tables service-owned under forced RLS', () => {
    expect(sql).toContain('alter table public.mobile_iap_transactions force row level security');
    expect(sql).not.toMatch(/create policy[\s\S]*mobile_iap_transactions/i);
  });
});
