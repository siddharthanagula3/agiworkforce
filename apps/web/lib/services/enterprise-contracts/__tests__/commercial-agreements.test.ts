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
  agreementLifecycleState,
  assertEnterpriseBillingActivated,
  auditActivationState,
  authorCommercialAgreementVersion,
  compareStripeContractMetadata,
  isExecutedAgreement,
  paymentMethodViolations,
  readCommercialAgreementHistory,
  readCurrentCommercialAgreement,
  readEnterpriseActivationState,
  recordSignedOrder,
  recordSignedOrderFromEnvelope,
  resolveActivationState,
  terminateCommercialAgreement,
  toStripeContractMetadata,
  type CommercialAgreementSignature,
  type CommercialAgreementTerms,
  type ExecutedCommercialAgreement,
} from '..';

const ORGANIZATION_ID = '00000000-0000-4000-8000-0000000000aa';
const IN_TERM = '2026-06-01';
const AFTER_TERM = '2027-01-02';

function terms(overrides: Partial<CommercialAgreementTerms> = {}): CommercialAgreementTerms {
  return {
    customerLegalEntity: 'Northwind Traders, Inc.',
    committedSeats: 250,
    seatUnitPriceCents: 120_000,
    billingCadence: 'annual',
    billingCurrency: 'usd',
    contractTermStart: '2026-01-01',
    contractTermEnd: '2026-12-31',
    expiryGraceDays: 0,
    paymentTermsDays: 30,
    paymentMethodPolicy: 'invoice_ach_wire',
    purchaseOrderRequired: true,
    invoiceRecipientEmails: ['ap@northwind.example'],
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
      row['terminated_at'] = null;
      row['termination_reason'] = null;
      row['created_at'] = new Date().toISOString();
      rows.push(row);
      return [row];
    }
    if (sql.includes('select max(version)')) {
      const highest = rows.reduce((max, row) => Math.max(max, Number(row['version'])), 0);
      return [{ highest: highest === 0 ? null : highest }];
    }
    if (sql.includes('update public.organization_commercial_agreements')) {
      const target = rows.find(
        (row) =>
          row['id'] === params[0] &&
          row['organization_id'] === params[1] &&
          row['terminated_at'] === null,
      );
      if (!target) return [];
      target['terminated_at'] = params[2] ?? new Date().toISOString();
      target['termination_reason'] = params[3];
      return [target];
    }
    if (sql.includes('from public.organization_commercial_agreements')) {
      const byEnvelope = sql.includes('signature_envelope_id = $2');
      const live = sql.includes('superseded_at is null');
      const matching = rows
        .filter((row) => row['organization_id'] === params[0])
        .filter((row) => !byEnvelope || row['signature_envelope_id'] === params[1])
        .filter((row) => !live || row['superseded_at'] === null)
        .sort((a, b) => Number(b['version']) - Number(a['version']));
      return live || byEnvelope ? matching.slice(0, 1) : matching;
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

  const adapter = {
    query,
    execute,
    transaction: async <T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> => fn(adapter),
  } as unknown as DatabaseAdapter;

  return { db: adapter, rows };
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
      event: 'amend',
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
      signature: signature({ orderFormReference: 'OF-2026-001-A1', envelopeId: 'env_2' }),
      event: 'amend',
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
    const state = await readEnterpriseActivationState(db, ORGANIZATION_ID, null, IN_TERM);
    expect(state.blockedReason).toBe('missing_signed_order');
    expect(state.signedOrderReference).toBeNull();
    await expect(
      assertEnterpriseBillingActivated(db, ORGANIZATION_ID, IN_TERM),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('blocks activation when only a draft exists', async () => {
    const { db } = agreementDb();
    await authorCommercialAgreementVersion(db, {
      organizationId: ORGANIZATION_ID,
      terms: terms(),
    });
    const state = await readEnterpriseActivationState(db, ORGANIZATION_ID, null, IN_TERM);
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
      IN_TERM,
    );
    expect(state.blockedReason).toBeNull();
    expect(state.signedOrderReference).toBe('OF-2026-001');
    await expect(
      assertEnterpriseBillingActivated(db, ORGANIZATION_ID, IN_TERM),
    ).resolves.toMatchObject({ version: 1 });
  });

  it('blocks activation when Stripe metadata contradicts the signed terms', async () => {
    const { db } = agreementDb();
    const agreement = await recordSignedOrder(db, {
      organizationId: ORGANIZATION_ID,
      terms: terms(),
      signature: signature(),
    });
    const state = resolveActivationState(
      agreement,
      { ...toStripeContractMetadata(agreement), net_terms_days: '120' },
      IN_TERM,
    );
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

describe('a new version has to say what kind of change it is', () => {
  it('refuses a second executed version that is neither an amendment nor a renewal', async () => {
    const { db, rows } = agreementDb();
    await recordSignedOrder(db, {
      organizationId: ORGANIZATION_ID,
      terms: terms(),
      signature: signature(),
    });
    await expect(
      recordSignedOrder(db, {
        organizationId: ORGANIZATION_ID,
        terms: terms({ committedSeats: 900 }),
        signature: signature({ orderFormReference: 'OF-2026-002', envelopeId: 'env_9' }),
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(rows).toHaveLength(1);
    expect(rows[0]!['superseded_at']).toBeNull();
  });

  it('records which version an amendment replaced and what it was for', async () => {
    const { db } = agreementDb();
    await recordSignedOrder(db, {
      organizationId: ORGANIZATION_ID,
      terms: terms(),
      signature: signature(),
    });
    const renewed = await recordSignedOrder(db, {
      organizationId: ORGANIZATION_ID,
      terms: terms({ contractTermStart: '2027-01-01', contractTermEnd: '2027-12-31' }),
      signature: signature({ orderFormReference: 'OF-2027-001', envelopeId: 'env_3' }),
      event: 'renew',
    });
    expect(renewed).toMatchObject({ version: 2, changeKind: 'renewal', supersedesVersion: 1 });

    const history = await readCommercialAgreementHistory(db, ORGANIZATION_ID);
    expect(history[1]).toMatchObject({
      version: 1,
      changeKind: 'initial',
      status: 'superseded',
    });
    expect(history[1]!.terms.contractTermStart).toBe('2026-01-01');
    expect(history[1]!.signature?.orderFormReference).toBe('OF-2026-001');
  });

  it('refuses to amend an agreement that has no version yet', async () => {
    const { db } = agreementDb();
    await expect(
      recordSignedOrder(db, {
        organizationId: ORGANIZATION_ID,
        terms: terms(),
        signature: signature(),
        event: 'amend',
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('one signature signs one version', () => {
  it('returns the version it already authored when the envelope arrives twice', async () => {
    const { db, rows } = agreementDb();
    const envelope = {
      provider: 'docusign' as const,
      envelopeId: 'env_dup',
      status: 'completed' as const,
      completedAt: '2025-12-15T10:00:00.000Z',
      signerName: 'Dana Buyer',
      signerEmail: 'buyer@northwind.example',
    };
    const first = await recordSignedOrderFromEnvelope(db, {
      organizationId: ORGANIZATION_ID,
      orderFormReference: 'OF-2026-001',
      terms: terms(),
      envelope,
    });
    const second = await recordSignedOrderFromEnvelope(db, {
      organizationId: ORGANIZATION_ID,
      orderFormReference: 'OF-2026-001',
      terms: terms(),
      envelope,
    });

    expect(second.id).toBe(first.id);
    expect(second.version).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]!['superseded_at']).toBeNull();
  });

  it('will not record an envelope that has not been signed', async () => {
    const { db } = agreementDb();
    await expect(
      recordSignedOrderFromEnvelope(db, {
        organizationId: ORGANIZATION_ID,
        orderFormReference: 'OF-2026-001',
        terms: terms(),
        envelope: {
          provider: 'docusign',
          envelopeId: 'env_open',
          status: 'sent',
          completedAt: null,
          signerName: null,
          signerEmail: null,
        },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('an agreement stops granting when its term ends', () => {
  async function executedAgreement(overrides: Partial<CommercialAgreementTerms> = {}) {
    const { db, rows } = agreementDb();
    const agreement = await recordSignedOrder(db, {
      organizationId: ORGANIZATION_ID,
      terms: terms(overrides),
      signature: signature(),
    });
    return { db, rows, agreement };
  }

  it('refuses activation the day after the term ends, with no sweep having run', async () => {
    const { db } = await executedAgreement();
    await expect(
      assertEnterpriseBillingActivated(db, ORGANIZATION_ID, AFTER_TERM),
    ).rejects.toMatchObject({ statusCode: 403 });
    const state = await readEnterpriseActivationState(db, ORGANIZATION_ID, null, AFTER_TERM);
    expect(state.force).toMatchObject({ inForce: false, reason: 'expired' });
    expect(state.agreement?.status).toBe('executed');
  });

  it('keeps granting inside a negotiated grace and stops the day after it', async () => {
    const { db } = await executedAgreement({ expiryGraceDays: 30 });
    await expect(
      assertEnterpriseBillingActivated(db, ORGANIZATION_ID, '2027-01-30'),
    ).resolves.toMatchObject({ version: 1 });
    await expect(
      assertEnterpriseBillingActivated(db, ORGANIZATION_ID, '2027-01-31'),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('refuses activation before the term starts', async () => {
    const { db } = await executedAgreement();
    const state = await readEnterpriseActivationState(db, ORGANIZATION_ID, null, '2025-12-31');
    expect(state.force).toMatchObject({ inForce: false, reason: 'not_started' });
    await expect(
      assertEnterpriseBillingActivated(db, ORGANIZATION_ID, '2025-12-31'),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('audits billing that runs outside the term', async () => {
    const { db } = await executedAgreement();
    const state = await readEnterpriseActivationState(db, ORGANIZATION_ID, null, AFTER_TERM);
    await auditActivationState(ORGANIZATION_ID, state, 'contract-1');
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          reason: 'enterprise_billing_outside_contract_term',
          status: 'expired',
        }),
      }),
    );
  });
});

describe('terminating an agreement', () => {
  async function executed() {
    const { db, rows } = agreementDb();
    await recordSignedOrder(db, {
      organizationId: ORGANIZATION_ID,
      terms: terms(),
      signature: signature(),
      authoredBy: 'deal-desk',
    });
    return { db, rows };
  }

  it('ends the agreement without rewriting what was agreed', async () => {
    const { db, rows } = await executed();
    const terminated = await terminateCommercialAgreement(db, {
      organizationId: ORGANIZATION_ID,
      reason: 'terminated for convenience',
      terminatedBy: 'deal-desk',
      terminatedAt: '2026-06-30T00:00:00.000Z',
    });
    expect(terminated.terminationReason).toBe('terminated for convenience');
    expect(terminated.terms.committedSeats).toBe(250);
    expect(rows).toHaveLength(1);
    expect(rows[0]!['committed_seats']).toBe(250);
    expect(agreementLifecycleState(terminated)).toBe('terminated');
  });

  it('stops granting from the moment it is terminated, inside the term', async () => {
    const { db } = await executed();
    await expect(
      assertEnterpriseBillingActivated(db, ORGANIZATION_ID, IN_TERM),
    ).resolves.toMatchObject({ version: 1 });
    await terminateCommercialAgreement(db, {
      organizationId: ORGANIZATION_ID,
      reason: 'non payment',
      terminatedBy: 'deal-desk',
    });
    await expect(
      assertEnterpriseBillingActivated(db, ORGANIZATION_ID, IN_TERM),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('is recorded once: terminating twice does not rewrite the first ending', async () => {
    const { db } = await executed();
    const first = await terminateCommercialAgreement(db, {
      organizationId: ORGANIZATION_ID,
      reason: 'non payment',
      terminatedBy: 'deal-desk',
      terminatedAt: '2026-06-30T00:00:00.000Z',
    });
    const second = await terminateCommercialAgreement(db, {
      organizationId: ORGANIZATION_ID,
      reason: 'a different reason',
      terminatedBy: 'someone-else',
    });
    expect(second.terminatedAt).toBe(first.terminatedAt);
    expect(second.terminationReason).toBe('non payment');
  });

  it('refuses a termination with no stated reason', async () => {
    const { db } = await executed();
    await expect(
      terminateCommercialAgreement(db, {
        organizationId: ORGANIZATION_ID,
        reason: '   ',
        terminatedBy: 'deal-desk',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('refuses to terminate a workspace that never signed anything', async () => {
    const { db } = agreementDb();
    await expect(
      terminateCommercialAgreement(db, {
        organizationId: ORGANIZATION_ID,
        reason: 'nothing to end',
        terminatedBy: 'deal-desk',
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
