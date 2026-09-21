import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  resolveOrgMembership: vi.fn(),
  requireTeamAdminAccess: vi.fn(async () => undefined),
  recordAuditEvent: vi.fn(async () => undefined),
}));

vi.mock('server-only', () => ({}));

const permissionRole = vi.hoisted(() => ({ value: 'admin' as string | null }));
vi.mock('@/lib/services/organization-permission-service', async () =>
  (
    await import('@/lib/services/__tests__/organization-permission-service-mock')
  ).organizationPermissionServiceMock(permissionRole),
);
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/security-audit')>()),
  recordAuditEvent: mocks.recordAuditEvent,
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: scopedDb(),
    userId: 'user-1',
  })),
}));
vi.mock('@/lib/services/org-sharing-service', () => ({
  resolveOrgMembership: mocks.resolveOrgMembership,
  requireOrgMember: (membership: unknown) => membership,
}));
vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  requireTeamAdminAccess: mocks.requireTeamAdminAccess,
}));

function scopedDb() {
  const adapter = {
    query: mocks.query,
    execute: mocks.execute,
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(adapter),
  };
  return adapter;
}

const { GET, POST } = await import('./route');

const ORG = '11111111-1111-4111-8111-111111111111';
const IN_FORCE_TERM_END = '2999-12-31';

function request() {
  return new NextRequest('https://agiworkforce.com/api/settings/organization/billing-contract');
}

function postRequest(body: unknown) {
  return new NextRequest('https://agiworkforce.com/api/settings/organization/billing-contract', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function agreementRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    organization_id: ORG,
    version: 2,
    status: 'executed',
    order_form_reference: 'OF-2026-001',
    signature_provider: 'docusign',
    signature_envelope_id: 'env_1',
    signed_at: '2025-12-15T10:00:00.000Z',
    signed_by_name: 'Dana Buyer',
    signed_by_email: 'buyer@example.com',
    customer_legal_entity: 'Acme Corp Ltd.',
    committed_seats: 250,
    seat_unit_price_cents: '120000',
    billing_cadence: 'annual',
    billing_currency: 'usd',
    contract_term_start: '2026-01-01',
    contract_term_end: IN_FORCE_TERM_END,
    expiry_grace_days: 0,
    payment_terms_days: 30,
    payment_method_policy: 'invoice_ach_wire',
    purchase_order_required: true,
    invoice_recipient_emails: ['ap@example.com'],
    included_usage_cents_per_period: '0',
    committed_usage_block_cents: '0',
    minimum_annual_spend_cents: '0',
    overage_stripe_price_id: null,
    support_tier: null,
    procurement_reference: 'PO-99',
    billing_contact_name: null,
    billing_contact_email: 'ap@example.com',
    procurement_contact_name: 'Dana Buyer',
    procurement_contact_email: null,
    tax_exempt_status: 'reverse',
    amendment_reason: 'seat expansion',
    change_kind: 'amendment',
    supersedes_version: 1,
    authored_by: 'deal-desk',
    superseded_at: null,
    terminated_at: null,
    termination_reason: null,
    created_at: '2025-12-15T10:00:00.000Z',
    ...overrides,
  };
}

function contractRow() {
  return {
    customer_legal_entity: 'Acme Corp Ltd.',
    procurement_reference: 'PO-99',
    contract_term_start: '2026-01-01',
    contract_term_end: IN_FORCE_TERM_END,
    billing_cadence: 'annual',
    committed_seats: 250,
    support_tier: null,
    payment_terms_days: 30,
    tax_exempt_status: 'reverse',
    collection_stage: 'current',
    ended_at: null,
    billing_contact_name: null,
    billing_contact_email: 'ap@example.com',
    procurement_contact_name: 'Dana Buyer',
    procurement_contact_email: null,
  };
}

function invoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    stripe_invoice_id: 'in_1',
    invoice_number: 'INV-1',
    status: 'open',
    collection_method: 'send_invoice',
    amount_due_cents: '500000',
    amount_paid_cents: '0',
    currency: 'usd',
    period_start: '2026-01-01T00:00:00.000Z',
    period_end: '2026-12-31T00:00:00.000Z',
    due_at: '2099-01-31T00:00:00.000Z',
    paid_at: null,
    voided_at: null,
    hosted_invoice_url: 'https://invoice.stripe.com/i/1',
    invoice_pdf_url: null,
    reconciled_offline_cents: '0',
    reported_offline_cents: '0',
    ...overrides,
  };
}

function withWorkspace(options: { agreement?: Record<string, unknown> | null } = {}) {
  const agreement = options.agreement === undefined ? agreementRow() : options.agreement;
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes('from public.organization_billing_contracts')) return [contractRow()];
    if (sql.includes('from public.organization_billing_invoices')) return [invoiceRow()];
    if (sql.includes('from public.organization_commercial_agreements')) {
      return agreement ? [agreement] : [];
    }
    if (sql.includes('from public.enterprise_offline_payment_records')) return [];
    return [];
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveOrgMembership.mockResolvedValue({ organizationId: ORG, role: 'owner' });
  permissionRole.value = 'owner';
});

describe('GET /api/settings/organization/billing-contract', () => {
  it('refuses a member who is not an owner or admin', async () => {
    mocks.resolveOrgMembership.mockResolvedValue({ organizationId: ORG, role: 'member' });
    permissionRole.value = 'member';

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('returns the contract with contacts and invoices, without Stripe identifiers', async () => {
    withWorkspace();

    const response = await GET(request());
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      contract: {
        paymentTermsDays: 30,
        taxExemptStatus: 'reverse',
        billingContact: { name: null, email: 'ap@example.com' },
        procurementContact: { name: 'Dana Buyer', email: null },
      },
      invoices: [{ invoiceNumber: 'INV-1', amountDueCents: 500000 }],
    });
    expect(JSON.stringify(body)).not.toMatch(/sub_|cus_|price_|prod_/);
    const panelColumns = new Set(['overage_stripe_price_id', 'stripe_invoice_id']);
    for (const [sql, params] of mocks.query.mock.calls as [string, unknown[]][]) {
      const stripeColumns = [...sql.matchAll(/[a-z_]*stripe_[a-z_]+/g)].map((match) => match[0]);
      expect(stripeColumns.filter((column) => !panelColumns.has(column))).toEqual([]);
      expect(params[0]).toBe(ORG);
    }
  });

  it('answers with the live agreement, what may be done to it and its history', async () => {
    withWorkspace();

    const body = (await (await GET(request())).json()) as Record<string, unknown>;

    expect(body['agreement']).toMatchObject({
      version: 2,
      state: 'executed',
      changeKind: 'amendment',
      inForce: true,
      model: 'seat_only',
      paymentTermLabel: 'NET 30',
    });
    expect(body['availableEvents']).toEqual(['amend', 'renew', 'terminate', 'term_lapsed']);
    expect(body['history']).toEqual([
      expect.objectContaining({ version: 2, changeKind: 'amendment', supersedesVersion: 1 }),
    ]);
    expect(body['invoicePositions']).toEqual([
      expect.objectContaining({ state: 'open', outstandingCents: 500000 }),
    ]);
  });

  it('reports an agreement whose term has ended as granting nothing', async () => {
    withWorkspace({ agreement: agreementRow({ contract_term_end: '2020-12-31' }) });

    const body = (await (await GET(request())).json()) as Record<string, unknown>;

    expect(body['agreement']).toMatchObject({ state: 'expired', inForce: false });
    expect(body['availableEvents']).toEqual(['renew']);
  });

  it('answers with no contract for a workspace that has none', async () => {
    mocks.resolveOrgMembership.mockResolvedValue({ organizationId: ORG, role: 'admin' });
    permissionRole.value = 'admin';
    mocks.query.mockResolvedValue([]);

    const body = (await (await GET(request())).json()) as Record<string, unknown>;

    expect(body).toEqual({
      contract: null,
      invoices: [],
      agreement: null,
      availableEvents: [],
      history: [],
      invoicePositions: [],
    });
  });
});

describe('POST /api/settings/organization/billing-contract', () => {
  it('refuses an admin who may read the contract but not manage it', async () => {
    mocks.resolveOrgMembership.mockResolvedValue({ organizationId: ORG, role: 'admin' });
    permissionRole.value = 'admin';
    withWorkspace();

    const response = await POST(postRequest({ action: 'terminate', reason: 'no longer needed' }));

    expect(response.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('refuses a body that names no action this contract understands', async () => {
    permissionRole.value = 'primary_owner';
    withWorkspace();

    const response = await POST(postRequest({ action: 'delete_everything' }));

    expect(response.status).toBe(400);
  });

  it('terminates the agreement and reports it as granting nothing', async () => {
    permissionRole.value = 'primary_owner';
    const terminated = agreementRow({
      terminated_at: '2026-06-30T00:00:00.000Z',
      termination_reason: 'terminated for convenience',
    });
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('update public.organization_commercial_agreements')) return [terminated];
      if (sql.includes('from public.organization_commercial_agreements')) return [agreementRow()];
      return [];
    });

    const response = await POST(
      postRequest({ action: 'terminate', reason: 'terminated for convenience' }),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body['agreement']).toMatchObject({ state: 'terminated', inForce: false });
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        detail: expect.objectContaining({ reason: 'commercial_agreement_terminated' }),
      }),
    );
  });

  it('reports a wire against an invoice and is idempotent on the bank reference', async () => {
    permissionRole.value = 'primary_owner';
    const recorded = {
      id: '33333333-3333-4333-8333-333333333333',
      stripe_invoice_id: 'in_1',
      method: 'wire',
      amount_cents: '500000',
      currency: 'usd',
      remittance_reference: 'FED-88123',
      received_on: '2026-06-01',
      reported_by: 'user-1',
      reconciled_at: null,
      created_at: '2026-06-01T00:00:00.000Z',
    };
    let inserted = false;
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.organization_commercial_agreements')) return [agreementRow()];
      if (sql.includes('from public.organization_billing_invoices')) {
        return [invoiceRow({ reported_offline_cents: inserted ? '500000' : '0' })];
      }
      if (sql.includes('from public.enterprise_offline_payment_records')) {
        return inserted ? [recorded] : [];
      }
      if (sql.includes('insert into public.enterprise_offline_payment_records')) {
        if (inserted) return [];
        inserted = true;
        return [recorded];
      }
      return [];
    });

    const body = {
      action: 'report_offline_payment',
      stripeInvoiceId: 'in_1',
      method: 'wire',
      amountCents: 500000,
      remittanceReference: 'FED-88123',
      receivedOn: '2026-06-01',
    };
    const first = await POST(postRequest(body));
    const second = await POST(postRequest(body));

    expect(first.status).toBe(201);
    expect(await first.json()).toMatchObject({
      recorded: true,
      invoice: { reportedOfflineCents: 500000, outstandingCents: 500000, state: 'open' },
    });
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ recorded: false });
    const inserts = (mocks.query.mock.calls as [string, unknown[]][]).filter(([sql]) =>
      sql.includes('insert into public.enterprise_offline_payment_records'),
    );
    expect(inserts).toHaveLength(1);
  });

  it('refuses a transfer on a workspace with no agreement to settle against', async () => {
    permissionRole.value = 'primary_owner';
    withWorkspace({ agreement: null });

    const response = await POST(
      postRequest({
        action: 'report_offline_payment',
        stripeInvoiceId: 'in_1',
        method: 'wire',
        amountCents: 1000,
        remittanceReference: 'FED-1',
        receivedOn: '2026-06-01',
      }),
    );

    expect(response.status).toBe(404);
  });
});
