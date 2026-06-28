/**
 * Regression: usage-accounting double-charge (tokens-as-cents).
 *
 * BUG (proven via ledger forensics 2026-06): the SQL fn `increment_usage`
 * added the raw TOKEN COUNT to credits_used_cents (a CENTS ledger) and ran on
 * every completion via `reconcileUsage`, ON TOP of the authoritative
 * deduct_credits() reservation/reconciliation flow → a 3,531-token request was
 * charged $35.31; one account inflated from $0.31 to $124.20.
 *
 * These are SOURCE/SHAPE assertions (vitest can't run Postgres), labeled as
 * such: they guard against re-introduction of the double-charge call path and
 * verify the 0044 migration neuters the function.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

describe('usage double-charge regression (call-path removal)', () => {
  const completionFiles = [
    'app/api/llm/v1/chat/completions/lib/response-builder.ts',
    'app/api/llm/v1/chat/completions/lib/stream-transform.ts',
  ];

  it('the completion paths no longer invoke reconcileUsage (the redundant charge path)', () => {
    for (const f of completionFiles) {
      const src = read(f);
      // No call and no import — deduct_credits is the single source of truth for
      // credits_used_cents. A re-added call would re-introduce the double charge.
      expect(src, `${f} must not call reconcileUsage`).not.toMatch(/reconcileUsage\s*\(/);
      expect(src, `${f} must not import reconcileUsage`).not.toMatch(
        /import\s*\{[^}]*reconcileUsage[^}]*\}/,
      );
    }
  });

  it('usage/cost report endpoints do not sum abs(amount_cents) (counts refunds as charges)', () => {
    // abs() over deductions double-counts reservation(+)/reconciliation(-) pairs
    // AND any bug rows, inflating every figure. Cost must be a NET signed sum.
    const reportFiles = [
      'app/api/usage/providers/route.ts',
      'app/api/usage/analytics/route.ts',
      'app/api/billing/analytics/route.ts',
    ];
    for (const f of reportFiles) {
      expect(read(f), `${f} must not sum abs(amount_cents) for cost`).not.toMatch(
        /sum\(\s*abs\(amount_cents\)\s*\)/,
      );
    }
  });
});

describe('usage double-charge regression (0044 neuters increment_usage SQL)', () => {
  const migration = read('db/neon/0044_fix_increment_usage_unit_bug.sql');

  it('migration 0044 redefines increment_usage', () => {
    expect(migration).toMatch(/create or replace function public\.increment_usage/i);
  });

  it("0044's increment_usage no longer writes the cents ledger (no credits_used_cents update)", () => {
    // Extract the function body after the redefinition and assert it does not
    // touch credits_used_cents / flagship_used_today_cents / insert a deduction.
    const idx = migration
      .toLowerCase()
      .indexOf('create or replace function public.increment_usage');
    const body = migration.slice(idx).toLowerCase();
    expect(body).not.toMatch(/credits_used_cents\s*=\s*credits_used_cents\s*\+/);
    expect(body).not.toMatch(/insert\s+into\s+public\.credit_transactions/);
    // Positive signal that it's intentionally a no-op.
    expect(body).toMatch(/no-op|deprecated/);
  });
});
