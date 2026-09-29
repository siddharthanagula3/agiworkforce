import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = import.meta.dirname;
const read = (name: string) => fs.readFileSync(path.join(DIR, name), 'utf8');
const UP = read('0347_managed_usage_headroom_under_lock.sql');
const DOWN = read('down/0347_managed_usage_headroom_under_lock.down.sql');
const FUNCTIONS = [
  [
    'reserve_managed_usage_request_with_limits_microusd',
    '0281_managed_usage_overage_classification.sql',
  ],
  [
    'extend_managed_usage_request_provider_step_microusd',
    '0305_managed_usage_extension_overage.sql',
  ],
] as const;

function definition(source: string, name: string): string {
  const start = source.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const comment = source.indexOf(`comment on function public.${name}(`, start);
  return source.slice(start, source.indexOf(';\n', source.indexOf(' is\n', comment)) + 2);
}

describe('reservations read purchased headroom under the reservation lock', () => {
  it.each(FUNCTIONS)('%s reads headroom after the lock and ignores the caller', (name) => {
    const body = definition(UP, name);
    const lock = body.indexOf(
      "pg_advisory_xact_lock(\n    hashtextextended('managed-usage:' || p_user_id, 0)",
    );
    const headroom = body.indexOf('public.prepaid_credit_balances_microusd(p_user_id)');
    expect(lock).toBeGreaterThan(-1);
    expect(headroom).toBeGreaterThan(lock);
    expect(body.indexOf('v_headroom :=')).toBeGreaterThan(lock);
    expect(body).not.toMatch(/coalesce\(p_top_up_headroom_microusd/);
    expect(body).toContain('p_top_up_headroom_microusd bigint default 0');
  });

  it.each(FUNCTIONS)('the down migration restores %s exactly as %s defined it', (name, source) => {
    expect(definition(DOWN, name)).toBe(definition(read(source), name));
  });

  it('never drops a function a deployed caller still resolves', () => {
    expect(UP).not.toMatch(/drop function/i);
    expect(DOWN).not.toMatch(/drop function/i);
    expect(DOWN).toContain("where filename = '0347_managed_usage_headroom_under_lock.sql'");
  });
});
