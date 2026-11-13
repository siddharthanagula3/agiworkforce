import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION_DIR = import.meta.dirname;
const MIGRATION =
  fs
    .readdirSync(MIGRATION_DIR)
    .find((name) => name.endsWith('_managed_usage_plan_finishes_crossing_turn.sql')) ?? '';
const SOURCE = MIGRATION ? fs.readFileSync(path.join(MIGRATION_DIR, MIGRATION), 'utf8') : '';
const DOWN = MIGRATION
  ? fs.readFileSync(
      path.join(MIGRATION_DIR, 'down', MIGRATION.replace(/\.sql$/, '.down.sql')),
      'utf8',
    )
  : '';

function functionBody(source: string, name: string): string {
  const start = source.indexOf(`create or replace function public.${name}(`);
  const end = source.indexOf('$$;', start);
  return start === -1 || end === -1 ? '' : source.slice(start, end);
}

const RESERVE = functionBody(SOURCE, 'reserve_managed_usage_request_with_limits_microusd');
const EXTEND = functionBody(SOURCE, 'extend_managed_usage_request_provider_step_microusd');

describe('a turn runs on the plan while its window has allowance left', () => {
  it('replaces both admission functions', () => {
    expect(MIGRATION).not.toBe('');
    expect(RESERVE).not.toBe('');
    expect(EXTEND).not.toBe('');
  });

  it('refuses the plan only once a rolling window has reached its cap, not when the estimate would cross it', () => {
    for (const body of [RESERVE, EXTEND]) {
      expect(body).toMatch(/v_session_used >= p_session_cap_microusd/);
      expect(body).toMatch(/v_weekly_used >= p_weekly_cap_microusd/);
      expect(body).toMatch(/v_flagship_weekly_used >= p_flagship_weekly_cap_microusd/);
      expect(body).not.toMatch(/_used \+ p_estimated_cost_microusd/);
    }
  });

  it('keeps a hard edge on the billing period so a plan overshoot never spends purchased credits', () => {
    for (const body of [RESERVE, EXTEND]) {
      expect(body).toMatch(/- credits\.top_up_allocated_microusd/);
      expect(body).toMatch(/sum\(grant_row\.remaining_microusd\)/);
      expect(body).toMatch(/\+ public\.overage_in_flight_microusd\(p_user_id\)/);
      expect(body).toMatch(/p_estimated_cost_microusd > v_plan_period_remaining/);
    }
    expect(RESERVE).toMatch(
      /p_estimated_cost_microusd > v_plan_period_remaining then\s+if p_estimated_cost_microusd <= v_headroom then\s+v_is_overage := true;/,
    );
  });

  it('reads the plan period and the headroom under the per-user lock', () => {
    for (const body of [RESERVE, EXTEND]) {
      const lock = body.indexOf('pg_advisory_xact_lock');
      expect(lock).toBeGreaterThan(-1);
      expect(body.indexOf('prepaid_credit_balances_microusd(p_user_id)')).toBeGreaterThan(lock);
      expect(body.indexOf('into v_plan_period_remaining')).toBeGreaterThan(lock);
    }
  });

  it('keeps the tenant check, the overage tag the draw trigger reads, and app-role grants', () => {
    expect(RESERVE).toContain('public.current_app_user_id()');
    expect(RESERVE).toMatch(/'is_overage', v_is_overage/);
    expect(SOURCE).toMatch(/from public;\s*grant execute[\s\S]*to app_rls;/);
  });

  it('restores the 0347 rule on the way down and retracts its ledger row', () => {
    expect(DOWN).toMatch(/v_session_used \+ p_estimated_cost_microusd > p_session_cap_microusd/);
    expect(DOWN).not.toMatch(/v_plan_period_remaining/);
    expect(DOWN).toContain(`where filename = '${MIGRATION}'`);
  });
});
