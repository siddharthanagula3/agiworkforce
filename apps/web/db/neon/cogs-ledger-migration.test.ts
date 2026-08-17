import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.resolve(import.meta.dirname, '0127_cogs_ledger.sql'),
  'utf8',
);
const down = fs.readFileSync(
  path.resolve(import.meta.dirname, 'down/0127_cogs_ledger.down.sql'),
  'utf8',
);

describe('cogs ledger migration', () => {
  it('records provider spend per capability in the unit that capability is bought in', () => {
    expect(migration).toContain('create table if not exists public.provider_cost_events');
    for (const capability of ['chat', 'image', 'video', 'transcription', 'embedding']) {
      expect(migration).toContain(`'${capability}'`);
    }
    for (const unit of ['token', 'image', 'second', 'minute', 'request']) {
      expect(migration).toContain(`'${unit}'`);
    }
    expect(migration).toContain('provider_cost_cents integer not null');
    expect(migration).toContain('billed_cents integer not null');
  });

  it('cannot double count a settlement retry', () => {
    expect(migration).toContain('idx_provider_cost_events_source_ref');
    expect(migration).toContain('idx_cogs_adjustments_source_ref');
  });

  it('carries every margin deduction the ledger has to cover', () => {
    expect(migration).toContain('create table if not exists public.cogs_adjustments');
    for (const kind of [
      'stripe_fee',
      'refund',
      'chargeback',
      'chargeback_reserve',
      'discount',
      'support_adjustment',
      'tax',
    ]) {
      expect(migration).toContain(`'${kind}'`);
    }
  });

  it('aggregates provider spend and adjustments in one place', () => {
    expect(migration).toContain('create or replace function public.cogs_summary');
    expect(migration).toContain('gross_margin_cents bigint');
    expect(migration).toContain('from public.provider_cost_events event');
    expect(migration).toContain('from public.cogs_adjustments entry');
  });

  it('provides a reversible down migration', () => {
    expect(down).toContain('drop function if exists public.cogs_summary');
    expect(down).toContain('drop table if exists public.cogs_adjustments');
    expect(down).toContain('drop table if exists public.provider_cost_events');
    expect(down).toContain("filename = '0127_cogs_ledger.sql'");
  });
});
