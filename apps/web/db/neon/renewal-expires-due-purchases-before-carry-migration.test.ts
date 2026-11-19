import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = import.meta.dirname;
const read = (name: string) => fs.readFileSync(path.join(DIR, name), 'utf8');
const UP_NAME = '0414_renewal_expires_due_purchases_before_carry.sql';
const UP = read(UP_NAME);
const DOWN = read(`down/${UP_NAME.replace(/\.sql$/, '.down.sql')}`);
const PRIOR = read('0298_purchased_credit_lifetime.sql');

const OPENING = 'create or replace function public.reset_credits_for_period_microusd(';

function resetDefinition(source: string): string {
  const start = source.lastIndexOf(OPENING);
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('\n$$;', start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end + 4);
}

function latestResetDefinition(): string {
  const migrations = fs
    .readdirSync(DIR)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort()
    .reverse();
  const latest = migrations.find((name) => read(name).includes(OPENING));
  expect(latest).toBeDefined();
  return resetDefinition(read(latest as string));
}

const EXPIRY_BLOCK_START = '  if v_previous.id is not null and exists (';
const SOURCE_ACCOUNT_KEY = ",\n      'from_credit_account_id', v_previous.id";

function withoutThisMigration(definition: string): string {
  const start = definition.indexOf(EXPIRY_BLOCK_START);
  const end = definition.indexOf('  end if;\n\n', start) + '  end if;\n\n'.length;
  return (definition.slice(0, start) + definition.slice(end)).replace(SOURCE_ACCOUNT_KEY, '');
}

describe('0414 renewal expires due purchases before carry', () => {
  it('is a draft until someone approves running it', () => {
    expect(UP).toContain(
      '-- NOT YET APPLIED : draft only, pending explicit approval before running.',
    );
    expect(UP.trimEnd().endsWith('commit;')).toBe(true);
    expect(UP).toMatch(/\nbegin;\n/);
  });

  it('changes nothing in the 0298 reset but the expiry block and the source account key', () => {
    expect(withoutThisMigration(resetDefinition(UP))).toBe(resetDefinition(PRIOR));
  });

  it('expires the previous account due lots after locking it and before computing the carry', () => {
    const next = resetDefinition(UP);
    const locked = next.indexOf('limit 1\n  for update;');
    const expired = next.indexOf(
      'perform public.reconcile_expiring_credit_purchases(p_user_id, v_previous.id);',
    );
    const reread = next.indexOf('where account_row.id = v_previous.id;', expired);
    const carried = next.indexOf('v_carried_top_up_microusd := least(');

    expect(locked).toBeGreaterThan(-1);
    expect(expired).toBeGreaterThan(locked);
    expect(reread).toBeGreaterThan(expired);
    expect(carried).toBeGreaterThan(reread);
  });

  it('runs the expiry only for a live lot already past its expiry', () => {
    const block = resetDefinition(UP).slice(
      resetDefinition(UP).indexOf(EXPIRY_BLOCK_START),
      resetDefinition(UP).indexOf('perform public.reconcile_expiring_credit_purchases'),
    );
    expect(block).toContain('from public.expiring_credit_purchases purchase_row');
    expect(block).toContain('purchase_row.user_id = p_user_id');
    expect(block).toContain('purchase_row.expired_at is null');
    expect(block).toContain('purchase_row.remaining_microusd > 0');
    expect(block).toContain('purchase_row.expires_at <= now()');
  });

  it('records which account the carry came from on the reset row', () => {
    expect(resetDefinition(UP)).toContain("'from_credit_account_id', v_previous.id");
  });

  it('is still the reset the chain ends with', () => {
    const latest = latestResetDefinition();
    expect(latest.indexOf('perform public.reconcile_expiring_credit_purchases')).toBeLessThan(
      latest.indexOf('v_carried_top_up_microusd := least('),
    );
  });

  it('keeps the reset callable by the application role only', () => {
    expect(UP).toContain(
      'revoke all on function public.reset_credits_for_period_microusd(\n  text, uuid, timestamptz, timestamptz, bigint\n) from public;',
    );
    expect(UP).toContain(
      'grant execute on function public.reset_credits_for_period_microusd(\n  text, uuid, timestamptz, timestamptz, bigint\n) to app_rls;',
    );
    expect(resetDefinition(UP)).not.toContain('security definer');
  });

  it('restores the reset exactly as 0298 defined it', () => {
    expect(resetDefinition(DOWN)).toBe(resetDefinition(PRIOR));
    expect(DOWN).toContain('WHAT THIS COSTS');
    expect(DOWN).toContain(`where filename = '${UP_NAME}';`);
    expect(DOWN.trimEnd().endsWith('commit;')).toBe(true);
  });
});
