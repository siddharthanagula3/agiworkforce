import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = import.meta.dirname;
const read = (name: string) => fs.readFileSync(path.join(DIR, name), 'utf8');
const UP = read('0392_operator_usage_reset_window.sql');
const DOWN = read('down/0392_operator_usage_reset_window.down.sql');

function definitions(source: string, name: string): number {
  return source.split(`create or replace function public.${name}(`).length - 1;
}

describe('operator usage reset reopens the rolling ceilings', () => {
  it.each([
    'reserve_managed_usage_request_with_limits_microusd',
    'extend_managed_usage_request_provider_step_microusd',
  ])('%s counts a deduction only after the latest reset', (name) => {
    expect(definitions(UP, name)).toBe(1);
    const start = UP.indexOf(`create or replace function public.${name}(`);
    const next = UP.indexOf('create or replace function public.', start + 10);
    const body = next === -1 ? UP.slice(start) : UP.slice(start, next);
    expect(body).toContain("transaction_row.transaction_type = 'deduction'");
    expect(body).toContain("reset_row.transaction_type = 'reset'");
    expect(body).toContain("'-infinity'::timestamptz");
    expect(body).toContain("interval '7 days'");
    expect(body).toContain("interval '5 hours'");
  });

  it('rolls back to the 0347 windows, which do not read a reset', () => {
    expect(definitions(DOWN, 'reserve_managed_usage_request_with_limits_microusd')).toBe(1);
    expect(definitions(DOWN, 'extend_managed_usage_request_provider_step_microusd')).toBe(1);
    expect(DOWN).not.toContain("reset_row.transaction_type = 'reset'");
    expect(DOWN).toContain("where filename = '0392_operator_usage_reset_window.sql'");
  });
});
