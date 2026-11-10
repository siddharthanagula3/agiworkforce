import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: vi.fn().mockResolvedValue(undefined) }));

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
  });
});
