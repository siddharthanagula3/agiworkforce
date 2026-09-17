import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  resolveOrgMembership: vi.fn(),
  requireTeamAdminAccess: vi.fn(async () => undefined),
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
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: mocks.query, execute: vi.fn() },
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

const { GET } = await import('./route');

const ORG = '11111111-1111-4111-8111-111111111111';

function request() {
  return new NextRequest('https://agiworkforce.com/api/settings/organization/billing-contract');
}

beforeEach(() => {
  vi.clearAllMocks();
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
    mocks.resolveOrgMembership.mockResolvedValue({ organizationId: ORG, role: 'owner' });
    permissionRole.value = 'owner';
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.organization_billing_contracts')) {
        return [
          {
            customer_legal_entity: 'Acme Corp Ltd.',
            procurement_reference: 'PO-99',
            contract_term_start: '2026-01-01',
            contract_term_end: '2026-12-31',
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
          },
        ];
      }
      if (sql.includes('from public.organization_billing_invoices')) {
        return [
          {
            invoice_number: 'INV-1',
            status: 'paid',
            amount_due_cents: '500000',
            amount_paid_cents: '500000',
            currency: 'usd',
            period_start: '2026-01-01T00:00:00.000Z',
            period_end: '2026-12-31T00:00:00.000Z',
            due_at: '2026-01-31T00:00:00.000Z',
            paid_at: '2026-01-20T00:00:00.000Z',
            hosted_invoice_url: 'https://invoice.stripe.com/i/1',
            invoice_pdf_url: null,
          },
        ];
      }
      return [];
    });

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
    for (const [sql, params] of mocks.query.mock.calls as [string, unknown[]][]) {
      expect(sql).not.toMatch(/stripe_(customer|subscription|price|product)_id/);
      expect(params[0]).toBe(ORG);
    }
  });

  it('answers with no contract for a workspace that has none', async () => {
    mocks.resolveOrgMembership.mockResolvedValue({ organizationId: ORG, role: 'admin' });
    permissionRole.value = 'admin';
    mocks.query.mockResolvedValue([]);

    const response = await GET(request());

    expect(await response.json()).toEqual({ contract: null, invoices: [] });
  });
});
