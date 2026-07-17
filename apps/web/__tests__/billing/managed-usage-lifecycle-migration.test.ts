import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'db/neon/0056_managed_usage_request_lifecycle.sql'),
  'utf8',
);

describe('managed usage request lifecycle migration', () => {
  it('owns immutable tenant-scoped request identity and an explicit lease', () => {
    expect(migration).toMatch(/create table if not exists public\.managed_usage_requests/i);
    expect(migration).toMatch(/unique\s*\(user_id,\s*idempotency_key\)/i);
    expect(migration).toMatch(/request_hash/i);
    expect(migration).toMatch(/lease_token/i);
    expect(migration).toMatch(/lease_expires_at/i);
    expect(migration).toMatch(/force row level security/i);
    expect(migration).toMatch(/with check \(user_id = public\.current_app_user_id\(\)\)/i);
  });

  it('serializes reserve and finalize races through row locks and the canonical settlement owner', () => {
    expect(migration).toMatch(/create or replace function public\.reserve_managed_usage_request/i);
    expect(migration).toMatch(/create or replace function public\.finalize_managed_usage_request/i);
    expect(migration).toMatch(/for update/i);
    expect(migration).toMatch(/enqueue_credit_settlement/i);
    expect(migration).toMatch(/managed-reserve:/i);
    expect(migration).toMatch(/managed-final:/i);
  });

  it('records provider start, durable success, and client delivery as separate phases', () => {
    expect(migration).toMatch(/mark_managed_usage_provider_started/i);
    expect(migration).toMatch(/provider_started_at/i);
    expect(migration).toMatch(/provider_succeeded_at/i);
    expect(migration).toMatch(/mark_managed_usage_client_delivered/i);
    expect(migration).toMatch(/client_delivered_at/i);
  });

  it('recovers every stale unknown outcome by refunding once without replaying provider work', () => {
    expect(migration).toMatch(/recover_stale_managed_usage_requests/i);
    expect(migration).toMatch(/outcome_unknown/i);
    expect(migration).toMatch(/managed-final:/i);
    expect(migration).toMatch(/-v_request\.estimated_cost_cents/i);
    expect(migration).toMatch(/for update skip locked/i);
    expect(migration).not.toMatch(/adapter|provider.*execute|replay_provider/i);
  });

  it('distinguishes every process-crash boundary without charging an unknown outcome', () => {
    // Before provider start: both an unfinished reservation and a completed
    // reservation are eligible for customer-favoring recovery.
    expect(migration).toMatch(
      /status in \('reserving', 'reserved', 'provider_started'\)[\s\S]*lease_expires_at <= now\(\)/i,
    );
    // After provider start but before durable success: the same recovery path
    // refunds and records whether egress had begun.
    expect(migration).toMatch(/'provider_started', v_request\.provider_started_at is not null/i);
    // After durable provider success: terminal completed rows are outside the
    // stale scan and carry the success timestamp plus actual usage settlement.
    expect(migration).toMatch(/status = v_final_status[\s\S]*provider_succeeded_at/i);
    expect(migration).toMatch(/v_final_status := 'completed'/i);
    // After client delivery: delivery is audit-only; completed remains terminal
    // and cannot be transformed into a refund by the stale worker.
    expect(migration).toMatch(/client_delivered_at = now\(\)/i);
    expect(migration).toMatch(/if v_request\.status <> 'completed'/i);
  });

  it('makes the first terminal callback win across completion, timeout, and disconnect races', () => {
    expect(migration).toMatch(
      /if v_request\.status in \('completed', 'released', 'outcome_unknown'\)[\s\S]*already_finalized/i,
    );
    expect(migration).toMatch(/'managed-final:' \|\| v_request\.id::text/i);
    expect(migration).toMatch(/unique\s*\(user_id,\s*idempotency_key\)/i);
  });

  it('invokes stale recovery from the existing per-minute credit settlement worker', () => {
    expect(migration).toMatch(
      /create or replace function public\.process_credit_settlement_queue/i,
    );
    expect(migration).toMatch(/perform public\.recover_stale_managed_usage_requests/i);
  });
});
