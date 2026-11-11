import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = import.meta.dirname;
const read = (name: string) => fs.readFileSync(path.join(DIR, name), 'utf8');
const UP_NAME = '0415_release_after_renewal_restores_purchased_carry.sql';
const UP = read(UP_NAME);
const DOWN = read(`down/${UP_NAME.replace(/\.sql$/, '.down.sql')}`);
const PRIOR = read('0182_managed_usage_microusd_ledger.sql');
const RESET = read('0414_renewal_expires_due_purchases_before_carry.sql');

const OPENING = 'create or replace function public.settle_managed_usage_credits_microusd(';

function settleDefinition(source: string): string {
  const start = source.lastIndexOf(OPENING);
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('\n$$;', start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end + 4);
}

function latestSettleDefinition(): string {
  const latest = fs
    .readdirSync(DIR)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort()
    .reverse()
    .find((name) => read(name).includes(OPENING));
  expect(latest).toBeDefined();
  return settleDefinition(read(latest as string));
}

const DECLARATIONS_START = '  v_request_created_at timestamptz;\n';
const DECLARATIONS_END = '  v_prior_takes bigint[] := array[]::bigint[];\n';
const BLOCK_START = '  -- A release lowers usage on the active account';
const BLOCK_END = '      return;\n    end if;\n  end if;\n\n';

function crossingBlock(definition: string): string {
  const start = definition.indexOf(BLOCK_START);
  expect(start).toBeGreaterThan(-1);
  const end = definition.indexOf(BLOCK_END, start);
  expect(end).toBeGreaterThan(start);
  return definition.slice(start, end + BLOCK_END.length);
}

function withoutThisMigration(definition: string): string {
  const declarationsStart = definition.indexOf(DECLARATIONS_START);
  const declarationsEnd = definition.indexOf(DECLARATIONS_END) + DECLARATIONS_END.length;
  const withoutDeclarations =
    definition.slice(0, declarationsStart) + definition.slice(declarationsEnd);
  return withoutDeclarations.replace(crossingBlock(withoutDeclarations), '');
}

describe('0415 release after renewal restores purchased carry', () => {
  const next = settleDefinition(UP);
  const block = crossingBlock(next);

  it('is a draft until someone approves running it', () => {
    expect(UP).toContain(
      '-- NOT YET APPLIED : draft only, pending explicit approval before running.',
    );
    expect(UP).toMatch(/\nbegin;\n/);
    expect(UP.trimEnd().endsWith('commit;')).toBe(true);
  });

  it('changes nothing in the 0182 settlement but its declarations and the release block', () => {
    expect(withoutThisMigration(next)).toBe(settleDefinition(PRIOR));
  });

  it('runs only for a release larger than what the request settled on the active account', () => {
    expect(block).toMatch(/^ {2}-- [\s\S]*?\n {2}if p_amount_microusd < 0 then\n/);
    expect(block).toContain('greatest(-p_amount_microusd - greatest(v_active_settled, 0), 0)');
    expect(block).toContain('if v_prior_release > 0 then');
    expect(next.indexOf(BLOCK_START)).toBeGreaterThan(
      next.indexOf("'BILLING_PERIOD_LIMIT_REACHED'::text"),
    );
    expect(next.indexOf(BLOCK_START)).toBeLessThan(
      next.indexOf(
        'if p_amount_microusd < 0 and v_account.credits_used_microusd < -p_amount_microusd',
      ),
    );
  });

  it('finds what the request settled per account from its own deduction rows', () => {
    expect(block).toContain("transaction_row.transaction_type = 'deduction'");
    expect(block).toContain('transaction_row.created_at >= v_request_created_at');
    expect(block).toContain("transaction_row.metadata->>'managed_usage_request_id' = v_request_id");
    expect(block).toContain('group by transaction_row.credit_account_id');
    expect(block).toContain('least(settled.settled_microusd, account_row.credits_used_microusd)');
  });

  it('locks the earlier accounts before reading their balances, in id order', () => {
    const lock = block.indexOf('order by account_row.id\n      for update;');
    expect(lock).toBeGreaterThan(-1);
    expect(lock).toBeLessThan(block.indexOf('for v_prior in'));
  });

  it('fails closed with the existing code when the release cannot be placed', () => {
    const refusal = block.indexOf(
      'if v_left > 0 or v_account.credits_used_microusd < v_active_release then',
    );
    expect(refusal).toBeGreaterThan(-1);
    expect(block.indexOf("'INVALID_MANAGED_USAGE_RELEASE'", refusal)).toBeGreaterThan(refusal);
    expect(refusal).toBeLessThan(block.indexOf('update public.token_credits account_row'));
  });

  it('carries forward only the purchased credit the renewal left behind', () => {
    expect(block).toMatch(
      /v_restore := least\(\s*v_prior_account\.top_up_allocated_microusd,\s*greatest\(\s*v_prior_account\.credits_allocated_microusd\s*- v_prior_account\.credits_used_microusd \+ v_take,\s*0\s*\)\s*\)\s*- least\(\s*v_prior_account\.top_up_allocated_microusd,\s*greatest\(\s*v_prior_account\.credits_allocated_microusd\s*- v_prior_account\.credits_used_microusd,\s*0\s*\)\s*\);/,
    );
    expect(block).toContain(
      "transaction_row.metadata->>'from_credit_account_id' = v_prior_account.id::text",
    );
    expect(block).toContain('greatest(v_prior_account.top_up_allocated_microusd - v_carried, 0)');
    expect(RESET).toContain("'from_credit_account_id', v_previous.id");
  });

  it('moves credit as purchased adjustments, never as a reset that restarts the windows', () => {
    const derived = block.slice(0, block.indexOf('-- Written last'));
    expect(derived).toContain("'adjustment',\n            -v_restore,");
    expect(derived).toContain("'adjustment',\n            v_restore,");
    expect(derived).not.toContain("'reset',");
    expect(derived).toContain("transaction_row.transaction_type = 'reset'\n");
    expect(derived).toContain(
      "'release_carry_out:' || p_idempotency_key || ':' || v_prior_account.id::text",
    );
    expect(derived).toContain(
      "'release_carry_in:' || p_idempotency_key || ':' || v_prior_account.id::text",
    );
    expect(derived).toContain(
      'top_up_allocated_microusd = account_row.top_up_allocated_microusd - v_restore',
    );
    expect(derived).toContain(
      'top_up_allocated_microusd = account_row.top_up_allocated_microusd + v_restore',
    );
  });

  it('keeps derived rows out of the overage draw and gives each its own key', () => {
    expect(block).toContain("'type', 'managed_usage_prior_period_release'");
    expect(block).toContain("'type', 'managed_usage_prior_period_carry'");
    expect(block).not.toContain("'type', 'managed_usage_finalization'");
    for (const suffix of [":prior:'", ":carry_out:'", ":carry_in:'"]) {
      expect(block).toContain(`p_idempotency_key || '${suffix} || v_prior_account.id::text`);
    }
    const callerRow = block.indexOf('-v_active_release,\n        public.microusd_to_cents_mirror(');
    expect(callerRow).toBeGreaterThan(block.lastIndexOf("'adjustment'"));
    expect(block.slice(callerRow)).toContain(
      "|| jsonb_build_object('idempotency_key', p_idempotency_key)",
    );
  });

  it('adds no settlement kind to the guard', () => {
    const guard = /if v_operation_type not in \(([\s\S]*?)\)/.exec(next)?.[1] ?? '';
    expect(guard).toBe(/if v_operation_type not in \(([\s\S]*?)\)/.exec(PRIOR)?.[1]);
  });

  it('is still the settlement the chain ends with', () => {
    expect(latestSettleDefinition()).toContain(BLOCK_START);
  });

  it('keeps the settlement invoker-rights and callable by the application role only', () => {
    expect(next).not.toContain('security definer');
    expect(UP).toContain(
      'revoke all on function public.settle_managed_usage_credits_microusd(\n  text, bigint, text, jsonb, text\n) from public;',
    );
    expect(UP).toContain(
      'grant execute on function public.settle_managed_usage_credits_microusd(\n  text, bigint, text, jsonb, text\n) to app_rls;',
    );
    expect(block).not.toContain('post_purchased_credit_adjustment');
  });

  it('restores the settlement exactly as 0182 defined it', () => {
    expect(settleDefinition(DOWN)).toBe(settleDefinition(PRIOR));
    expect(DOWN).toContain('WHAT THIS COSTS');
    expect(DOWN).toContain(`where filename = '${UP_NAME}';`);
    expect(DOWN.trimEnd().endsWith('commit;')).toBe(true);
  });
});
