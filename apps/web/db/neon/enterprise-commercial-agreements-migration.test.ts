import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { ENTERPRISE_PAYMENT_METHOD_POLICIES } from '@/lib/services/enterprise-contracts/payment-methods';
import {
  ACTIVATION_BLOCKED_REASONS,
  COMMERCIAL_AGREEMENT_STATUSES,
  E_SIGNATURE_PROVIDERS,
} from '@/lib/services/enterprise-contracts/types';

const migration = fs.readFileSync(
  path.resolve(import.meta.dirname, '0228_enterprise_commercial_agreements.sql'),
  'utf8',
);
const reversal = fs.readFileSync(
  path.resolve(import.meta.dirname, 'down/0228_enterprise_commercial_agreements.down.sql'),
  'utf8',
);

function acceptedValues(column: string): Set<string> {
  const clause = new RegExp(`${column} = any \\(array\\[([\\s\\S]*?)\\]\\)`).exec(migration)?.[1];
  expect(clause).toBeDefined();
  return new Set([...clause!.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]!));
}

describe('enterprise commercial agreements migration', () => {
  it('accepts exactly the agreement statuses the domain defines', () => {
    expect(acceptedValues('status')).toEqual(new Set(COMMERCIAL_AGREEMENT_STATUSES));
  });

  it('accepts exactly the e-signature providers the domain defines', () => {
    expect(acceptedValues('signature_provider')).toEqual(new Set(E_SIGNATURE_PROVIDERS));
  });

  it('accepts exactly the payment method policies the service defines', () => {
    expect(acceptedValues('payment_method_policy')).toEqual(
      new Set(ENTERPRISE_PAYMENT_METHOD_POLICIES),
    );
  });

  it('accepts exactly the activation blockers the gate can set', () => {
    expect(acceptedValues('activation_blocked_reason')).toEqual(
      new Set(ACTIVATION_BLOCKED_REASONS),
    );
  });

  it('versions agreements and keeps at most one live row per workspace', () => {
    expect(migration).toContain('unique (organization_id, version)');
    expect(migration).toMatch(
      /create unique index if not exists idx_org_commercial_agreements_live\s+on public\.organization_commercial_agreements \(organization_id\)\s+where superseded_at is null/,
    );
  });

  it('will not let a row claim execution without a signature and an order reference', () => {
    expect(migration).toContain(
      "check (status <> 'executed' or (signed_at is not null and order_form_reference is not null))",
    );
  });

  it('states no commercial default the catalog or the Order Form has to own', () => {
    const body = migration.replace(/--[^\n]*/g, '');
    const columnsWithDefaults = [
      'committed_seats',
      'billing_cadence',
      'payment_terms_days',
      'payment_method_policy',
      'tax_exempt_status',
    ].filter((column) => new RegExp(`^\\s*${column}\\s+[^,]*?\\bdefault\\b`, 'm').test(body));
    expect(columnsWithDefaults).toEqual([]);
  });

  it('links the billing contract to the agreement it is billed under', () => {
    expect(migration).toContain('add column if not exists commercial_agreement_id uuid');
    expect(migration).toContain('add column if not exists commercial_agreement_version integer');
    expect(migration).toContain('add column if not exists signed_order_reference text');
    expect(migration).toContain('add column if not exists signed_order_signed_at timestamptz');
    expect(migration).toContain('add column if not exists activation_blocked_reason text');
  });

  it('keeps an agreement readable only by the workspace admins it belongs to', () => {
    expect(migration).toContain(
      'alter table public.organization_commercial_agreements enable row level security',
    );
    expect(migration).toContain(
      'alter table public.organization_commercial_agreements force row level security',
    );
    expect(migration).toContain('create policy organization_commercial_agreements_admin_read');
    expect(migration).not.toMatch(
      /grant\s+[^;]*(insert|update|delete)[^;]*on public\.organization_commercial_agreements to app_rls/,
    );
  });

  it('reverses the table, the contract columns and its ledger row', () => {
    expect(reversal).toContain('drop table if exists public.organization_commercial_agreements');
    expect(reversal).toContain('drop column if exists activation_blocked_reason');
    expect(reversal).toContain('drop column if exists commercial_agreement_id');
    expect(reversal).toContain("where filename = '0228_enterprise_commercial_agreements.sql'");
  });
});
