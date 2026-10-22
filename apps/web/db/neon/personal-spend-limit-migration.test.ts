import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = import.meta.dirname;
const read = (name: string) => fs.readFileSync(path.join(DIR, name), 'utf8');
const UP = read('0378_personal_spend_limit.sql');
const DOWN = read('down/0378_personal_spend_limit.down.sql');
const PRIOR = read('0298_purchased_credit_lifetime.sql');

function balancesDefinition(source: string): string {
  const start = source.indexOf(
    'create or replace function public.prepaid_credit_balances_microusd(',
  );
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('\n$$;', start);
  return source.slice(start, end + 4);
}

describe('0378 personal spend limit', () => {
  it('lets only the account holder read or write their limit', () => {
    expect(UP).toContain('alter table public.personal_spend_limits force row level security;');
    expect(UP).toMatch(
      /create policy personal_spend_limits_owner\s+on public\.personal_spend_limits\s+for all to app_rls\s+using \(user_id = \(select public\.current_app_user_id\(\)\)\)\s+with check \(user_id = \(select public\.current_app_user_id\(\)\)\)/,
    );
    expect(UP).toContain('check (monthly_cap_microusd > 0)');
  });

  it('caps the overage headroom every admission path reads, and leaves the balances alone', () => {
    const next = balancesDefinition(UP);
    const prior = balancesDefinition(PRIOR);

    expect(next).toContain('from public.personal_spend_limits limit_row');
    expect(next).toContain('public.personal_overage_spent_microusd(p_user_id)');
    expect(next).toMatch(/least\(\s*\(greatest\(drawn\.bonus - drawn\.in_flight, 0\)/);
    expect(next.replace(/\s+spend_cap as \([\s\S]*?\n {2}\),/, '')).toContain(
      prior.slice(0, prior.indexOf('  settled as (')).replace(/\s+$/, ''),
    );
  });

  it('counts unresolved and in-flight overage against the month, not only settled turns', () => {
    const spent = UP.slice(
      UP.indexOf('create or replace function public.personal_overage_spent_microusd'),
      UP.indexOf('revoke all on function public.personal_overage_spent_microusd'),
    );
    for (const status of [
      'reserving',
      'reserved',
      'provider_started',
      'completed',
      'outcome_unknown',
    ]) {
      expect(spent).toContain(`'${status}'`);
    }
    expect(spent).toContain('request_row.is_overage');
    expect(spent).toContain("date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'");
  });

  it('restores the balances function exactly as 0298 defined it before dropping its dependency', () => {
    expect(balancesDefinition(DOWN)).toBe(balancesDefinition(PRIOR));
    expect(DOWN.indexOf('prepaid_credit_balances_microusd')).toBeLessThan(
      DOWN.indexOf('drop function if exists public.personal_overage_spent_microusd'),
    );
    expect(DOWN).toContain("where filename = '0378_personal_spend_limit.sql'");
  });
});
