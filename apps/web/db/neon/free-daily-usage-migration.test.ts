import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('free daily usage migration', () => {
  it('adds a precise private daily-cost ledger and durable reservation lifecycle', async () => {
    const sql = await readFile(
      join(process.cwd(), 'db/neon/0065_free_daily_usage_budget.sql'),
      'utf8',
    );

    expect(sql).toMatch(/add column if not exists daily_cost_microusd bigint/i);
    expect(sql).toMatch(/add column if not exists daily_reserved_microusd bigint/i);
    expect(sql).toMatch(/add column if not exists daily_started_at timestamptz/i);
    expect(sql).toMatch(/create table if not exists public\.free_daily_usage_reservations/i);
    expect(sql).toMatch(/unique\s*\(user_id, request_id\)/i);
    expect(sql).toMatch(/reserved_microusd bigint not null/i);
    expect(sql).toMatch(/settled_at timestamptz/i);
    expect(sql).toMatch(/check \(outcome is null or outcome = any/i);
  });

  it('indexes the reservation ledger for rolling Free usage windows', async () => {
    const sql = await readFile(
      join(process.cwd(), 'db/neon/0067_free_rolling_usage_windows.sql'),
      'utf8',
    );

    expect(sql).toMatch(/create index if not exists idx_free_usage_reservations_user_created/i);
    expect(sql).toMatch(/on public\.free_daily_usage_reservations \(user_id, created_at desc\)/i);
    expect(sql).toMatch(/include \(actual_cost_microusd, reserved_microusd, settled_at\)/i);
  });
});
