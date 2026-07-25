import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'db/neon/0070_managed_usage_cap_semantics.sql'),
  'utf8',
);

/**
 * Executable SQL only. The header documents the old `> 0` guards it replaces,
 * so a whole-file assertion would match the very thing being removed.
 */
const statements = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

/**
 * GOV-1: 0066 enforced each rolling ceiling only when the cap was strictly
 * `> 0`, so a cap of 0 meant UNLIMITED — the exact inversion of fail-closed.
 * 0070 replaces every guard with `is not null`, making "declared uncapped"
 * (NULL) and "ceiling of zero" (0, deny) two different facts.
 */
describe('managed usage cap semantics migration', () => {
  it('recreates both cap-enforcing functions', () => {
    expect(migration).toMatch(
      /create or replace function public\.reserve_managed_usage_request_with_limits\(/i,
    );
    expect(migration).toMatch(
      /create or replace function public\.extend_managed_usage_request_provider_step\(/i,
    );
  });

  it('never treats a zero ceiling as unlimited', () => {
    expect(statements).not.toMatch(/p_session_cap_cents\s*>\s*0/i);
    expect(statements).not.toMatch(/p_weekly_cap_cents\s*>\s*0/i);
    expect(statements).not.toMatch(/p_flagship_weekly_cap_cents\s*>\s*0/i);
  });

  it('applies each ceiling whenever one is configured at all', () => {
    expect(statements.match(/if p_session_cap_cents is not null/gi)).toHaveLength(2);
    expect(statements.match(/if p_weekly_cap_cents is not null/gi)).toHaveLength(2);
    expect(statements.match(/and p_flagship_weekly_cap_cents is not null/gi)).toHaveLength(2);
  });

  it('accepts NULL as the declared-uncapped signal instead of rejecting it', () => {
    expect(statements).not.toMatch(/or p_session_cap_cents is null or p_session_cap_cents < 0/i);
    expect(migration).toMatch(/\(p_session_cap_cents is not null and p_session_cap_cents < 0\)/i);
    expect(migration).toMatch(/\(p_weekly_cap_cents is not null and p_weekly_cap_cents < 0\)/i);
    expect(migration).toMatch(
      /\(p_flagship_weekly_cap_cents is not null and p_flagship_weekly_cap_cents < 0\)/i,
    );
  });

  it('keeps the 0066 serialization, idempotency, and settlement behaviour', () => {
    expect(migration).toMatch(/pg_advisory_xact_lock/i);
    expect(migration).toMatch(/public\.reserve_managed_usage_request\(/i);
    expect(migration).toMatch(/managed_usage_request_extensions/i);
    expect(migration).toMatch(/transaction_type\s*=\s*'deduction'/i);
    expect(migration).toMatch(/interval\s+'5 hours'/i);
    expect(migration).toMatch(/interval\s+'7 days'/i);
  });

  it('re-applies the least-privilege grants for both functions', () => {
    expect(migration).toMatch(
      /revoke all on function public\.reserve_managed_usage_request_with_limits\([\s\S]{0,120}\) from public/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.extend_managed_usage_request_provider_step\([\s\S]{0,120}\) to app_rls/i,
    );
  });
});
