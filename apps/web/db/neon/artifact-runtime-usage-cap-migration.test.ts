import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = '0390_artifact_runtime_usage_cap.sql';

const migration = fs.readFileSync(path.resolve(import.meta.dirname, MIGRATION), 'utf8');
const reversal = fs.readFileSync(
  path.resolve(import.meta.dirname, 'down', MIGRATION.replace(/\.sql$/, '.down.sql')),
  'utf8',
);

function functionBody(): string {
  const start = migration.indexOf(
    'create or replace function public.reserve_artifact_runtime_usage_microusd(',
  );
  const end = migration.indexOf('$$;', start);
  expect(start).toBeGreaterThan(-1);
  return migration.slice(start, end);
}

describe('artifact runtime usage cap migration', () => {
  it('is marked as not yet applied, like every other unapplied draft', () => {
    expect(migration).toContain('NOT YET APPLIED');
  });

  it('records which app made a request, in one checked spelling', () => {
    expect(migration).toContain('add column if not exists artifact_subject text');
    expect(migration).toContain(
      "'^(published|owned):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'",
    );
    expect(migration).toContain(
      'on public.managed_usage_requests (user_id, artifact_subject, created_at desc)',
    );
  });

  it('counts and refuses under the same per-user lock the plan ceilings take', () => {
    const body = functionBody();
    const lock = body.indexOf("hashtextextended('managed-usage:' || p_user_id, 0)");
    const count = body.indexOf('request_row.artifact_subject = p_artifact_subject');
    const delegate = body.indexOf('reserve_managed_usage_request_with_limits_microusd(');
    expect(lock).toBeGreaterThan(-1);
    expect(count).toBeGreaterThan(lock);
    expect(delegate).toBeGreaterThan(count);
    expect(body).toContain("'ARTIFACT_RUNTIME_LIMIT_REACHED'");
    expect(body).toContain('v_calls >= p_artifact_max_calls');
    expect(body).toContain('v_spent + p_estimated_cost_microusd > p_artifact_cap_microusd');
  });

  it('refuses a caller reserving for anyone but themselves', () => {
    expect(functionBody()).toContain('p_user_id is distinct from public.current_app_user_id()');
    expect(functionBody()).not.toContain('security definer');
  });

  it('does not count a replayed idempotency key twice', () => {
    const body = functionBody();
    expect(body.indexOf('request_row.idempotency_key = p_idempotency_key')).toBeLessThan(
      body.indexOf('v_calls >= p_artifact_max_calls'),
    );
  });

  it('is reachable only by the scoped app role', () => {
    expect(migration).toMatch(
      /revoke all on function public\.reserve_artifact_runtime_usage_microusd\([\s\S]*?\) from public;/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.reserve_artifact_runtime_usage_microusd\([\s\S]*?\) to app_rls;/,
    );
  });

  it('reverses the function, the index and the column', () => {
    expect(reversal).toContain(
      'drop function if exists public.reserve_artifact_runtime_usage_microusd(',
    );
    expect(reversal).toContain(
      'drop index if exists public.idx_managed_usage_requests_artifact_subject',
    );
    expect(reversal).toContain('drop column if exists artifact_subject');
    expect(reversal).toContain("where filename = '0390_artifact_runtime_usage_cap.sql'");
  });
});
