import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION_DIR = import.meta.dirname;
const MIGRATION =
  fs
    .readdirSync(MIGRATION_DIR)
    .find((name) => name.endsWith('_managed_usage_extra_usage_reservation.sql')) ?? '';
const SOURCE = MIGRATION ? fs.readFileSync(path.join(MIGRATION_DIR, MIGRATION), 'utf8') : '';

describe('reserving a request on extra usage alone', () => {
  it('declines a request its purchased headroom does not cover', () => {
    expect(MIGRATION).not.toBe('');
    expect(SOURCE).toMatch(/or p_estimated_cost_microusd > v_headroom then/);
    expect(SOURCE).toContain("'extra_usage_required'::text");
  });

  it('declines while usage credits are off, whatever bonus credits remain', () => {
    expect(SOURCE).toMatch(
      /bool_or\(subscription_row\.overage_enabled\), false\)\s+into v_usage_credits_on/,
    );
    expect(SOURCE).toMatch(/if not v_usage_credits_on or /);
  });

  it('reads the switch and the headroom under the lock, never from the caller', () => {
    expect(SOURCE).not.toMatch(/p_top_up_headroom_microusd/);
    const lock = SOURCE.indexOf('pg_advisory_xact_lock');
    expect(lock).toBeGreaterThan(-1);
    expect(SOURCE.indexOf('into v_usage_credits_on')).toBeGreaterThan(lock);
    expect(SOURCE.indexOf('prepaid_credit_balances_microusd(p_user_id)')).toBeGreaterThan(lock);
  });

  it('marks an admitted request overage from its first ledger row, whatever the plan windows hold', () => {
    expect(SOURCE).not.toMatch(/p_session_cap_microusd|p_weekly_cap_microusd/);
    expect(SOURCE).toMatch(/is_overage = true/);
    expect(SOURCE).toMatch(/'is_overage', true/);
  });

  it('keeps the tenant check and grants only the app role', () => {
    expect(SOURCE).toContain('public.current_app_user_id()');
    expect(SOURCE).toMatch(/from public;\s*grant execute[\s\S]*to app_rls;/);
  });
});
