import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = '0180_provider_cost_events_customer_and_cogs_split.sql';

const migration = fs.readFileSync(path.resolve(import.meta.dirname, MIGRATION), 'utf8');
const down = fs.readFileSync(
  path.resolve(import.meta.dirname, 'down', MIGRATION.replace(/\.sql$/, '.down.sql')),
  'utf8',
);

const ADDED_COLUMNS = [
  'customer_canonical_microusd',
  'customer_credits',
  'provider_estimated_cost_microusd',
  'provider_reported_cost_microusd',
  'reconciliation_status',
  'feature',
  'route_id',
  'surface',
  'input_tokens',
  'cached_tokens',
  'output_tokens',
  'reasoning_tokens',
] as const;

describe('0180 cogs customer and provider split', () => {
  it('is a draft until someone approves running it', () => {
    expect(migration).toContain('NOT YET APPLIED');
  });

  it('adds every column nullable so no historical row is invented', () => {
    for (const column of ADDED_COLUMNS) {
      expect(migration).toContain(`add column if not exists ${column}`);
    }
    expect(migration).not.toMatch(
      /add column if not exists customer_canonical_microusd[^,]*not null/,
    );
  });

  it('constrains the reconciliation states the ledger recognises', () => {
    for (const status of ['estimated', 'provider_reported', 'reconciled']) {
      expect(migration).toContain(`'${status}'`);
    }
    expect(migration).toContain("default 'estimated'");
  });

  it('backfills the customer charge from the only place it was ever recorded', () => {
    expect(migration).toContain("metadata ->> 'retailCostCents'");
    expect(migration).toContain('customer_canonical_microusd = ');
    expect(migration).toContain("~ '^[0-9]+$'");
  });

  it('says on the table itself that billed_cents is not the customer charge', () => {
    expect(migration).toContain('comment on column public.provider_cost_events.billed_cents');
    expect(migration).toMatch(/billed_cents is\s*\n?\s*'HISTORICAL SHAPE/);
  });

  it('indexes the per-user search-call count the plan bounds are read from', () => {
    expect(migration).toContain('idx_provider_cost_events_user_feature_occurred');
    expect(migration).toContain('(user_id, feature, occurred_at desc)');
  });

  it('provides a reversible down migration that names what it costs', () => {
    expect(down).toContain('WHAT THIS COSTS');
    for (const column of ADDED_COLUMNS) {
      expect(down).toContain(`drop column if exists ${column}`);
    }
    expect(down).toContain(`filename = '${MIGRATION}'`);
  });
});
