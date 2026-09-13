import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = '0182_managed_usage_microusd_ledger.sql';

const migration = fs.readFileSync(path.resolve(import.meta.dirname, MIGRATION), 'utf8');
const down = fs.readFileSync(
  path.resolve(import.meta.dirname, 'down', MIGRATION.replace(/\.sql$/, '.down.sql')),
  'utf8',
);

const ADDED_COLUMNS: ReadonlyArray<readonly [string, readonly string[]]> = [
  [
    'token_credits',
    [
      'credits_allocated_microusd',
      'credits_used_microusd',
      'top_up_allocated_microusd',
      'flagship_used_today_microusd',
    ],
  ],
  ['credit_transactions', ['amount_microusd']],
  ['managed_usage_requests', ['estimated_cost_microusd', 'actual_cost_microusd']],
  ['managed_usage_request_extensions', ['estimated_cost_microusd']],
  ['credit_settlement_jobs', ['amount_microusd']],
];

const MICROUSD_FUNCTIONS = [
  'microusd_to_cents_mirror',
  'build_settlement_result',
  'settlement_result_microusd',
  'calculate_daily_limit_microusd',
  'get_credit_balance_microusd',
  'check_credits_available_microusd',
  'get_or_create_credit_account_microusd',
  'handle_refund_microusd',
  'add_credits_microusd',
  'handle_top_up_refund_microusd',
  'reset_credits_for_period_microusd',
  'deduct_credits_microusd',
  'settle_managed_usage_credits_microusd',
  'enqueue_credit_settlement_microusd',
  'reserve_managed_usage_request_microusd',
  'reserve_managed_usage_request_with_limits_microusd',
  'extend_managed_usage_request_provider_step_microusd',
  'finalize_managed_usage_request_microusd',
] as const;

/** Every cents signature that must survive 0182 as a delegating wrapper. */
const CENTS_WRAPPERS = [
  'get_credit_balance',
  'check_credits_available',
  'get_or_create_credit_account',
  'handle_refund',
  'add_credits',
  'handle_top_up_refund',
  'reset_credits_for_period',
  'deduct_credits',
  'settle_managed_usage_credits',
  'enqueue_credit_settlement',
  'reserve_managed_usage_request',
  'reserve_managed_usage_request_with_limits',
  'extend_managed_usage_request_provider_step',
  'finalize_managed_usage_request',
] as const;

describe('0182 managed usage microUSD ledger', () => {
  it('is a draft until someone approves running it', () => {
    expect(migration).toContain('NOT YET APPLIED');
  });

  it('adds a bigint microUSD twin for every money column the ledger settles', () => {
    for (const [table, columns] of ADDED_COLUMNS) {
      expect(migration).toContain(`alter table public.${table}`);
      for (const column of columns) {
        expect(migration).toContain(`add column if not exists ${column} bigint`);
      }
    }
  });

  it('defaults every new balance column to zero so no historical row is invented', () => {
    for (const column of [
      'credits_allocated_microusd',
      'credits_used_microusd',
      'top_up_allocated_microusd',
      'amount_microusd',
      'estimated_cost_microusd',
    ]) {
      expect(migration).toContain(`add column if not exists ${column} bigint not null default 0`);
    }
  });

  it('backfills every row at exactly ten thousand microUSD per cent', () => {
    for (const source of [
      'credits_allocated_cents',
      'credits_used_cents',
      'top_up_allocated_cents',
      'amount_cents',
      'estimated_cost_cents',
      'actual_cost_cents',
    ]) {
      expect(migration).toContain(`${source}::bigint * 10000`);
    }
  });

  it('backfills in bounded batches rather than one statement over the whole table', () => {
    expect(migration).toContain('limit 5000');
    expect(migration).toContain('get diagnostics v_touched = row_count');
    expect(migration).toContain('exit when v_touched = 0');
  });

  it('rounds the cents mirror half-up in both directions', () => {
    expect(migration).toContain('create or replace function public.microusd_to_cents_mirror');
    expect(migration).toContain('select floor((p_microusd + 5000)::numeric / 10000)::integer;');
  });

  it('mirrors cents from the running total, never from a rounded delta', () => {
    expect(migration).toContain(
      'credits_used_cents = public.microusd_to_cents_mirror(\n        account_row.credits_used_microusd + p_amount_microusd\n      )',
    );
    expect(migration).not.toMatch(/credits_used_cents\s*=\s*credits_used_cents\s*\+/);
  });

  it('defines a microUSD-native body for every function that moves money', () => {
    for (const name of MICROUSD_FUNCTIONS) {
      expect(migration).toContain(`create or replace function public.${name}(`);
    }
  });

  it('keeps every cents signature working as a delegating wrapper', () => {
    for (const name of CENTS_WRAPPERS) {
      expect(migration).toContain(`create or replace function public.${name}(`);
    }
    expect(migration).toContain('p_amount_cents::bigint * 10000');
    expect(migration).toContain('p_estimated_cost_cents::bigint * 10000');
    expect(migration).toContain('p_actual_cost_cents::bigint * 10000');
    expect(migration).toContain('p_credits_allocated_cents::bigint * 10000');
  });

  it('converts the rolling windows to sum the microUSD column', () => {
    expect(migration).toContain('sum(transaction_row.amount_microusd) filter (');
    expect(migration).not.toContain('sum(transaction_row.amount_cents) filter (');
  });

  it('preserves the null/zero cap contract 0152 restored', () => {
    expect(migration).toContain('p_session_cap_microusd is not null');
    expect(migration).toContain('p_weekly_cap_microusd is not null');
    expect(migration).toContain('p_flagship_weekly_cap_microusd is not null');
    expect(migration).not.toMatch(/p_session_cap_microusd\s*>\s*0/);
  });

  it('keeps the negative-release guard that stops a forged refund manufacturing credit', () => {
    expect(migration).toContain(
      'if p_amount_microusd < 0 and v_account.credits_used_microusd < -p_amount_microusd',
    );
    expect(migration).toContain('INVALID_MANAGED_USAGE_RELEASE');
  });

  it('constrains the purchased allocation against the total in the new unit too', () => {
    expect(migration).toContain('token_credits_top_up_allocation_valid_microusd');
    expect(migration).toContain('top_up_allocated_microusd <= credits_allocated_microusd');
  });

  it('renews the lease on every provider step, as 0178 requires', () => {
    expect(migration).toContain('make_interval(secs => 3600)');
    expect(migration).toContain('make_interval(secs => 86400)');
  });

  it('writes both units into the settlement result so unmigrated readers stay correct', () => {
    expect(migration).toContain("'remaining_microusd', p_remaining_microusd");
    expect(migration).toContain(
      "'remaining_cents', public.microusd_to_cents_mirror(p_remaining_microusd)",
    );
  });

  it('reads a pre-0182 settlement result through the cents key', () => {
    expect(migration).toContain('create or replace function public.settlement_result_microusd');
    expect(migration).toContain('(p_result->>p_cents_key)::bigint * 10000');
  });

  it('keeps the mirror maintained for writers that still speak cents', () => {
    // The backfill is one-shot. Without these, a row written afterwards in
    // cents alone leaves the microUSD twin at zero, and because the functions
    // read microUSD such an account holds no spendable balance and every
    // reservation against it is declined.
    for (const table of [
      'token_credits',
      'credit_transactions',
      'credit_settlement_jobs',
      'managed_usage_requests',
      'managed_usage_request_extensions',
    ]) {
      expect(migration).toMatch(
        new RegExp(`create trigger \\w+\\s+before insert or update on public\\.${table}`),
      );
    }
    expect(migration).toContain('create or replace function public.sync_token_credits_units()');
    expect(migration).toContain('new.credits_allocated_cents::bigint * 10000');
  });

  it('lets the microUSD side win whenever the writer supplied it', () => {
    // Reading cents only when microUSD was left at its default is what keeps
    // every function in this migration authoritative over its own writes.
    expect(migration).toContain(
      'if new.credits_allocated_microusd = 0 and new.credits_allocated_cents <> 0',
    );
    expect(migration).toContain(
      'new.credits_allocated_microusd is not distinct from old.credits_allocated_microusd',
    );
  });

  it('orders the transaction trigger after the flagship labeller', () => {
    // Same-timing row triggers fire in name order and each returns NEW, so the
    // two compose, but only one may be the last word on the amount columns.
    expect(migration).toContain('sync_zz_credit_transactions_units');
    expect('label_managed_usage_transaction_flagship' < 'sync_zz_credit_transactions_units').toBe(
      true,
    );
  });

  it('changes no plan allowance, cap ratio or price', () => {
    expect(migration).not.toMatch(/MANAGED_USAGE_LIMITS|monthlyUnits|FLAGSHIP_OF_WEEKLY/);
    expect(migration).not.toMatch(/insert into public\.subscriptions/);
  });

  it('provides a reversible down migration that names what it costs', () => {
    expect(down).toContain('WHAT THIS COSTS');
    expect(down).toContain('ROLLBACK ORDER');
    for (const [, columns] of ADDED_COLUMNS) {
      for (const column of columns) {
        expect(down).toContain(`drop column if exists ${column}`);
      }
    }
    for (const name of MICROUSD_FUNCTIONS) {
      expect(down).toContain(`drop function if exists public.${name}(`);
    }
    expect(down).toContain(`filename = '${MIGRATION}'`);
    for (const trigger of [
      'sync_token_credits_units',
      'sync_zz_credit_transactions_units',
      'sync_credit_settlement_jobs_units',
      'sync_managed_usage_request_units',
      'sync_managed_usage_extension_units',
    ]) {
      expect(down).toContain(`drop trigger if exists ${trigger}`);
    }
  });

  it('restores every cents body inline, so the reversal is one file', () => {
    for (const name of CENTS_WRAPPERS) {
      expect(down).toContain(`create or replace function public.${name}(`);
    }
    expect(down).toContain('recover_stale_managed_usage_requests');
    expect(down).toContain('process_credit_settlement_queue');
    expect(down).not.toContain('microusd_to_cents_mirror(reservation.estimated_cost_microusd)');
  });

  it('drops the unit triggers before the columns and helper they depend on', () => {
    const triggerAt = down.indexOf('drop trigger if exists sync_token_credits_units');
    const columnAt = down.indexOf('drop column if exists credits_allocated_microusd');
    const helperAt = down.indexOf('drop function if exists public.microusd_to_cents_mirror');
    expect(triggerAt).toBeGreaterThan(-1);
    expect(columnAt).toBeGreaterThan(triggerAt);
    expect(helperAt).toBeGreaterThan(triggerAt);
  });

  it('restores the cents bodies before dropping what the wrappers call', () => {
    const restoreAt = down.indexOf('create or replace function public.enqueue_credit_settlement(');
    const dropAt = down.indexOf(
      'drop function if exists public.enqueue_credit_settlement_microusd',
    );
    expect(restoreAt).toBeGreaterThan(-1);
    expect(dropAt).toBeGreaterThan(restoreAt);
  });
});
