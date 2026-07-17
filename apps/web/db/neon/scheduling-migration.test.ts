import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('durable scheduling migration', () => {
  it('adds occurrence idempotency, leases, and tenant RLS without mutating migration 0009', async () => {
    const sql = await readFile(join(process.cwd(), 'db/neon/0057_durable_scheduling.sql'), 'utf8');

    expect(sql).toMatch(/alter table public\.scheduled_task_runs/i);
    expect(sql).toMatch(/idempotency_key/i);
    expect(sql).toMatch(/lease_expires_at/i);
    expect(sql).toMatch(/unique[\s\S]*task_id[\s\S]*idempotency_key/i);
    expect(sql).toMatch(/scheduled_tasks_expires_at_idx/i);
    expect(sql).toMatch(/scheduled_tasks[\s\S]*enable row level security/i);
    expect(sql).toMatch(/scheduled_task_runs[\s\S]*enable row level security/i);
    expect(sql).toMatch(/current_app_user_id\(\)/i);
  });
});
