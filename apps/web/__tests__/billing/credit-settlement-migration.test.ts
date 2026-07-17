import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'db/neon/0055_durable_credit_settlements.sql'),
  'utf8',
);

describe('durable credit settlement migration', () => {
  it('owns an idempotent durable settlement queue with tenant isolation', () => {
    expect(migration).toMatch(/create table if not exists public\.credit_settlement_jobs/i);
    expect(migration).toMatch(/unique\s*\(user_id,\s*idempotency_key\)/i);
    expect(migration).toMatch(/enable row level security/i);
    expect(migration).toMatch(/force row level security/i);
    expect(migration).toMatch(/with check \(user_id = public\.current_app_user_id\(\)\)/i);
  });

  it('indexes only retryable pending work and claims jobs without worker blocking', () => {
    expect(migration).toMatch(/where status = 'pending'/i);
    expect(migration).toMatch(/for update skip locked/i);
    expect(migration).toMatch(/next_attempt_at/i);
  });

  it('separates retryable SQL failures from terminal decisions', () => {
    expect(migration).toMatch(/retryable_sqlstate/i);
    expect(migration).toMatch(/status = 'terminal'/i);
    expect(migration).toMatch(/RETRY_EXHAUSTED/i);
    expect(migration).toMatch(/IDEMPOTENCY_CONFLICT/i);
  });
});
