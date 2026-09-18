import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logger: loggerMocks }));

const recordAuditEvent = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent }));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import {
  assertEnterpriseBillingActivated,
  authorCommercialAgreementVersion,
  compareStripeContractMetadata,
  isExecutedAgreement,
  paymentMethodViolations,
  readCommercialAgreementHistory,
  readCurrentCommercialAgreement,
  readEnterpriseActivationState,
  recordSignedOrder,
  resolveActivationState,
  toStripeContractMetadata,
  type CommercialAgreementSignature,
  type CommercialAgreementTerms,
  type ExecutedCommercialAgreement,
} from '..';

const ORGANIZATION_ID = '00000000-0000-4000-8000-0000000000aa';

function terms(overrides: Partial<CommercialAgreementTerms> = {}): CommercialAgreementTerms {
  return {
    customerLegalEntity: 'Northwind Traders, Inc.',
    committedSeats: 250,
    billingCadence: 'annual',
    contractTermStart: '2026-01-01',
    contractTermEnd: '2026-12-31',
    paymentTermsDays: 30,
    paymentMethodPolicy: 'invoice_ach_wire',
    includedUsageCentsPerPeriod: 500_000,
    committedUsageBlockCents: 1_000_000,
    minimumAnnualSpendCents: 12_000_000,
    overageStripePriceId: 'price_overage_1',
    supportTier: 'enterprise',
    procurementReference: 'PO-4411',
    billingContact: { name: 'Accounts Payable', email: 'ap@northwind.example' },
    procurementContact: { name: 'Dana Buyer', email: 'buyer@northwind.example' },
    taxExemptStatus: 'none',
    ...overrides,
  };
}

function signature(
  overrides: Partial<CommercialAgreementSignature> = {},
): CommercialAgreementSignature {
  return {
    orderFormReference: 'OF-2026-001',
    provider: 'docusign',
    envelopeId: 'env_1',
    signedAt: '2025-12-15T10:00:00.000Z',
    signerName: 'Dana Buyer',
    signerEmail: 'buyer@northwind.example',
    ...overrides,
  };
}

/**
 * A minimal stand-in for the agreement table: it keeps every inserted row, so a
 * test can assert that an amendment added a version instead of replacing one.
 */
function agreementDb() {
  const rows: Record<string, unknown>[] = [];
  let nextId = 1;

  const columnsOf = (sql: string): string[] => {
    const inserted = /insert into public\.organization_commercial_agreements\s*\(([^)]*)\)/.exec(
      sql,
    );
    return (inserted?.[1] ?? '').split(',').map((column) => column.trim());
  };

  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('insert into public.organization_commercial_agreements')) {
      const columns = columnsOf(sql);
      const row: Record<string, unknown> = { id: `agreement_${nextId++}` };
      columns.forEach((column, index) => {
        row[column] = params[index] ?? null;
      });
      row['superseded_at'] = null;
      row['created_at'] = new Date().toISOString();
      rows.push(row);
      return [row];
    }
    if (sql.includes('select max(version)')) {
      const highest = rows.reduce((max, row) => Math.max(max, Number(row['version'])), 0);
      return [{ highest: highest === 0 ? null : highest }];
    }
    if (sql.includes('from public.organization_commercial_agreements')) {
      const live = sql.includes('superseded_at is null');
      const matching = rows
        .filter((row) => row['organization_id'] === params[0])
        .filter((row) => !live || row['superseded_at'] === null)
        .sort((a, b) => Number(b['version']) - Number(a['version']));
      return live ? matching.slice(0, 1) : matching;
    }
    return [];
  });

  const execute = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('update public.organization_commercial_agreements')) {
      for (const row of rows) {
        if (row['organization_id'] === params[0] && row['superseded_at'] === null) {
          row['superseded_at'] = new Date().toISOString();
          if (row['status'] === 'executed') row['status'] = 'superseded';
        }
      }
    }
    return [];
  });

  return { db: { query, execute } as unknown as DatabaseAdapter, rows };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('a commercial agreement is versioned, never overwritten', () => {
  it('an amendment adds version 2 and leaves version 1 intact', async () => {
    const { db, rows } = agreementDb();

    const first = await recordSignedOrder(db, {
      organizationId: ORGANIZATION_ID,
      terms: terms(),
      signature: signature(),
      authoredBy: 'deal-desk',
    });
    const amended = await recordSignedOrder(db, {
      organizationId: ORGANIZATION_ID,
      terms: terms({ committedSeats: 400, minimumAnnualSpendCents: 20_000_000 }),
      signature: signature({ orderFormReference: 'OF-2026-001-A1', envelopeId: 'env_2' }),
      amendmentReason: 'seat expansion',
      authoredBy: 'deal-desk',
    });

    expect(first.version).toBe(1);
    expect(amended.version).toBe(2);
    expect(rows).toHaveLength(2);
    expect(rows[0]!['committed_seats']).toBe(250);
    expect(rows[0]!['status']).toBe('superseded');
    expect(rows[0]!['superseded_at']).not.toBeNull();

    const history = await readCommercialAgreementHistory(db, ORGANIZATION_ID);
    expect(history.map((entry) => entry.terms.committedSeats)).toEqual([400, 250]);
    expect(history[1]!.terms.minimumAnnualSpendCents).toBe(12_000_000);
  });

  it('reads back only the live version as current', async () => {
    const { db } = agreementDb();
    await recordSignedOrder(db, {
      organizationId: ORGANIZATION_ID,
      terms: terms(),
      signature: signature(),
    });
    await recordSignedOrder(db, {
      organizationId: ORGANIZATION_ID,
      terms: terms({ supportTier: 'premium' }),
      signature: signature({ orderFormReference: 'OF-2026-001-A1' }),
    });

    const current = await readCurrentCommercialAgreement(db, ORGANIZATION_ID);
    expect(current?.version).toBe(2);
    expect(current?.terms.supportTier).toBe('premium');
  });

  it('refuses to execute an agreement with no signed order reference', async () => {
    const { db } = agreementDb();
    await expect(
      authorCommercialAgreementVersion(db, {
        organizationId: ORGANIZATION_ID,
        terms: terms(),
        status: 'executed',
      }),
    ).rejects.toThrow(/signed order reference/i);
  });

  it('records a draft with no signature as unexecuted', async () => {
    const { db } = agreementDb();
    const draft = await authorCommercialAgreementVersion(db, {
      organizationId: ORGANIZATION_ID,
      terms: terms(),
    });
    expect(draft.status).toBe('draft');
    expect(isExecutedAgreement(draft)).toBe(false);
  });
});

describe('Stripe metadata is generated from the agreement, not parsed into it', () => {
  async function executed(): Promise<{
    db: DatabaseAdapter;
    agreement: ExecutedCommercialAgreement;
  }> {
    const { db } = agreementDb();
    const agreement = await recordSignedOrder(db, {
      organizationId: ORGANIZATION_ID,
      terms: terms(),
      signature: signature(),
    });
    return { db, agreement };
  }

  it('emits every negotiated term Stripe carries, in Stripe keys', async () => {
    const { agreement } = await executed();
    expect(toStripeContractMetadata(agreement)).toEqual({
      customer_legal_entity: 'Northwind Traders, Inc.',
      committed_seats: '250',
      net_terms_days: '30',
      payment_method_policy: 'invoice_ach_wire',
      included_usage_cents_per_month: '500000',
      committed_usage_block_cents: '1000000',
      minimum_annual_spend_cents: '12000000',
      overage_price_id: 'price_overage_1',
      support_tier: 'enterprise',
      po_number: 'PO-4411',
      billing_contact_name: 'Accounts Payable',
      billing_contact_email: 'ap@northwind.example',
      procurement_contact_name: 'Dana Buyer',
      procurement_contact_email: 'buyer@northwind.example',
      order_form_reference: 'OF-2026-001',
      commercial_agreement_version: '1',
    });
  });

  it('detects a term retyped in the Stripe dashboard instead of trusting it', async () => {
    const { agreement } = await executed();
    const comparison = compareStripeContractMetadata(agreement, {
      ...toStripeContractMetadata(agreement),
      minimum_annual_spend_cents: '1',
      committed_seats: '9000',
    });
    expect(comparison.mismatched).toEqual(['committed_seats', 'minimum_annual_spend_cents']);
    expect(comparison.missing).toEqual([]);
  });

  it('separates terms Stripe has not been given yet from terms that disagree', async () => {
    const { agreement } = await executed();
    const comparison = compareStripeContractMetadata(agreement, { support_tier: 'enterprise' });
    expect(comparison.mismatched).toEqual([]);
    expect(comparison.missing).toContain('minimum_annual_spend_cents');
  });

  it('compares contact emails without case sensitivity', async () => {
    const { agreement } = await executed();
    const comparison = compareStripeContractMetadata(agreement, {
      ...toStripeContractMetadata(agreement),
      billing_contact_email: 'AP@NORTHWIND.EXAMPLE',
    });
    expect(comparison.mismatched).toEqual([]);
  });
});

describe('billing activation requires a signed order', () => {
  it('blocks activation when no agreement has been signed', async () => {
    const { db } = agreementDb();
    const state = await readEnterpriseActivationState(db, ORGANIZATION_ID);
    expect(state.blockedReason).toBe('missing_signed_order');
    expect(state.signedOrderReference).toBeNull();
    await expect(assertEnterpriseBillingActivated(db, ORGANIZATION_ID)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('blocks activation when only a draft exists', async () => {
    const { db } = agreementDb();
    await authorCommercialAgreementVersion(db, {
      organizationId: ORGANIZATION_ID,
      terms: terms(),
    });
    const state = await readEnterpriseActivationState(db, ORGANIZATION_ID);
    expect(state.blockedReason).toBe('missing_signed_order');
  });

  it('allows activation once a signed order is on file and Stripe agrees', async () => {
    const { db } = agreementDb();
    const agreement = await recordSignedOrder(db, {
      organizationId: ORGANIZATION_ID,
      terms: terms(),
      signature: signature(),
    });
    const state = await readEnterpriseActivationState(
      db,
      ORGANIZATION_ID,
      toStripeContractMetadata(agreement),
    );
    expect(state.blockedReason).toBeNull();
    expect(state.signedOrderReference).toBe('OF-2026-001');
    await expect(assertEnterpriseBillingActivated(db, ORGANIZATION_ID)).resolves.toMatchObject({
      version: 1,
    });
  });

  it('blocks activation when Stripe metadata contradicts the signed terms', async () => {
    const { db } = agreementDb();
    const agreement = await recordSignedOrder(db, {
      organizationId: ORGANIZATION_ID,
      terms: terms(),
      signature: signature(),
    });
    const state = resolveActivationState(agreement, {
      ...toStripeContractMetadata(agreement),
      net_terms_days: '120',
    });
    expect(state.blockedReason).toBe('agreement_terms_mismatch');
    expect(state.metadataMismatchedKeys).toEqual(['net_terms_days']);
  });
});

describe('enterprise payment methods are the ones that were agreed', () => {
  it('accepts invoice collection under net terms and refuses an automatic card charge', () => {
    expect(
      paymentMethodViolations('invoice_ach_wire', {
        collectionMethod: 'send_invoice',
        paymentMethodTypes: ['ach_credit_transfer', 'us_bank_account'],
      }),
    ).toEqual([]);
    expect(
      paymentMethodViolations('invoice_ach_wire', {
        collectionMethod: 'charge_automatically',
        paymentMethodTypes: ['card'],
      }),
    ).toEqual(['collection_method:charge_automatically', 'payment_method_type:card']);
  });

  it('allows a card only where the agreement negotiated one', () => {
    expect(
      paymentMethodViolations('invoice_ach_wire_card', {
        collectionMethod: 'send_invoice',
        paymentMethodTypes: ['card'],
      }),
    ).toEqual([]);
  });
});
