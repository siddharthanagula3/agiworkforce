import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), 'utf8');
const up = read('0398_stripe_cogs_import_coverage.sql');
const down = read('down/0398_stripe_cogs_import_coverage.down.sql');
const coverage = readFileSync(
  resolve(import.meta.dirname, '../../lib/services/cogs-import-coverage.ts'),
  'utf8',
);

describe('0398 stripe cogs import coverage', () => {
  it('is marked as an unapplied draft inside one transaction', () => {
    expect(up).toContain(
      '-- NOT YET APPLIED : draft only, pending explicit approval before running.',
    );
    expect(up).toMatch(/^begin;$/m);
    expect(up).toMatch(/^commit;$/m);
  });

  it('creates one service-owned coverage row per source with a fenced lease', () => {
    expect(up).toContain('create table if not exists public.stripe_cogs_import_coverage (');
    expect(up).toContain("source text primary key check (source = 'stripe')");
    expect(up).toContain('covered_until timestamptz not null');
    expect(up).toContain('lease_token uuid');
    expect(up).toContain('check ((lease_token is null) = (lease_expires_at is null))');
    expect(up).toContain(
      'alter table public.stripe_cogs_import_coverage enable row level security;',
    );
    expect(up).toContain(
      'alter table public.stripe_cogs_import_coverage force row level security;',
    );
    expect(up).toContain('revoke all on public.stripe_cogs_import_coverage from public, app_rls;');
    expect(up).not.toMatch(/grant\s+[^;]*stripe_cogs_import_coverage[^;]*\bto app_rls/);
    expect(up).not.toMatch(/create policy/);
  });

  it('matches the statements the import claims, advances and releases coverage with', () => {
    expect(coverage).toContain(
      'insert into public.stripe_cogs_import_coverage (source, covered_until)',
    );
    expect(coverage).toContain('on conflict (source) do nothing');
    expect(coverage).toContain(
      'and (lease_expires_at is null or lease_expires_at <= $4::timestamptz)',
    );
    expect(coverage).toContain('set covered_until = $3::timestamptz');
    expect(coverage).toContain('and lease_token = $2::uuid');
  });

  it('rolls back what it adds', () => {
    expect(down).toContain('WHAT THIS COSTS');
    expect(down).toContain('drop table if exists public.stripe_cogs_import_coverage;');
    expect(down).toContain("where filename = '0398_stripe_cogs_import_coverage.sql';");
  });
});
