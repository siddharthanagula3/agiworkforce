import type Stripe from 'stripe';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  BILLING_PLAN_CATALOG_VERSION,
  BILLING_PLAN_PRICING,
  isSelfServePaidPlanTier,
  quoteTopUp,
} from '@agiworkforce/types';
import { getNeonDb } from '@/lib/server/neon-db';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { recordTermsAcceptance } from '@/lib/server/terms';
import { getStripeClient } from '@/lib/server/stripe-client';
import { getPriceSelectionForCurrency } from '@/lib/server/localized-pricing-service';
import { getPlanSessionUsageBudgetMicrousd } from '@/lib/server/managed-usage-policy';
import { persistProvenActiveWorkspaceSelection } from '@/lib/services/active-workspace-service';
import { CreditService } from '@/lib/services/credit-service';
import {
  ensureSeatMemberCreditAccount,
  resolveEntitlementBundle,
} from '@/lib/services/entitlement-resolution';
import { getManagedUsageSummary } from '@/lib/services/managed-usage-summary-service';
import { SubscriptionService } from '@/lib/services/subscription-service';
import {
  ensureProfileExists,
  grantCreditTopUp,
  updateSubscriptionFromStripeSubscription,
} from '@/app/api/stripe-webhook/lib/db';
import { DEV_ACCOUNT_RECEIPT_PREFIX, devAccountEmail, type DevAccountSpec } from './catalog';
import { assertLocalServerAddress } from './environment';

const USD = 'usd';
const MONTHLY = 'monthly';
const STRIPE_TEST_CARD = 'pm_card_visa';
const DEV_ACCOUNT_STRIPE_METADATA_KEY = 'agi_dev_account';
const PERCENT = 100;

/**
 * Rows that hold what an account has used, bought and chosen, children before
 * the tables they reference. Conversations, projects and files are the
 * account's content and survive a reset; managed_usage_requests stay too,
 * because generated media keeps a restricting reference to them.
 */
const SEEDED_STATE_TABLES = [
  'expiring_credit_purchases',
  'credit_settlement_jobs',
  'credit_idempotency_keys',
  'credit_transactions',
  'bonus_credit_grants',
  'token_credits',
  'free_daily_usage_reservations',
  'usage_events',
  'website_auto_economy_trial_usage',
  'auto_reload_settings',
  'user_settings',
] as const;

export interface DevAccountState {
  plan: string;
  effectivePlan: string;
  status: string;
  billingSource: string;
  fiveHourPercent: number;
  monthlyPercent: number;
  extraUsage: boolean;
  usageCreditsCents: number | null;
}

function serviceDb(): DatabaseAdapter {
  return getNeonDb();
}

function userDb(userId: string): DatabaseAdapter {
  return createClaimedUserScopedDb(serviceDb(), { userId, organizationId: null });
}

export async function assertLocalDatabaseServer(): Promise<void> {
  const [row] = await serviceDb().query<{ address: string | null }>(
    'select inet_server_addr()::text as address',
  );
  assertLocalServerAddress(row?.address ?? null);
}

async function existingTables(): Promise<Set<string>> {
  const rows = await serviceDb().query<{ table_name: string }>(
    `select table_name from information_schema.columns
      where table_schema = 'public' and column_name = 'user_id' and table_name = any($1::text[])`,
    [[...SEEDED_STATE_TABLES]],
  );
  return new Set(rows.map((row) => row.table_name));
}

export async function isDevAccountProvisioned(userId: string): Promise<boolean> {
  const [row] = await serviceDb().query<{ provisioned: boolean }>(
    'select exists(select 1 from public.profiles where id = $1) as provisioned',
    [userId],
  );
  return row?.provisioned === true;
}

async function clearSeededState(userId: string, account: DevAccountSpec): Promise<void> {
  const present = await existingTables();
  await serviceDb().transaction(async (tx) => {
    for (const table of SEEDED_STATE_TABLES) {
      if (!present.has(table)) continue;
      await tx.execute(`delete from public.${table} where user_id = $1`, [userId]);
    }
    if (account.billing === 'none') {
      await tx.execute('delete from public.subscriptions where user_id = $1', [userId]);
    } else {
      await tx.execute(
        'update public.subscriptions set overage_enabled = false, updated_at = now() where user_id = $1',
        [userId],
      );
    }
    await tx.execute(
      'update public.profiles set routing_preferences = null, updated_at = now() where id = $1',
      [userId],
    );
  });
}

function monthAfter(start: Date): Date {
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return end;
}

async function provisionManualSubscription(userId: string, account: DevAccountSpec): Promise<void> {
  const periodStart = new Date();
  const periodEnd = monthAfter(periodStart);
  const [row] = await serviceDb().query<{ id: string }>(
    `insert into public.subscriptions
       (user_id, status, plan_tier, current_period_start, current_period_end,
        cancel_at_period_end, overage_enabled, plan_catalog_version)
     values ($1, 'active', $2, $3, $4, false, $5, $6)
     on conflict (user_id) do update set
       status = excluded.status,
       plan_tier = excluded.plan_tier,
       current_period_start = excluded.current_period_start,
       current_period_end = excluded.current_period_end,
       cancel_at_period_end = false,
       canceled_at = null,
       overage_enabled = excluded.overage_enabled,
       plan_catalog_version = excluded.plan_catalog_version,
       stripe_customer_id = null,
       stripe_subscription_id = null,
       stripe_price_id = null,
       stripe_coupon_id = null,
       apple_original_transaction_id = null,
       google_purchase_token = null,
       last_stripe_event_at = null,
       stripe_state_reconciled_at = null,
       stripe_price_reconciled_at = null,
       updated_at = now()
     returning id`,
    [
      userId,
      account.plan,
      periodStart.toISOString(),
      periodEnd.toISOString(),
      account.extraUsageTopUpUsd !== undefined,
      BILLING_PLAN_CATALOG_VERSION,
    ],
  );
  if (!row) throw new Error(`No subscription row was written for ${account.name}`);
  await SubscriptionService.allocateCreditsForPeriod(
    userId,
    row.id,
    account.plan,
    periodStart,
    periodEnd,
    { db: serviceDb(), catalogVersion: BILLING_PLAN_CATALOG_VERSION },
  );
}

async function findStripeCustomer(stripe: Stripe, userId: string, email: string) {
  const [profile] = await serviceDb().query<{ stripe_customer_id: string | null }>(
    'select stripe_customer_id from public.profiles where id = $1',
    [userId],
  );
  if (profile?.stripe_customer_id) {
    const customer = await stripe.customers.retrieve(profile.stripe_customer_id);
    if (!customer.deleted) return customer;
  }
  const listed = await stripe.customers.list({ email, limit: 10 });
  return listed.data.find((customer) => customer.metadata['user_id'] === userId) ?? null;
}

async function provisionStripeSubscription(userId: string, account: DevAccountSpec): Promise<void> {
  const stripe = getStripeClient();
  const selection = isSelfServePaidPlanTier(account.plan)
    ? await getPriceSelectionForCurrency(account.plan, MONTHLY, USD)
    : null;
  if (!selection) {
    throw new Error(
      `No Stripe test price is configured for ${BILLING_PLAN_PRICING[account.plan].label} monthly in USD.`,
    );
  }
  const email = devAccountEmail(account.name);
  const metadata = {
    user_id: userId,
    plan_tier: account.plan,
    plan_catalog_version: String(BILLING_PLAN_CATALOG_VERSION),
    [DEV_ACCOUNT_STRIPE_METADATA_KEY]: account.name,
  };

  const customer =
    (await findStripeCustomer(stripe, userId, email)) ??
    (await stripe.customers.create({
      email,
      name: `Test ${account.name}`,
      metadata: { user_id: userId, [DEV_ACCOUNT_STRIPE_METADATA_KEY]: account.name },
    }));

  let paymentMethodId =
    typeof customer.invoice_settings.default_payment_method === 'string'
      ? customer.invoice_settings.default_payment_method
      : (customer.invoice_settings.default_payment_method?.id ?? null);
  if (!paymentMethodId) {
    const attached = await stripe.paymentMethods.attach(STRIPE_TEST_CARD, {
      customer: customer.id,
    });
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: attached.id },
    });
    paymentMethodId = attached.id;
  }

  const open = await stripe.subscriptions.list({ customer: customer.id, status: 'all', limit: 20 });
  const current = open.data.find((sub) => sub.status === 'active' || sub.status === 'trialing');
  for (const stale of open.data) {
    if (stale.id === current?.id) continue;
    if (stale.status === 'canceled' || stale.status === 'incomplete_expired') continue;
    await stripe.subscriptions.cancel(stale.id);
  }

  let subscription: Stripe.Subscription;
  if (current) {
    const item = current.items.data[0];
    subscription = await stripe.subscriptions.update(current.id, {
      cancel_at_period_end: false,
      proration_behavior: 'none',
      metadata,
      ...(item && item.price.id !== selection.priceId
        ? { items: [{ id: item.id, price: selection.priceId, quantity: 1 }] }
        : {}),
    });
  } else {
    subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: selection.priceId, quantity: 1 }],
      default_payment_method: paymentMethodId,
      metadata,
    });
  }
  if (subscription.status !== 'active' && subscription.status !== 'trialing') {
    throw new Error(
      `The Stripe test subscription for ${account.name} is ${subscription.status}, not active.`,
    );
  }

  await updateSubscriptionFromStripeSubscription(serviceDb(), stripe, subscription);
  await allocateOpenPeriodCredits(userId, account);
}

/**
 * The webhook allocates a period's credits only when the period is new, and a
 * reset cleared them inside an unchanged period. Allocation is idempotent per
 * period, so this is a no-op when the webhook already made the account.
 */
async function allocateOpenPeriodCredits(userId: string, account: DevAccountSpec): Promise<void> {
  const subscription = await SubscriptionService.getSubscription(serviceDb(), userId);
  if (!subscription) throw new Error(`${account.name} has no subscription after billing.`);
  await SubscriptionService.allocateCreditsForPeriod(
    userId,
    subscription.id,
    subscription.plan_tier,
    subscription.current_period_start,
    subscription.current_period_end,
    { db: serviceDb() },
  );
}

async function ownedOrganizationId(userId: string): Promise<string | null> {
  const [row] = await serviceDb().query<{ organization_id: string }>(
    `select organization_id from public.organization_members
      where user_id = $1 and role = 'owner' and status = 'active'
      order by joined_at asc limit 1`,
    [userId],
  );
  return row?.organization_id ?? null;
}

async function provisionWorkspace(userId: string, account: DevAccountSpec): Promise<void> {
  const seats = account.teamSeats as number;
  const existing = await ownedOrganizationId(userId);
  if (existing) {
    await serviceDb().execute(
      `update public.organizations
          set licensed_seats = $2, billing_plan_tier = $3, licensed_premium_seats = 0,
              seat_billing_updated_at = now(), updated_at = now()
        where id = $1`,
      [existing, seats, account.plan],
    );
    return;
  }
  await serviceDb().transaction(async (tx) => {
    const [created] = await tx.query<{ id: string }>(
      `insert into public.organizations
         (name, slug, created_by, licensed_seats, billing_plan_tier, seat_billing_updated_at,
          licensed_premium_seats)
       values ($1, $2, $3, $4, $5, now(), 0)
       returning id`,
      [`Test workspace (${account.name})`, `agi-dev-${account.name}`, userId, seats, account.plan],
    );
    if (!created) throw new Error(`The ${account.name} workspace was not created`);
    await tx.execute(
      `insert into public.organization_members
         (organization_id, user_id, role, provisioning_source, provisioned_at, joined_at)
       values ($1, $2, 'owner', 'manual', now(), now())`,
      [created.id, userId],
    );
    await persistProvenActiveWorkspaceSelection(tx, userId, created.id);
  });
}

async function provisionSeat(
  userId: string,
  account: DevAccountSpec,
  ownerUserId: string,
): Promise<void> {
  const organizationId = await ownedOrganizationId(ownerUserId);
  if (!organizationId) {
    throw new Error(`${account.seatIn} has no workspace yet; seed it before ${account.name}.`);
  }
  await serviceDb().transaction(async (tx) => {
    await tx.execute(
      `delete from public.organization_members
        where user_id = $1 and organization_id <> $2 and role <> 'owner'`,
      [userId, organizationId],
    );
    await tx.execute(
      `insert into public.organization_members
         (organization_id, user_id, role, provisioning_source, provisioned_at, joined_at)
       values ($1, $2, 'member', 'manual', now(), now())
       on conflict do nothing`,
      [organizationId, userId],
    );
    await persistProvenActiveWorkspaceSelection(tx, userId, organizationId);
  });
  const entitlement = await resolveEntitlementBundle(userDb(userId), userId, {
    workspaceOrganizationId: organizationId,
  });
  if (entitlement.source !== 'seat' || !entitlement.subscription) {
    throw new Error(`${account.name} does not hold a seat in ${account.seatIn}'s workspace.`);
  }
  await ensureSeatMemberCreditAccount(userDb(userId), entitlement.subscription);
}

async function grantExtraUsage(userId: string, account: DevAccountSpec, seedRun: string) {
  const quote = quoteTopUp(account.extraUsageTopUpUsd);
  if (!quote) throw new Error(`$${account.extraUsageTopUpUsd} is not a valid top-up amount.`);
  await grantCreditTopUp(serviceDb(), {
    userId,
    creditAmountCents: quote.budgetCents,
    chargedCents: quote.priceCents,
    chargedCurrency: USD,
    receiptId: `${DEV_ACCOUNT_RECEIPT_PREFIX}:${account.name}:${seedRun}`,
  });
}

async function fillFiveHourWindow(userId: string, account: DevAccountSpec, seedRun: string) {
  const [subscription] = await serviceDb().query<{ plan_catalog_version: number | null }>(
    'select plan_catalog_version from public.subscriptions where user_id = $1',
    [userId],
  );
  const capMicrousd = getPlanSessionUsageBudgetMicrousd({
    tier: account.plan,
    catalogVersion: subscription?.plan_catalog_version ?? null,
    revenueContext: null,
  });
  const amountMicrousd = Math.floor(
    (capMicrousd * (account.fiveHourWindowPercent as number)) / PERCENT,
  );
  if (amountMicrousd <= 0) return;
  const result = await CreditService.settleCreditsDurably(
    {
      userId,
      amountMicrousd,
      description: `Test account ${account.name}: five-hour window seeded`,
      metadata: { dev_account: account.name, is_flagship: false },
      idempotencyKey: `${DEV_ACCOUNT_RECEIPT_PREFIX}:${account.name}:window:${seedRun}`,
    },
    userDb(userId),
  );
  if (!result.success) {
    throw new Error(
      `The five-hour window for ${account.name} was not filled: ${result.code ?? result.status}`,
    );
  }
}

/**
 * Puts one account in its seeded state through the functions the product
 * itself uses to sign a user up, start a plan, sell credits and meter a turn,
 * so every meter reads the result exactly as it reads a real account.
 */
export async function provisionDevAccount(
  account: DevAccountSpec,
  userId: string,
  resolveOwner: (name: string) => string,
): Promise<void> {
  const seedRun = Date.now().toString(36);
  await ensureProfileExists(serviceDb(), userId, devAccountEmail(account.name));
  await recordTermsAcceptance(userId, 'web-signup');
  await clearSeededState(userId, account);

  if (account.billing === 'manual') await provisionManualSubscription(userId, account);
  if (account.billing === 'stripe') await provisionStripeSubscription(userId, account);
  if (account.teamSeats !== undefined) await provisionWorkspace(userId, account);
  if (account.seatIn) await provisionSeat(userId, account, resolveOwner(account.seatIn));
  if (account.extraUsageTopUpUsd !== undefined) await grantExtraUsage(userId, account, seedRun);
  if (account.fiveHourWindowPercent !== undefined) {
    await fillFiveHourWindow(userId, account, seedRun);
  }
}

export async function readDevAccountState(userId: string): Promise<DevAccountState> {
  const db = userDb(userId);
  const [summary, entitlement, billing] = await Promise.all([
    getManagedUsageSummary(db, userId),
    resolveEntitlementBundle(db, userId),
    serviceDb().query<{
      stripe_subscription_id: string | null;
    }>('select stripe_subscription_id from public.subscriptions where user_id = $1', [userId]),
  ]);
  const billingSource =
    entitlement.source === 'seat'
      ? 'workspace seat'
      : billing[0]?.stripe_subscription_id
        ? 'stripe test mode'
        : entitlement.subscription
          ? 'manual'
          : 'none';
  return {
    plan: summary.plan_tier,
    effectivePlan: summary.effective_plan_tier ?? summary.plan_tier,
    status: summary.subscription_status,
    billingSource,
    fiveHourPercent: summary.session_usage_percentage,
    monthlyPercent: summary.usage_percentage,
    extraUsage: summary.overage_enabled === true,
    usageCreditsCents: summary.credit_balance_cents ?? null,
  };
}

export async function closeDatabase(): Promise<void> {
  await serviceDb().dispose();
}
