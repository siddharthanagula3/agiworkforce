import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'db/neon/0066_managed_usage_rolling_caps.sql'),
  'utf8',
);

describe('managed usage rolling cap migration', () => {
  it('serializes every new reservation for one tenant before checking spend', () => {
    expect(migration).toMatch(/reserve_managed_usage_request_with_limits/i);
    expect(migration).toMatch(/pg_advisory_xact_lock/i);
    expect(migration).toMatch(/hashtextextended\([^)]*p_user_id/i);
  });

  it('counts settled reservations in the rolling 5h and weekly windows', () => {
    expect(migration).toMatch(/transaction_type\s*=\s*'deduction'/i);
    expect(migration).toMatch(/interval\s+'5 hours'/i);
    expect(migration).toMatch(/interval\s+'7 days'/i);
    expect(migration).toMatch(
      /v_session_used\s*\+\s*p_estimated_cost_cents\s*>\s*p_session_cap_cents/i,
    );
    expect(migration).toMatch(
      /v_weekly_used\s*\+\s*p_estimated_cost_cents\s*>\s*p_weekly_cap_cents/i,
    );
  });

  it('applies the flagship ceiling only to flagship reservations and labels their ledger row', () => {
    expect(migration).toMatch(/metadata->>'is_flagship'\s*=\s*'true'/i);
    expect(migration).toMatch(/p_is_flagship[\s\S]*v_flagship_weekly_used/i);
    expect(migration).toMatch(/jsonb_build_object\('is_flagship',\s*p_is_flagship\)/i);
    expect(migration).toMatch(/before insert on public\.credit_transactions/i);
    expect(migration).toMatch(
      /revoke all on function public\.label_managed_usage_transaction_flagship\(\) from public/i,
    );
  });

  it('delegates idempotent retries without charging or reserving twice', () => {
    expect(migration).toMatch(/if exists\s*\([\s\S]*managed_usage_requests[\s\S]*idempotency_key/i);
    expect(migration).toMatch(/public\.reserve_managed_usage_request\(/i);
  });

  it('reserves later provider steps atomically while the first operation remains covered', () => {
    expect(migration).toMatch(/managed_usage_request_extensions/i);
    expect(migration).toMatch(/initial_provider_operation_key/i);
    expect(migration).toMatch(/extend_managed_usage_request_provider_step/i);
    expect(migration).toMatch(/pg_advisory_xact_lock/i);
    expect(migration).toMatch(/managed-extend:/i);
    expect(migration).toMatch(
      /estimated_cost_cents\s*=\s*request_row\.estimated_cost_cents\s*\+\s*p_estimated_cost_cents/i,
    );
  });

  it('returns every weekly-limit field in the declared reservation result order', () => {
    expect(migration).toMatch(
      /'weekly_limit'::text,\s*'declined'::text,\s*null::text,\s*p_estimated_cost_cents,\s*null::text,\s*'ROLLING_WEEKLY_LIMIT_REACHED'::text/i,
    );
  });

  it('settles managed reservations without the retired calendar-day cap', () => {
    const managedSettlement = migration.match(
      /create or replace function public\.settle_managed_usage_credits\([\s\S]*?\n\$\$;/i,
    )?.[0];

    expect(managedSettlement).toBeDefined();
    expect(managedSettlement).toMatch(
      /credits_allocated_cents\s*-\s*v_account\.credits_used_cents/i,
    );
    expect(managedSettlement).not.toMatch(/calculate_daily_limit/i);
    expect(managedSettlement).not.toMatch(/flagship_used_today_cents/i);
    expect(managedSettlement).toMatch(/managed_usage_request_id/i);
    expect(migration).toMatch(
      /p_metadata->>'type'[\s\S]*from public\.settle_managed_usage_credits\(/i,
    );
    expect(migration).toMatch(/else[\s\S]*from public\.deduct_credits\(/i);
  });
});
