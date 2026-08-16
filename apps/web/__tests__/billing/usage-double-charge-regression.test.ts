import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

describe('usage double-charge regression (call-path removal)', () => {
  const completionFiles = [
    'app/api/llm/v1/chat/completions/lib/request-processor.ts',
    'app/api/llm/v1/chat/completions/lib/research-loop.ts',
    'app/api/llm/v1/chat/completions/lib/response-builder.ts',
    'app/api/llm/v1/chat/completions/lib/stream-transform.ts',
  ];

  it('the completion owners do not depend on the legacy quota or reconciliation path', () => {
    for (const f of completionFiles) {
      const src = read(f);
      expect(src, `${f} must not depend on the legacy quota module`).not.toMatch(
        /from\s+['"]@\/lib\/assert-quota['"]/,
      );
      expect(src, `${f} must not call assertQuota`).not.toMatch(/assertQuota\s*\(/);
      expect(src, `${f} must not call reconcileUsage`).not.toMatch(/reconcileUsage\s*\(/);
    }
  });

  it('usage/cost report endpoints do not sum abs(amount_cents) (counts refunds as charges)', () => {
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
    const idx = migration
      .toLowerCase()
      .indexOf('create or replace function public.increment_usage');
    const body = migration.slice(idx).toLowerCase();
    expect(body).not.toMatch(/credits_used_cents\s*=\s*credits_used_cents\s*\+/);
    expect(body).not.toMatch(/insert\s+into\s+public\.credit_transactions/);
    expect(body).toMatch(/no-op|deprecated/);
  });
});
