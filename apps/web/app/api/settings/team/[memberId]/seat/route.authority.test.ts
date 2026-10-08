import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
const STANDARD_PRICE = 'price_team_standard';
const PREMIUM_PRICE = 'price_team_premium';
const PERIOD_END_SECONDS = Math.floor(Date.now() / 1000) + 12 * 86_400;

vi.hoisted(() => {
  process.env['STRIPE_PRICE_TEAM_MONTHLY_USD'] = 'price_team_standard';
  process.env['STRIPE_PRICE_TEAM_PREMIUM_MONTHLY_USD'] = 'price_team_premium';
});

const state = vi.hoisted(() => ({
  role: 'owner' as string | null,
  permissions: [] as string[],
  redeemed: false,
  ownerStatus: 'active',
  pendingInvoice: null as string | null,
  stripeUpdate: vi.fn(),
  stripeRetrieve: vi.fn(),
}));

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<CsrfModule>()),
  requireCsrfToken: vi.fn(async () => null),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<SecurityAuditModule>()),
  recordAuditEvent: vi.fn(async () => undefined),
}));
vi.mock('@/lib/server/request-context-cache', async (importOriginal) => ({
  ...(await importOriginal<RequestContextCacheModule>()),
  invalidateActiveOrganizationCache: vi.fn(async () => undefined),
}));
vi.mock('@/app/api/settings/team/team-admin-access', async (importOriginal) => ({
  ...(await importOriginal<TeamAdminAccessModule>()),
  requireTeamAdminAccess: vi.fn(async () => ({ plan: 'team', canManageTeam: true })),
}));
vi.mock('@/app/api/stripe-webhook/lib/seats', async (importOriginal) => ({
  ...(await importOriginal<SeatsModule>()),
  persistPurchasedSeatsOnOrganization: vi.fn(async () => 'persisted'),
}));
vi.mock('@/lib/server/localized-pricing-service', async (importOriginal) => ({
  ...(await importOriginal<LocalizedPricingServiceModule>()),
  getPriceSelectionForCurrency: vi.fn(async (plan: string) => ({
    priceId: plan === 'team_premium' ? PREMIUM_PRICE : STANDARD_PRICE,
    currency: 'usd',
    amountMinor: plan === 'team_premium' ? 12_500 : 2_500,
  })),
}));
vi.mock('@/lib/services/entitlement-resolution', async (importOriginal) => ({
  ...(await importOriginal<EntitlementResolutionModule>()),
  resolveEntitlementBundle: vi.fn(async () => ({
    subscription: {
      id: 'sub-row-owner',
      plan_tier: 'team',
      status: state.ownerStatus,
      stripe_subscription_id: 'sub_team',
      current_period_start: new Date(),
      current_period_end: new Date(PERIOD_END_SECONDS * 1000),
      plan_catalog_version: null,
    },
  })),
}));
vi.mock('@/lib/services/subscription-service', async (importOriginal) => ({
  ...(await importOriginal<SubscriptionServiceModule>()),
  SubscriptionService: { carryCreditsForUpgradePeriod: vi.fn(async () => 'account-1') },
}));

function privilegedQuery(sql: string) {
  if (sql.includes('organization_member_permissions')) {
    return [{ role: state.role, permissions: state.permissions }];
  }
  if (sql.includes('from public.organizations')) {
    return [
      {
        owner_user_id: 'owner-1',
        billing_plan_tier: 'team',
        stripe_subscription_id: 'sub_team',
        stripe_customer_id: 'cus_team',
      },
    ];
  }
  return [];
}

vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<NeonDbModule>()),
  getNeonDb: vi.fn(() => ({
    query: vi.fn(async (sql: string) => privilegedQuery(sql)),
    execute: vi.fn(async () => 1),
  })),
}));

function scopedQuery(sql: string) {
  if (sql.includes('select user_id, seat_type, premium_paid_through')) {
    return [{ user_id: 'member-1', seat_type: 'standard', premium_paid_through: null }];
  }
  if (sql.includes('as assigned')) return [{ assigned: '0' }];
  if (sql.includes('beta_redemptions')) return [{ granted: state.redeemed }];
  if (sql.includes('from public.organization_members')) {
    return state.role
      ? [{ organization_id: ORGANIZATION, user_id: 'caller-1', role: state.role }]
      : [];
  }
  return [];
}

vi.mock('@/lib/server/rls-db', async (importOriginal) => {
  const tx = {
    query: vi.fn(async (sql: string) => scopedQuery(sql)),
    execute: vi.fn(async () => 1),
  };
  return {
    ...(await importOriginal<RlsDbModule>()),
    getUserScopedDb: vi.fn(async () => ({
      db: { ...tx, transaction: async (callback: (inner: typeof tx) => unknown) => callback(tx) },
      userId: 'caller-1',
    })),
  };
});

vi.mock('@/lib/server/stripe-client', async (importOriginal) => ({
  ...(await importOriginal<StripeClientModule>()),
  getStripeClient: vi.fn(() => ({
    subscriptions: { retrieve: state.stripeRetrieve, update: state.stripeUpdate },
  })),
}));

import { PATCH } from './route';

type TeamAdminAccessModule = typeof import('@/app/api/settings/team/team-admin-access');
type SeatsModule = typeof import('@/app/api/stripe-webhook/lib/seats');
type CsrfModule = typeof import('@/lib/csrf');
type LoggerModule = typeof import('@/lib/logger');
type RateLimitModule = typeof import('@/lib/rate-limit');
type SecurityAuditModule = typeof import('@/lib/security-audit');
type LocalizedPricingServiceModule = typeof import('@/lib/server/localized-pricing-service');
type NeonDbModule = typeof import('@/lib/server/neon-db');
type RequestContextCacheModule = typeof import('@/lib/server/request-context-cache');
type RlsDbModule = typeof import('@/lib/server/rls-db');
type StripeClientModule = typeof import('@/lib/server/stripe-client');
type EntitlementResolutionModule = typeof import('@/lib/services/entitlement-resolution');
type SubscriptionServiceModule = typeof import('@/lib/services/subscription-service');

function subscription(premium: number) {
  const recurring = { interval: 'month', interval_count: 1 };
  return {
    id: 'sub_team',
    status: 'active',
    currency: 'usd',
    cancel_at_period_end: false,
    cancel_at: null,
    pending_update: null,
    latest_invoice: null,
    current_period_start: PERIOD_END_SECONDS - 2_592_000,
    current_period_end: PERIOD_END_SECONDS,
    items: {
      data: [
        { id: 'si_standard', quantity: 4 - premium, price: { id: STANDARD_PRICE, recurring } },
        { id: 'si_premium', quantity: premium, price: { id: PREMIUM_PRICE, recurring } },
      ],
    },
  };
}

function patch() {
  return PATCH(
    new NextRequest(`https://agiworkforce.com/api/settings/team/${ORGANIZATION}:member-1/seat`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seatType: 'premium' }),
    }),
    { params: Promise.resolve({ memberId: `${ORGANIZATION}:member-1` }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('AGI_BILLING_WAITLIST_OPEN', '');
  state.role = 'owner';
  state.permissions = ['members.manage', 'billing.read', 'billing.contracts.manage'];
  state.redeemed = false;
  state.ownerStatus = 'active';
  state.stripeRetrieve.mockResolvedValue(subscription(0));
  state.stripeUpdate.mockImplementation(async () => subscription(1));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(() => {
  delete process.env['STRIPE_PRICE_TEAM_MONTHLY_USD'];
  delete process.env['STRIPE_PRICE_TEAM_PREMIUM_MONTHLY_USD'];
});

describe('PATCH /api/settings/team/[memberId]/seat, through the real seat service', () => {
  it('refuses a plain member before Stripe is read', async () => {
    state.role = 'member';
    state.permissions = ['content.read', 'content.share'];

    const response = await patch();

    expect(response.status).toBe(403);
    expect(state.stripeRetrieve).not.toHaveBeenCalled();
    expect(state.stripeUpdate).not.toHaveBeenCalled();
  });

  it('refuses an admin a charged Premium seat and charges nothing', async () => {
    state.role = 'admin';
    state.permissions = ['members.manage', 'billing.read'];

    const response = await patch();

    expect(response.status).toBe(403);
    expect(JSON.stringify(await response.json())).toContain('Only the workspace owner');
    expect(state.stripeUpdate).not.toHaveBeenCalled();
  });

  it('answers a payer outside the waitlist with the same refusal checkout gives', async () => {
    state.ownerStatus = 'canceled';

    const response = await patch();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'waitlist_access_required' },
    });
    expect(state.stripeUpdate).not.toHaveBeenCalled();
  });

  it('charges the owner and reports it', async () => {
    const response = await patch();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      seatType: 'premium',
      billing: 'charged_now',
    });
    expect(state.stripeUpdate).toHaveBeenCalledTimes(1);
  });

  it('hands back the invoice link when the charge needs the payer to act', async () => {
    state.stripeUpdate.mockResolvedValue({
      ...subscription(0),
      pending_update: { subscription_items: [] },
      latest_invoice: { hosted_invoice_url: 'https://invoice.stripe.test/in_9' },
    });

    const response = await patch();

    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body).toMatchObject({
      paymentActionRequired: true,
      paymentUrl: 'https://invoice.stripe.test/in_9',
    });
    expect(body.message).toContain('assign the Premium seat again');
  });
});
