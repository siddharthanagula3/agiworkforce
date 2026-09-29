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
    expect(SOURCE).toMatch(/if p_estimated_cost_microusd > v_headroom then/);
    expect(SOURCE).toContain("'extra_usage_required'::text");
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
