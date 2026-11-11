import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), 'utf8');
const up = read('0400_billing_collection_owner_notice_and_review_cursor.sql');
const down = read('down/0400_billing_collection_owner_notice_and_review_cursor.down.sql');
const sweep = readFileSync(
  resolve(import.meta.dirname, '../../app/api/cron/enforce-billing-collection/route.ts'),
  'utf8',
);

const COLUMNS = [
  'owner_notice_pending_stage text',
  'owner_notice_pending_since timestamptz',
  'owner_notice_email_delivered_at timestamptz',
  'owner_notice_in_app_recorded_at timestamptz',
  'collection_reviewed_at timestamptz',
];

describe('0400 billing collection owner notice and review cursor', () => {
  it('is marked as an unapplied draft inside one transaction', () => {
    expect(up).toContain(
      '-- NOT YET APPLIED : draft only, pending explicit approval before running.',
    );
    expect(up).toMatch(/^begin;$/m);
    expect(up).toMatch(/^commit;$/m);
  });

  it('adds nullable columns only, so existing contracts need no rewrite or backfill', () => {
    expect(up).toContain('alter table public.organization_billing_contracts');
    for (const column of COLUMNS) {
      expect(up).toContain(`add column if not exists ${column}`);
      expect(up).not.toMatch(new RegExp(`${column}\\s+not null`));
    }
    expect(up).not.toMatch(/^\s*update public\.organization_billing_contracts/m);
  });

  it('constrains the owed notice to an owner-notice stage with its entry time', () => {
    expect(up).toContain(
      "or owner_notice_pending_stage in ('past_due_30', 'past_due_60', 'read_only')",
    );
    expect(up).toContain(
      'check ((owner_notice_pending_stage is null) = (owner_notice_pending_since is null))',
    );
    expect(up).toContain(
      'drop constraint if exists organization_billing_contracts_owner_notice_stage;',
    );
    expect(up).toContain(
      'drop constraint if exists organization_billing_contracts_owner_notice_complete;',
    );
  });

  it('indexes the review cursor the sweep orders by', () => {
    expect(up).toContain(
      'create index if not exists idx_organization_billing_contracts_collection_review',
    );
    expect(up).toContain('(collection_reviewed_at asc nulls first)');
    expect(sweep).toContain('order by c.collection_reviewed_at asc nulls first,');
    expect(sweep).toContain('set collection_reviewed_at = $2::timestamptz');
  });

  it('is written by the sweep in the same statement that changes the stage', () => {
    expect(sweep).toMatch(
      /set collection_stage = \$2,[\s\S]*?owner_notice_pending_stage = \$4::text,[\s\S]*?owner_notice_in_app_recorded_at = null/,
    );
    expect(sweep).toContain('and owner_notice_pending_since = $3::timestamptz');
  });

  it('rolls back what it adds', () => {
    expect(down).toContain('WHAT THIS COSTS');
    expect(down).toContain(
      'drop index if exists public.idx_organization_billing_contracts_collection_review;',
    );
    for (const column of COLUMNS) {
      expect(down).toContain(`drop column if exists ${column.split(' ')[0]}`);
    }
    expect(down).toContain(
      "where filename = '0400_billing_collection_owner_notice_and_review_cursor.sql';",
    );
  });
});
