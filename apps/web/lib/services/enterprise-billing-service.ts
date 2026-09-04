import 'server-only';

import type Stripe from 'stripe';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { MAX_PURCHASABLE_SEATS } from '@agiworkforce/types';

import { logger } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/security-audit';
import { getEnterpriseProductId, isEnterpriseProductId } from '@/lib/price-tier-mapping';
import { getSubscriptionPeriod } from '@/lib/stripe-types';
import type {
  BillingCadence,
  OrganizationBillingContractRow,
  OrganizationBillingInvoiceRow,
} from '@/lib/server/neon-types';

const QUARTERLY_INTERVAL_COUNT = 3;
const DEFAULT_BILLING_CADENCE: BillingCadence = 'annual';
const QUARTERLY_BILLING_CADENCE: BillingCadence = 'quarterly';
const PROCUREMENT_CUSTOM_FIELD_NAME_PATTERN = /^(po|po\s*number|purchase\s*order)$/iu;
const PROCUREMENT_METADATA_KEY = 'po_number';
const CONTRACT_METADATA_KEY_INCLUDED_USAGE_CENTS_PER_MONTH = 'included_usage_cents_per_month';
const CONTRACT_METADATA_KEY_OVERAGE_PRICE_ID = 'overage_price_id';
const CONTRACT_METADATA_KEY_COMMITTED_USAGE_BLOCK_CENTS = 'committed_usage_block_cents';
const CONTRACT_METADATA_KEY_MINIMUM_ANNUAL_SPEND_CENTS = 'minimum_annual_spend_cents';
const CONTRACT_METADATA_KEY_SUPPORT_TIER = 'support_tier';
const CONTRACT_METADATA_KEY_CUSTOMER_LEGAL_ENTITY = 'customer_legal_entity';
const AUDIT_ENDPOINT = '/api/stripe-webhook';
const AUDIT_SURFACE = 'stripe_webhook';
const UNMAPPED_ENTERPRISE_PRICE_AUDIT_REASON = 'unmapped_stripe_price';

function extractProductId(
  product: string | Stripe.Product | Stripe.DeletedProduct | null | undefined,
): string | null {
  if (!product) return null;
  return typeof product === 'string' ? product : product.id;
}

function extractCustomerId(customer: Stripe.Subscription['customer']): string | null {
  if (!customer) return null;
  return typeof customer === 'string' ? customer : customer.id;
}

function extractInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const current = invoice.parent?.subscription_details?.subscription;
  if (typeof current === 'string') return current;
  if (current?.id) return current.id;
  return (invoice as unknown as { subscription?: string | null }).subscription ?? null;
}

async function resolvePrice(stripe: Stripe, price: Stripe.Price | string): Promise<Stripe.Price> {
  return typeof price === 'string' ? stripe.prices.retrieve(price) : price;
}

function resolveCommittedSeats(subscription: Stripe.Subscription): number {
  const quantity = subscription.items.data[0]?.quantity;
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) return 1;
  return Math.min(quantity, MAX_PURCHASABLE_SEATS);
}

export async function resolveEnterprisePlanTier(
  stripe: Stripe,
  price: Stripe.Price | string | null | undefined,
): Promise<'enterprise' | null> {
  if (!price) return null;
  const resolvedPrice = await resolvePrice(stripe, price);
  const productId = extractProductId(resolvedPrice.product);
  return isEnterpriseProductId(productId) ? 'enterprise' : null;
}

export async function auditUnknownStripePriceIfEnterpriseConfigured(
  stripe: Stripe,
  subscription: Pick<Stripe.Subscription, 'id'>,
  price: Stripe.Price | string | null | undefined,
  priceRegisteredElsewhere: boolean,
): Promise<void> {
  if (priceRegisteredElsewhere || !price) return;
  if (!getEnterpriseProductId()) return;

  const resolvedPrice = await resolvePrice(stripe, price);
  const productId = extractProductId(resolvedPrice.product);
  if (isEnterpriseProductId(productId)) return;

  logger.error(
    { subscriptionId: subscription.id, priceId: resolvedPrice.id, productId },
    'Unknown Stripe product/price on subscription event; neither the enterprise product nor any registered tier price matched',
  );
  await recordAuditEvent({
    userId: null,
    eventType: 'plan_changed',
    severity: 'warning',
    endpoint: AUDIT_ENDPOINT,
    surface: AUDIT_SURFACE,
    detail: {
      resourceType: 'subscription',
      resourceId: subscription.id,
      reason: UNMAPPED_ENTERPRISE_PRICE_AUDIT_REASON,
      source: AUDIT_SURFACE,
    },
  });
}

function resolveBillingCadence(
  recurring: Stripe.Price.Recurring | null | undefined,
): BillingCadence {
  if (recurring?.interval === 'year') return DEFAULT_BILLING_CADENCE;
  if (recurring?.interval === 'month' && recurring.interval_count === QUARTERLY_INTERVAL_COUNT) {
    return QUARTERLY_BILLING_CADENCE;
  }
  return DEFAULT_BILLING_CADENCE;
}

async function resolveProcurementReference(
  stripe: Stripe,
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const latestInvoice = subscription.latest_invoice;
  if (latestInvoice) {
    try {
      const invoice =
        typeof latestInvoice === 'string'
          ? await stripe.invoices.retrieve(latestInvoice)
          : latestInvoice;
      const field = invoice.custom_fields?.find((candidate) =>
        PROCUREMENT_CUSTOM_FIELD_NAME_PATTERN.test(candidate.name.trim()),
      );
      if (field?.value?.trim()) return field.value.trim();
    } catch (error) {
      logger.warn(
        { error, subscriptionId: subscription.id },
        'Could not read the latest invoice custom fields for a PO number',
      );
    }
  }
  const metadataReference = subscription.metadata?.[PROCUREMENT_METADATA_KEY]?.trim();
  return metadataReference || null;
}

async function resolveOrganizationIdForSubscriptionOwner(
  db: DatabaseAdapter,
  stripeSubscriptionId: string,
): Promise<string | null> {
  const [ownerRow] = await db.query<{ user_id: string }>(
    `select user_id from subscriptions where stripe_subscription_id = $1 limit 1`,
    [stripeSubscriptionId],
  );
  const ownerUserId = ownerRow?.user_id;
  if (!ownerUserId) return null;

  const [orgRow] = await db.query<{ id: string }>(
    `select id from public.organizations where owner_user_id = $1 limit 1`,
    [ownerUserId],
  );
  return orgRow?.id ?? null;
}

function parseMetadataNonNegativeCents(
  metadata: Stripe.Metadata | null | undefined,
  key: string,
  subscriptionId: string,
): number | null {
  const raw = metadata?.[key];
  if (raw === undefined) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    logger.error(
      { subscriptionId, key, value: raw },
      'Malformed enterprise contract metadata cents value; ignored',
    );
    return null;
  }
  return parsed;
}

function parseMetadataText(
  metadata: Stripe.Metadata | null | undefined,
  key: string,
): string | null {
  const raw = metadata?.[key]?.trim();
  return raw ? raw : null;
}

interface NegotiatedContractMetadata {
  includedUsageCentsPerPeriod: number | null;
  overagePriceId: string | null;
  committedUsageBlockCents: number | null;
  minimumAnnualSpendCents: number | null;
  supportTier: string | null;
  customerLegalEntity: string | null;
}

function resolveNegotiatedContractMetadata(
  subscription: Stripe.Subscription,
): NegotiatedContractMetadata {
  const metadata = subscription.metadata;
  return {
    includedUsageCentsPerPeriod: parseMetadataNonNegativeCents(
      metadata,
      CONTRACT_METADATA_KEY_INCLUDED_USAGE_CENTS_PER_MONTH,
      subscription.id,
    ),
    overagePriceId: parseMetadataText(metadata, CONTRACT_METADATA_KEY_OVERAGE_PRICE_ID),
    committedUsageBlockCents: parseMetadataNonNegativeCents(
      metadata,
      CONTRACT_METADATA_KEY_COMMITTED_USAGE_BLOCK_CENTS,
      subscription.id,
    ),
    minimumAnnualSpendCents: parseMetadataNonNegativeCents(
      metadata,
      CONTRACT_METADATA_KEY_MINIMUM_ANNUAL_SPEND_CENTS,
      subscription.id,
    ),
    supportTier: parseMetadataText(metadata, CONTRACT_METADATA_KEY_SUPPORT_TIER),
    customerLegalEntity: parseMetadataText(metadata, CONTRACT_METADATA_KEY_CUSTOMER_LEGAL_ENTITY),
  };
}

export async function syncEnterpriseContractFromSubscription(
  db: DatabaseAdapter,
  stripe: Stripe,
  subscription: Stripe.Subscription,
): Promise<void> {
  const item = subscription.items.data[0];
  if (!item) return;

  const enterpriseTier = await resolveEnterprisePlanTier(stripe, item.price);
  if (!enterpriseTier) return;

  const organizationId = await resolveOrganizationIdForSubscriptionOwner(db, subscription.id);
  if (!organizationId) {
    logger.warn(
      { subscriptionId: subscription.id },
      'Enterprise subscription has no owning organization yet; contract not synced',
    );
    return;
  }

  const resolvedPrice = await resolvePrice(stripe, item.price);
  const productId = extractProductId(resolvedPrice.product);
  if (!productId) {
    logger.error(
      { subscriptionId: subscription.id, priceId: resolvedPrice.id },
      'Enterprise subscription price resolved with no product id; contract not synced',
    );
    return;
  }

  const period = getSubscriptionPeriod(subscription);
  const cadence = resolveBillingCadence(resolvedPrice.recurring);
  const procurementReference = await resolveProcurementReference(stripe, subscription);
  const committedSeats = resolveCommittedSeats(subscription);
  const stripeCustomerId = extractCustomerId(subscription.customer);
  const negotiated = resolveNegotiatedContractMetadata(subscription);

  await db.execute(
    `insert into public.organization_billing_contracts
       (organization_id, stripe_customer_id, stripe_subscription_id, stripe_product_id, stripe_price_id,
        procurement_reference, contract_term_start, contract_term_end, billing_cadence, committed_seats,
        included_usage_cents_per_period, overage_stripe_price_id, committed_usage_block_cents,
        minimum_annual_spend_cents, support_tier, customer_legal_entity)
     values (
       $1::uuid, $2::text, $3::text, $4::text, $5::text, $6::text, $7::date, $8::date, $9::text, $10::integer,
       coalesce($11::bigint, 0), $12::text, coalesce($13::bigint, 0), coalesce($14::bigint, 0), $15::text, $16::text
     )
     on conflict (organization_id) do update set
       stripe_customer_id = excluded.stripe_customer_id,
       stripe_subscription_id = excluded.stripe_subscription_id,
       stripe_product_id = excluded.stripe_product_id,
       stripe_price_id = excluded.stripe_price_id,
       procurement_reference = coalesce(
         $6::text,
         organization_billing_contracts.procurement_reference
       ),
       contract_term_start = excluded.contract_term_start,
       contract_term_end = excluded.contract_term_end,
       billing_cadence = excluded.billing_cadence,
       committed_seats = excluded.committed_seats,
       included_usage_cents_per_period = coalesce(
         $11::bigint,
         organization_billing_contracts.included_usage_cents_per_period
       ),
       overage_stripe_price_id = coalesce(
         $12::text,
         organization_billing_contracts.overage_stripe_price_id
       ),
       committed_usage_block_cents = coalesce(
         $13::bigint,
         organization_billing_contracts.committed_usage_block_cents
       ),
       minimum_annual_spend_cents = coalesce(
         $14::bigint,
         organization_billing_contracts.minimum_annual_spend_cents
       ),
       support_tier = coalesce($15::text, organization_billing_contracts.support_tier),
       customer_legal_entity = coalesce(
         $16::text,
         organization_billing_contracts.customer_legal_entity
       )`,
    [
      organizationId,
      stripeCustomerId,
      subscription.id,
      productId,
      resolvedPrice.id,
      procurementReference,
      period ? isoDate(period.start) : null,
      period ? isoDate(period.end) : null,
      cadence,
      committedSeats,
      negotiated.includedUsageCentsPerPeriod,
      negotiated.overagePriceId,
      negotiated.committedUsageBlockCents,
      negotiated.minimumAnnualSpendCents,
      negotiated.supportTier,
      negotiated.customerLegalEntity,
    ],
  );

  logger.info(
    { organizationId, subscriptionId: subscription.id, committedSeats, cadence },
    'Enterprise billing contract synced from Stripe subscription',
  );
}

function isoDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

function isoTimestamp(unixSeconds: number | null | undefined): string | null {
  return typeof unixSeconds === 'number' ? new Date(unixSeconds * 1000).toISOString() : null;
}

async function recomputeOldestOpenInvoice(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<void> {
  const [oldest] = await db.query<{ stripe_invoice_id: string; due_at: string | null }>(
    `select stripe_invoice_id, due_at
       from public.organization_billing_invoices
      where organization_id = $1
        and status = 'open'
      order by due_at asc nulls last
      limit 1`,
    [organizationId],
  );

  await db.execute(
    `update public.organization_billing_contracts
        set oldest_open_invoice_id = $2::text,
            oldest_open_invoice_due_at = $3::timestamptz
      where organization_id = $1::uuid`,
    [organizationId, oldest?.stripe_invoice_id ?? null, oldest?.due_at ?? null],
  );
}

function resolveInvoiceProcurementReference(invoice: Stripe.Invoice): string | null {
  const field = invoice.custom_fields?.find((candidate) =>
    PROCUREMENT_CUSTOM_FIELD_NAME_PATTERN.test(candidate.name.trim()),
  );
  return field?.value?.trim() || null;
}

export async function recordEnterpriseInvoiceEvent(
  db: DatabaseAdapter,
  invoice: Stripe.Invoice,
): Promise<void> {
  if (!invoice.id) return;
  const stripeSubscriptionId = extractInvoiceSubscriptionId(invoice);
  if (!stripeSubscriptionId) return;

  const [contract] = await db.query<Pick<OrganizationBillingContractRow, 'organization_id'>>(
    `select organization_id
       from public.organization_billing_contracts
      where stripe_subscription_id = $1
      limit 1`,
    [stripeSubscriptionId],
  );
  const organizationId = contract?.organization_id;
  if (!organizationId) return;

  await db.execute(
    `insert into public.organization_billing_invoices
       (stripe_invoice_id, organization_id, stripe_subscription_id, invoice_number, status, collection_method,
        amount_due_cents, amount_paid_cents, currency, procurement_reference, period_start, period_end, due_at,
        paid_at, voided_at, hosted_invoice_url, invoice_pdf_url)
     values (
       $1::text, $2::uuid, $3::text, $4::text, $5::text, $6::text, $7::bigint, $8::bigint, $9::text,
       $10::text, $11::timestamptz, $12::timestamptz, $13::timestamptz, $14::timestamptz, $15::timestamptz,
       $16::text, $17::text
     )
     on conflict (stripe_invoice_id) do update set
       organization_id = excluded.organization_id,
       stripe_subscription_id = excluded.stripe_subscription_id,
       invoice_number = excluded.invoice_number,
       status = excluded.status,
       collection_method = excluded.collection_method,
       amount_due_cents = excluded.amount_due_cents,
       amount_paid_cents = excluded.amount_paid_cents,
       currency = excluded.currency,
       procurement_reference = coalesce(
         $10::text,
         organization_billing_invoices.procurement_reference
       ),
       period_start = excluded.period_start,
       period_end = excluded.period_end,
       due_at = excluded.due_at,
       paid_at = excluded.paid_at,
       voided_at = excluded.voided_at,
       hosted_invoice_url = excluded.hosted_invoice_url,
       invoice_pdf_url = excluded.invoice_pdf_url`,
    [
      invoice.id,
      organizationId,
      stripeSubscriptionId,
      invoice.number ?? null,
      invoice.status ?? 'draft',
      invoice.collection_method ?? null,
      invoice.amount_due ?? 0,
      invoice.amount_paid ?? 0,
      invoice.currency,
      resolveInvoiceProcurementReference(invoice),
      isoTimestamp(invoice.period_start),
      isoTimestamp(invoice.period_end),
      isoTimestamp(invoice.due_date),
      isoTimestamp(invoice.status_transitions?.paid_at),
      isoTimestamp(invoice.status_transitions?.voided_at),
      invoice.hosted_invoice_url ?? null,
      invoice.invoice_pdf ?? null,
    ],
  );

  await recomputeOldestOpenInvoice(db, organizationId);
}

export async function endEnterpriseContractIfPresent(
  db: DatabaseAdapter,
  stripeSubscriptionId: string,
  endedAtIso: string,
): Promise<void> {
  await db.execute(
    `update public.organization_billing_contracts
        set ended_at = $2::timestamptz
      where stripe_subscription_id = $1::text
        and ended_at is null`,
    [stripeSubscriptionId, endedAtIso],
  );
}

export type { OrganizationBillingContractRow, OrganizationBillingInvoiceRow };
