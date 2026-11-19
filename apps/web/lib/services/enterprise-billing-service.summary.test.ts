import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { readEnterpriseContractSummary } from './enterprise-billing-service';

const ORGANIZATION_ID = '11111111-2222-3333-4444-555555555555';

describe('readEnterpriseContractSummary', () => {
  it('reads contract terms as calendar dates, not driver-zone instants', async () => {
    const statements: string[] = [];
    const db = {
      query: vi.fn(async (sql: string) => {
        statements.push(sql);
        if (sql.includes('from public.organization_billing_contracts')) {
          return [
            {
              customer_legal_entity: 'Acme Corp Ltd.',
              procurement_reference: null,
              contract_term_start: '2026-01-01',
              contract_term_end: '2026-12-31',
              billing_cadence: 'annual',
              committed_seats: 250,
              support_tier: 'platinum',
              payment_terms_days: 45,
              tax_exempt_status: 'none',
              collection_stage: 'current',
              ended_at: null,
              billing_contact_name: null,
              billing_contact_email: null,
              procurement_contact_name: null,
              procurement_contact_email: null,
              signed_order_reference: null,
              signed_order_signed_at: null,
              commercial_agreement_version: null,
              activation_blocked_reason: null,
            },
          ];
        }
        return [];
      }),
    } as unknown as DatabaseAdapter;

    const summary = await readEnterpriseContractSummary(db, ORGANIZATION_ID);

    const contractSelect = statements.find((sql) =>
      sql.includes('from public.organization_billing_contracts'),
    );
    expect(contractSelect).toContain('contract_term_start::text as contract_term_start');
    expect(contractSelect).toContain('contract_term_end::text as contract_term_end');
    expect(summary.contract?.termStart).toBe('2026-01-01');
    expect(summary.contract?.termEnd).toBe('2026-12-31');
    expect(summary.contract?.overageWriteOff).toBeNull();
  });

  it('carries the recorded overage write-off of an ended contract in its invoice currency', async () => {
    const statements: string[] = [];
    const db = {
      query: vi.fn(async (sql: string) => {
        statements.push(sql);
        if (sql.includes('from public.organization_billing_contracts')) {
          return [
            {
              contract_term_start: null,
              contract_term_end: null,
              billing_cadence: 'annual',
              committed_seats: 10,
              tax_exempt_status: 'none',
              collection_stage: 'current',
              ended_at: new Date('2026-06-10T12:00:00.000Z'),
              overage_closeout_at: new Date('2026-06-15T05:00:00.000Z'),
              overage_closeout_reason: 'contract_ended',
              overage_written_off_cents: '4000',
            },
          ];
        }
        if (sql.includes('from public.organization_billing_invoices')) {
          return [
            {
              invoice_number: 'INV-1',
              status: 'paid',
              amount_due_cents: 100,
              amount_paid_cents: 100,
              currency: 'inr',
              period_start: null,
              period_end: null,
              due_at: null,
              paid_at: null,
              hosted_invoice_url: null,
              invoice_pdf_url: null,
            },
          ];
        }
        return [];
      }),
    } as unknown as DatabaseAdapter;

    const summary = await readEnterpriseContractSummary(db, ORGANIZATION_ID);

    expect(
      statements.find((sql) => sql.includes('from public.organization_billing_contracts')),
    ).toContain('overage_closeout_at, overage_closeout_reason, overage_written_off_cents');
    expect(summary.contract?.overageWriteOff).toEqual({
      reason: 'contract_ended',
      writtenOffCents: 4_000,
      currency: 'inr',
      recordedAt: '2026-06-15T05:00:00.000Z',
    });
  });
});

type ImportedModule1 = typeof import('@/lib/logger');
type ImportedModule0 = typeof import('@/lib/security-audit');
