import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { OrganizationPermission } from '@agiworkforce/types';
import { MANAGED_CLOUD_ORGANIZATION_HEADER } from '@agiworkforce/cloud-contracts';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  membership: vi.fn(),
  membershipQuery: vi.fn(),
  savedOrganization: vi.fn(),
  scopedDb: vi.fn(),
  permission: vi.fn(),
  csrf: vi.fn(),
  rate: vi.fn(),
  adminAudit: vi.fn(),
  requireTeamAdminAccess: vi.fn(),
  recordAuditEvent: vi.fn(async () => undefined),
}));

vi.mock('server-only', () => ({}));

const permissionRole = vi.hoisted(() => ({ value: 'admin' as string | null }));
const scope = vi.hoisted(() => ({
  organizationId: null as string | null,
  roles: new Map<string, string>(),
}));
vi.mock('@/lib/services/organization-permission-service', async () => {
  const { permissionsForRole } =
    await import('@/lib/services/__tests__/organization-permission-service-mock');
  const { createError } = await import('@/lib/errors');
  const permissions = (organizationId: string) =>
    permissionsForRole(scope.roles.get(organizationId) ?? permissionRole.value);
  mocks.permission = vi.fn(
    async (organizationId: string, _userId: string, permission: OrganizationPermission) => {
      if (!permissions(organizationId).has(permission)) {
        throw createError.forbidden('Permission denied');
      }
    },
  );
  return {
    resolveOrganizationPermissions: vi.fn(async (organizationId: string) =>
      permissions(organizationId),
    ),
    requireMemberPermission: mocks.permission,
  };
});
vi.mock('@/lib/error-handler', async (importOriginal) => ({
  ...(await importOriginal<RetainedMockModule0>()),
  withErrorHandler:
    (handler: (request: NextRequest) => Promise<Response>) => async (request: NextRequest) => {
      try {
        return await handler(request);
      } catch (error) {
        return Response.json(
          { error: (error as Error).message },
          { status: (error as { statusCode?: number }).statusCode ?? 500 },
        );
      }
    },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => {
    throw new Error('Unexpected live database access');
  }),
}));
vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: mocks.savedOrganization,
}));
vi.mock('@/lib/services/org-entitlements', async (importOriginal) => ({
  ...(await importOriginal<CompleteMockModule0>()),
  getOrganizationEntitlements: vi.fn(),
  getSharedProjectLimitErrorMessage: vi.fn(),
  isOrgResourceLimitError: vi.fn(),
}));
vi.mock('@/lib/server/payments/stripe-provider', () => ({
  normalizeStripeSubscription: vi.fn(() => {
    throw new Error('Unexpected billing provider access');
  }),
}));
vi.mock('@/lib/server/payments/subscription-history', () => ({
  recordSubscriptionStateTransition: vi.fn(() => {
    throw new Error('Unexpected subscription transition');
  }),
}));
vi.mock('@/lib/server/admin-data-access', () => ({
  logAdminDataAccess: mocks.adminAudit,
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<RetainedMockModule1>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.rate }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.csrf }));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<CompleteMockModule1>()),
  recordAuditEvent: mocks.recordAuditEvent,
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: mocks.scopedDb,
}));
vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  requireTeamAdminAccess: mocks.requireTeamAdminAccess,
}));

function scopedDb() {
  const adapter = {
    query: async (sql: string, params: unknown[]) => {
      if (sql.includes('from public.organization_members')) {
        mocks.membershipQuery(sql, params);
        const member = await mocks.membership(params[0], params[1]);
        return member ? [{ organization_id: member.organizationId, role: member.role }] : [];
      }
      return mocks.query(sql, params);
    },
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
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('Unexpected network access');
    }),
  );
  mocks.query.mockReset().mockResolvedValue([]);
  mocks.execute.mockReset().mockResolvedValue(undefined);
  mocks.membership.mockReset();
  mocks.savedOrganization.mockReset().mockResolvedValue(ORG);
  mocks.requireTeamAdminAccess.mockReset().mockResolvedValue(undefined);
  mocks.csrf.mockReset().mockResolvedValue(null);
  mocks.rate.mockReset().mockResolvedValue(null);
  mocks.adminAudit.mockReset().mockResolvedValue(undefined);
  mocks.recordAuditEvent.mockReset().mockResolvedValue(undefined);
  scope.organizationId = ORG;
  scope.roles.clear();
  mocks.scopedDb.mockReset().mockImplementation(async () => ({
    db: scopedDb(),
    userId: 'user-1',
    organizationId: scope.organizationId,
  }));
  mocks.membership.mockResolvedValue({ organizationId: ORG, role: 'owner' });
  permissionRole.value = 'owner';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/settings/organization/billing-contract', () => {
  it('refuses a member who is not an owner or admin', async () => {
    mocks.membership.mockResolvedValue({ organizationId: ORG, role: 'member' });
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
    mocks.membership.mockResolvedValue({ organizationId: ORG, role: 'admin' });
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
    mocks.membership.mockResolvedValue({ organizationId: ORG, role: 'admin' });
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

const ORG_B = '44444444-4444-4444-8444-444444444444';
const AGREEMENT_B = '55555555-5555-4555-8555-555555555555';

function capturedRequest(action?: Record<string, unknown>, explicit = false) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (explicit) headers.set(MANAGED_CLOUD_ORGANIZATION_HEADER, ORG_B);
  return new NextRequest('https://agiworkforce.com/api/settings/organization/billing-contract', {
    method: action ? 'POST' : 'GET',
    headers,
    ...(action ? { body: JSON.stringify(action) } : {}),
  });
}

function paymentAction(invoiceId = 'in_B') {
  return {
    action: 'report_offline_payment',
    stripeInvoiceId: invoiceId,
    method: 'wire',
    amountCents: 1000,
    remittanceReference: 'B-reference',
    receivedOn: '2026-06-01',
  };
}

function twoWorkspaces() {
  const agreements = new Map<string, Record<string, unknown>>([
    [ORG, agreementRow({ customer_legal_entity: 'Saved A' })],
    [
      ORG_B,
      agreementRow({
        id: AGREEMENT_B,
        organization_id: ORG_B,
        customer_legal_entity: 'Captured B',
        order_form_reference: 'B-order',
      }),
    ],
  ]);
  const payments = new Map<string, Record<string, unknown>>();
  scope.organizationId = ORG_B;
  scope.roles.set(ORG, 'primary_owner');
  scope.roles.set(ORG_B, 'primary_owner');
  mocks.membership.mockImplementation(async (organizationId: string, userId: string) =>
    userId === 'user-1' && agreements.has(organizationId)
      ? { organizationId, role: 'owner' }
      : null,
  );
  mocks.query.mockImplementation(async (sql: string, params: unknown[]) => {
    const organizationId = String(params[0]);
    if (sql.includes('update public.organization_commercial_agreements')) {
      const target = agreements.get(String(params[1]));
      if (!target || target['id'] !== params[0] || target['terminated_at']) return [];
      target['terminated_at'] = '2026-06-30T00:00:00.000Z';
      target['termination_reason'] = params[3];
      return [{ ...target }];
    }
    if (sql.includes('from public.organization_commercial_agreements')) {
      const agreement = agreements.get(organizationId);
      return agreement ? [{ ...agreement }] : [];
    }
    if (sql.includes('from public.organization_billing_contracts')) {
      return agreements.has(organizationId)
        ? [
            {
              ...contractRow(),
              customer_legal_entity: organizationId === ORG ? 'Saved A' : 'Captured B',
            },
          ]
        : [];
    }
    if (sql.includes('from public.organization_billing_invoices')) {
      if (!agreements.has(organizationId)) return [];
      return [
        invoiceRow({
          stripe_invoice_id: organizationId === ORG ? 'in_A' : 'in_B',
          invoice_number: organizationId === ORG ? 'A-invoice' : 'B-invoice',
          reported_offline_cents: payments.has(organizationId) ? '1000' : '0',
        }),
      ];
    }
    if (sql.includes('from public.enterprise_offline_payment_records')) {
      const payment = payments.get(organizationId);
      return payment &&
        payment['stripe_invoice_id'] === params[1] &&
        payment['remittance_reference'] === params[2]
        ? [{ ...payment }]
        : [];
    }
    if (sql.includes('insert into public.enterprise_offline_payment_records')) {
      if (payments.has(organizationId)) return [];
      const payment = {
        id: '66666666-6666-4666-8666-666666666666',
        stripe_invoice_id: params[1],
        method: params[2],
        amount_cents: params[3],
        currency: params[4],
        remittance_reference: params[5],
        received_on: params[6],
        reported_by: params[7],
        reconciled_at: null,
        created_at: '2026-06-01T00:00:00.000Z',
      };
      payments.set(organizationId, payment);
      return [{ ...payment }];
    }
    throw new Error(`Unexpected fixture SQL: ${sql}`);
  });
  return { agreements, payments };
}

function expectCapturedGate(permission: 'billing.read' | 'billing.contracts.manage') {
  expect(mocks.scopedDb).toHaveBeenCalledWith(expect.any(NextRequest));
  expect(mocks.scopedDb.mock.calls.every((call) => call.length === 1)).toBe(true);
  expect(mocks.savedOrganization).not.toHaveBeenCalled();
  expect(mocks.membershipQuery).toHaveBeenCalledWith(
    expect.stringContaining("and status = 'active'"),
    [ORG_B, 'user-1'],
  );
  expect(mocks.requireTeamAdminAccess).toHaveBeenCalledWith(expect.anything(), 'user-1', ORG_B);
  expect(mocks.permission).toHaveBeenCalledWith(ORG_B, 'user-1', permission, expect.any(String));
}

function expectNoMutation() {
  const mutations = mocks.query.mock.calls.filter(([sql]) =>
    /\b(insert|update|delete)\b/u.test(sql),
  );
  expect(mutations).toEqual([]);
  expect(mocks.execute).not.toHaveBeenCalled();
  expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
}

describe('captured billing-contract workspace isolation', () => {
  for (const explicit of [false, true]) {
    it(`reads only captured B with ${explicit ? 'explicit' : 'headerless'} selection`, async () => {
      const state = twoWorkspaces();
      const beforeA = JSON.stringify(state.agreements.get(ORG));
      const response = await GET(capturedRequest(undefined, explicit));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.contract.customerLegalEntity).toBe('Captured B');
      expect(body.history).toEqual([expect.objectContaining({ orderFormReference: 'B-order' })]);
      expect(body.invoices).toEqual([expect.objectContaining({ invoiceNumber: 'B-invoice' })]);
      expect(body.invoicePositions).toEqual([expect.objectContaining({ stripeInvoiceId: 'in_B' })]);
      expect(JSON.stringify(body)).not.toContain('Saved A');
      expect(JSON.stringify(body)).not.toContain('in_A');
      expectCapturedGate('billing.read');
      for (const [, params] of mocks.query.mock.calls) expect(params[0]).toBe(ORG_B);
      expect(mocks.adminAudit).toHaveBeenCalledWith(expect.any(NextRequest), {
        userId: 'user-1',
        organizationId: ORG_B,
        role: 'owner',
        resourceType: 'enterprise_contract',
      });
      expect(JSON.stringify(state.agreements.get(ORG))).toBe(beforeA);
      expectNoMutation();
    });

    it(`terminates only captured B with ${explicit ? 'explicit' : 'headerless'} selection`, async () => {
      const state = twoWorkspaces();
      const beforeA = JSON.stringify(state.agreements.get(ORG));
      const response = await POST(
        capturedRequest({ action: 'terminate', reason: 'B ended' }, explicit),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        agreement: { state: 'terminated', inForce: false },
      });
      expectCapturedGate('billing.contracts.manage');
      expect(mocks.query).toHaveBeenCalledWith(
        expect.stringContaining('update public.organization_commercial_agreements'),
        [AGREEMENT_B, ORG_B, null, 'B ended'],
      );
      expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(1);
      expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG_B,
          userId: 'user-1',
          detail: expect.objectContaining({
            resourceId: AGREEMENT_B,
            reason: 'commercial_agreement_terminated',
          }),
        }),
      );
      expect(JSON.stringify(state.agreements.get(ORG))).toBe(beforeA);
      expect(state.payments.size).toBe(0);
    });

    it(`reports only B payment idempotently with ${explicit ? 'explicit' : 'headerless'} selection`, async () => {
      const state = twoWorkspaces();
      const before = JSON.stringify([...state.agreements]);
      const first = await POST(capturedRequest(paymentAction(), explicit));
      const second = await POST(capturedRequest(paymentAction(), explicit));

      expect(first.status).toBe(201);
      expect(await first.json()).toMatchObject({
        recorded: true,
        payment: { stripeInvoiceId: 'in_B', reportedBy: 'user-1', amountCents: 1000 },
        invoice: { stripeInvoiceId: 'in_B', reportedOfflineCents: 1000, outstandingCents: 500000 },
      });
      expect(second.status).toBe(200);
      expect(await second.json()).toMatchObject({ recorded: false });
      expectCapturedGate('billing.contracts.manage');
      const inserts = mocks.query.mock.calls.filter(([sql]) => sql.includes('insert into'));
      expect(inserts).toHaveLength(1);
      expect(inserts[0]?.[1]).toEqual([
        ORG_B,
        'in_B',
        'wire',
        1000,
        'usd',
        'B-reference',
        '2026-06-01',
        'user-1',
        null,
      ]);
      expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(1);
      expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG_B,
          userId: 'user-1',
          detail: expect.objectContaining({
            resourceId: 'in_B',
            reason: 'enterprise_offline_payment_reported',
          }),
        }),
      );
      expect(state.payments.has(ORG)).toBe(false);
      expect(JSON.stringify([...state.agreements])).toBe(before);
      for (const [, params] of mocks.query.mock.calls) expect(params[0]).toBe(ORG_B);
    });
  }

  for (const action of [undefined, { action: 'terminate', reason: 'B ended' }, paymentAction()]) {
    for (const failure of ['personal', 'missing', 'mismatched', 'plan', 'permission']) {
      it(`refuses ${action?.action ?? 'GET'} on B ${failure} despite A rights`, async () => {
        const state = twoWorkspaces();
        const before = JSON.stringify([...state.agreements]);
        if (failure === 'personal') scope.organizationId = null;
        if (failure === 'missing') {
          mocks.membership.mockImplementation(async (organizationId: string) =>
            organizationId === ORG ? { organizationId: ORG, role: 'owner' } : null,
          );
        }
        if (failure === 'mismatched') {
          mocks.membership.mockResolvedValue({ organizationId: ORG, role: 'owner' });
        }
        if (failure === 'permission') scope.roles.set(ORG_B, 'viewer');
        if (failure === 'plan') {
          const { createError } = await import('@/lib/errors');
          mocks.requireTeamAdminAccess.mockImplementation(async (_db, _userId, organizationId) => {
            if (organizationId === ORG_B) throw createError.forbidden('B plan unavailable');
          });
        }
        const response = action
          ? await POST(capturedRequest(action))
          : await GET(capturedRequest());

        expect(response.status).toBe(403);
        expect(mocks.savedOrganization).not.toHaveBeenCalled();
        expect(mocks.query).not.toHaveBeenCalled();
        expect(mocks.adminAudit).not.toHaveBeenCalled();
        expectNoMutation();
        expect(JSON.stringify([...state.agreements])).toBe(before);
        expect(state.payments.size).toBe(0);
        if (failure === 'personal') expect(mocks.membershipQuery).not.toHaveBeenCalled();
        if (['personal', 'missing', 'mismatched'].includes(failure)) {
          expect(mocks.requireTeamAdminAccess).not.toHaveBeenCalled();
          expect(mocks.permission).not.toHaveBeenCalled();
        }
      });
    }
  }

  it('refuses an A-only invoice instead of reporting against saved A', async () => {
    const state = twoWorkspaces();
    const response = await POST(capturedRequest(paymentAction('in_A')));

    expect(response.status).toBe(404);
    expectCapturedGate('billing.contracts.manage');
    expectNoMutation();
    expect(state.payments.size).toBe(0);
    for (const [, params] of mocks.query.mock.calls) expect(params[0]).toBe(ORG_B);
  });

  for (const action of [{ action: 'terminate', reason: 'B ended' }, paymentAction()]) {
    it(`refuses ${action.action} when only A has an agreement`, async () => {
      const state = twoWorkspaces();
      state.agreements.delete(ORG_B);
      mocks.membership.mockResolvedValue({ organizationId: ORG_B, role: 'owner' });
      const beforeA = JSON.stringify(state.agreements.get(ORG));
      const response = await POST(capturedRequest(action));

      expect(response.status).toBe(404);
      expectNoMutation();
      expect(JSON.stringify(state.agreements.get(ORG))).toBe(beforeA);
    });
  }

  it('preserves the card-only refusal on B despite an offline agreement in A', async () => {
    const state = twoWorkspaces();
    state.agreements.get(ORG_B)!['payment_method_policy'] = 'card_only';
    const response = await POST(capturedRequest(paymentAction()));

    expect(response.status).toBe(409);
    expectNoMutation();
    expect(state.payments.size).toBe(0);
  });

  it('preserves the non-executed agreement refusal for termination', async () => {
    const state = twoWorkspaces();
    state.agreements.get(ORG_B)!['status'] = 'draft';
    const response = await POST(capturedRequest({ action: 'terminate', reason: 'B ended' }));

    expect(response.status).toBe(404);
    expectNoMutation();
  });

  for (const body of [
    { action: 'terminate', reason: '' },
    { ...paymentAction(), amountCents: 0 },
    { ...paymentAction(), method: 'unsupported' },
    { ...paymentAction(), organizationId: ORG },
  ]) {
    it(`rejects invalid B action ${JSON.stringify(body)}`, async () => {
      twoWorkspaces();
      const response = await POST(capturedRequest(body));

      expect(response.status).toBe(400);
      expect(mocks.query).not.toHaveBeenCalled();
      expectNoMutation();
    });
  }

  for (const guard of ['csrf', 'get-rate', 'post-rate']) {
    it(`preserves the ${guard} early response`, async () => {
      twoWorkspaces();
      const blocked = Response.json({ error: guard }, { status: guard === 'csrf' ? 403 : 429 });
      if (guard === 'csrf') mocks.csrf.mockResolvedValue(blocked);
      else mocks.rate.mockResolvedValue(blocked);
      const response =
        guard === 'get-rate'
          ? await GET(capturedRequest())
          : await POST(capturedRequest(paymentAction()));

      expect(response).toBe(blocked);
      expect(mocks.scopedDb).not.toHaveBeenCalled();
      expect(mocks.query).not.toHaveBeenCalled();
      expectNoMutation();
      if (guard === 'csrf') expect(mocks.rate).not.toHaveBeenCalled();
    });
  }
});

type CompleteMockModule0 = typeof import('@/lib/services/org-entitlements');
type CompleteMockModule1 = typeof import('@/lib/security-audit');

type RetainedMockModule0 = typeof import('@/lib/error-handler');
type RetainedMockModule1 = typeof import('@/lib/logger');
