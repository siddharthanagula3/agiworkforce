'use client';

import { FREE_PLAN_TRAINING_DATA_DISCLOSURE } from '@/lib/compliance/free-plan-training-disclosure';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  FREE_QUOTA_MEDIA_OFFER_PATH,
  FreeQuotaMediaOfferSchema,
  type FreeQuotaMediaCategory,
  type FreeQuotaMediaOffer,
} from '@agiworkforce/cloud-contracts';
import {
  BILLING_PLAN_CAPABILITY_LABELS,
  BILLING_PLAN_PRICING,
  FLAGSHIP_OF_WEEKLY_BUDGET_RATIO,
  canAccessModelForSubscriptionTier,
  canUseBillingPlanCapability,
  compareManagedUsage,
  currencyMinorUnitDigits,
  formatPrivacyModeLabel,
  getAllowedModelsForTier,
  getBillingPlanProductLimits,
  getModelMetadataById,
  getPlanContextWindowTokens,
  isPlanSelectableOnSurface,
  isPerSeatBillingPlan,
  isFreeBillingPlanTier,
  isBasicPlanTier,
  isFreeOfChargePlanTier,
  isProPlanTier,
  isMaxPlanTier,
  isMax15xPlanTier,
  isSelfServeIndividualPlanTier,
  MAX_PURCHASABLE_SEATS,
  MIN_PURCHASABLE_SEATS,
  PROVIDERS_IN_ORDER,
  providerLabels,
  SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER,
  SELF_SERVE_PAID_PLAN_TIERS,
  type BillingInterval,
  type BillingPlanCapability,
  type BillingPlanLimit,
  type BillingPlanTier,
  type SelfServeIndividualPlanTier,
  type SelfServePaidPlanTier,
} from '@agiworkforce/types';
import {
  freeMediaAccess,
  freeMediaLastDayLabel,
  freeMediaPlanStanding,
  type FreeMediaCategoryOffer,
} from '@/features/models/lib/free-media-offer';
import { useAuthStore } from '@shared/stores/authentication-store';
import { useMounted } from '@shared/hooks/useMounted';
import {
  upgradeToBasicPlan,
  upgradeToProPlan,
  upgradeToMaxPlan,
  upgradeToMax15xPlan,
  upgradeToTeamPlan,
  openBillingPortal,
} from '@features/billing/services/stripe-payments';
import {
  UpgradeConfirmDialog,
  type UpgradeConfirmRequest,
} from '@features/billing/components/UpgradeConfirmDialog';
import { UpgradeWaitlistDialog } from '@features/billing/components/UpgradeWaitlistDialog';
import { DowngradeReviewDialog } from '@features/billing/components/DowngradeReviewDialog';
import { fetchPlanChangeState } from '@features/billing/services/billing-account';
import type { UpgradeWaitlistRequest } from '@features/billing/services/upgrade-waitlist';
import { useBillingData } from '@features/billing/hooks/use-billing-queries';
import { formatBillingDate } from '@features/billing/lib/billing-format';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { isBillingPolicyReady } from '@shared/stores/billing-policy';
import {
  billingOwnerPlanActionLabel,
  billingOwnerPlanChangeMessage,
} from '@features/billing/lib/subscription-owner-presentation';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Reveal } from '@/features/marketing/components/Reveal';
import { toUserMessage } from '@/lib/user-error-message';

// The env var is an incident-response kill-switch: set
// NEXT_PUBLIC_CHECKOUT_ENABLED=0 (or 'false'/'off') to re-gate.
//
// NEXT_PUBLIC_CHECKOUT_ENABLED MUST be kept equal to the server-side
// STRIPE_CHECKOUT_ENABLED flag (app/api/checkout/route.ts) and to the same
// server-side checkout flag, see apps/web/.env.example. If they diverge, the
// CTA and the API will disagree about whether checkout is actually available.
const CHECKOUT_ENABLED_RAW = process.env['NEXT_PUBLIC_CHECKOUT_ENABLED']?.trim().toLowerCase();
const CHECKOUT_ENABLED =
  CHECKOUT_ENABLED_RAW !== '0' &&
  CHECKOUT_ENABLED_RAW !== 'false' &&
  CHECKOUT_ENABLED_RAW !== 'off';

type CheckoutPlan = SelfServePaidPlanTier;

const localizedPriceEntrySchema = z.object({
  amountMinor: z.number().int().nonnegative(),
  currency: z.string().regex(/^[a-z]{3}$/i),
  localized: z.boolean(),
  checkoutReady: z.boolean(),
});

const localizedPlanPricesSchema = z.object({
  monthly: localizedPriceEntrySchema.optional(),
  yearly: localizedPriceEntrySchema.optional(),
});

const localizedPricingCatalogSchema = z.object({
  country: z.string().min(2).max(2),
  requestedCurrency: z.string().regex(/^[a-z]{3}$/i),
  plans: z.object({
    basic: localizedPlanPricesSchema,
    pro: localizedPlanPricesSchema,
    max: localizedPlanPricesSchema,
    max_15x: localizedPlanPricesSchema,
    team: localizedPlanPricesSchema,
  }),
});

type LocalizedPricingCatalog = z.infer<typeof localizedPricingCatalogSchema>;

const SERVER_RENDER_PRICE_LOCALE = 'en-US';

function formatPlanAmount(amount: number, currency: string, locale: string | undefined): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatLocalizedAmount(
  entry: z.infer<typeof localizedPriceEntrySchema> | undefined,
  fallbackUsd: number,
  locale: string | undefined,
  divisor = 1,
  multiplier = 1,
): string {
  if (!entry) return formatPlanAmount((fallbackUsd * multiplier) / divisor, 'USD', locale);
  const minorPerUnit = 10 ** currencyMinorUnitDigits(entry.currency);
  return formatPlanAmount(
    (entry.amountMinor * multiplier) / minorPerUnit / divisor,
    entry.currency,
    locale,
  );
}

/**
 * Columns of the full comparison. Declared once so the disclosure summary can
 * count the same list the table renders, rather than a number that drifts.
 */
const COMPARISON_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ['plan', 'Plan'],
  ['price', 'Price'],
  ['billingInterval', 'Billing'],
  ['usageCapacity', 'Managed usage'],
  ['contextWindow', 'Context window'],
  ['managedChat', BILLING_PLAN_CAPABILITY_LABELS.managed_chat],
  ['projects', 'Projects'],
  ['customMcp', 'Custom MCP'],
  ['skillsConnectors', BILLING_PLAN_CAPABILITY_LABELS.skills_connectors],
  ['agiWork', BILLING_PLAN_CAPABILITY_LABELS.agi_work],
  ['imageGeneration', BILLING_PLAN_CAPABILITY_LABELS.image_generation],
  ['videoGeneration', BILLING_PLAN_CAPABILITY_LABELS.video_generation],
  ['apiAccess', BILLING_PLAN_CAPABILITY_LABELS.managed_api],
  ['developerSurfaces', BILLING_PLAN_CAPABILITY_LABELS.developer_surfaces],
  ['teamAdmin', BILLING_PLAN_CAPABILITY_LABELS.team_admin],
  ['enterpriseControls', BILLING_PLAN_CAPABILITY_LABELS.enterprise_controls],
  ['trainingData', 'Trains on your content'],
  ['bestFor', 'Best for'],
];

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="agi-tier-check-icon"
    >
      <path
        d="M2 7L5.5 10.5L12 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Annual savings vs monthly billing, from the canonical billing catalog. */
function annualSavingsPct(plan: { monthlyPriceUsd: number; yearlyPriceUsd: number }): number {
  if (plan.monthlyPriceUsd <= 0 || plan.yearlyPriceUsd <= 0) return 0;
  return Math.round((1 - plan.yearlyPriceUsd / 12 / plan.monthlyPriceUsd) * 100);
}

interface CompareRow {
  planId: BillingPlanTier;
  label: string;
  price: string;
  billingInterval: string;
  usageCapacity: string;
  contextWindow: string;
  managedChat: string;
  projects: string;
  customMcp: string;
  skillsConnectors: string;
  agiWork: string;
  imageGeneration: string;
  videoGeneration: string;
  apiAccess: string;
  developerSurfaces: string;
  teamAdmin: string;
  enterpriseControls: string;
  trainingData: string;
  bestFor: string;
  highlighted?: boolean;
}

// AGI trains on no plan's content. The Free plan is served by providers' free
// models, whose own terms may allow training, so its cell says so.
const UPGRADE_SETTLE_ATTEMPTS = 6;
const UPGRADE_SETTLE_INTERVAL_MS = 1_000;

const TRAINING_DATA_DISCLOSURE = 'No';

function formatLimit(limit: BillingPlanLimit, singular: string, plural: string): string {
  if (limit === 'unlimited') return 'Unlimited';
  if (limit === 'custom') return 'Custom';
  return `${limit} ${limit === 1 ? singular : plural}`;
}

function capabilityCell(plan: BillingPlanTier, capability: BillingPlanCapability): string {
  return canUseBillingPlanCapability(plan, capability) ? 'Yes' : 'No';
}

const NO_FREE_MEDIA_OFFER: FreeQuotaMediaOffer = { image: null, video: null };
const LIMITED_PREVIEW_CELL = 'Limited preview';
const FREE_MEDIA_COPY = {
  both: {
    line: 'freeMediaLineBoth',
    undated: 'freeMediaLineBothUndated',
    feature: 'freeMediaFeatureBoth',
  },
  image: {
    line: 'freeMediaLineImage',
    undated: 'freeMediaLineImageUndated',
    feature: 'freeMediaFeatureImage',
  },
  video: {
    line: 'freeMediaLineVideo',
    undated: 'freeMediaLineVideoUndated',
    feature: 'freeMediaFeatureVideo',
  },
} as const;

function mediaCapabilityCell(
  plan: BillingPlanTier,
  category: FreeQuotaMediaCategory,
  offer: FreeMediaCategoryOffer | null,
): string {
  const standing = freeMediaPlanStanding(plan, category);
  const access = freeMediaAccess({
    planIncludes: standing === 'included',
    offer: standing === 'offer_eligible' ? offer : null,
  });
  if (access.label === 'included') return 'Yes';
  return access.label === 'limited' ? LIMITED_PREVIEW_CELL : 'No';
}

function freeMediaPreview(offer: FreeQuotaMediaOffer): {
  copy: (typeof FREE_MEDIA_COPY)[keyof typeof FREE_MEDIA_COPY];
  lastDay: string | null;
} | null {
  const offered = [offer.image, offer.video].filter((kind) => kind !== null);
  if (offered.length === 0) return null;
  const lastDays = offered.flatMap((kind) => (kind.lastDay === null ? [] : [kind.lastDay]));
  return {
    copy: FREE_MEDIA_COPY[offer.image && offer.video ? 'both' : offer.image ? 'image' : 'video'],
    lastDay:
      lastDays.length === offered.length
        ? lastDays.reduce((latest, candidate) => (candidate > latest ? candidate : latest))
        : null,
  };
}

const CONTEXT_WINDOW_FORMAT = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 2,
});

function contextWindowCell(plan: BillingPlanTier): string {
  const tokens = getPlanContextWindowTokens(plan);
  return tokens === null
    ? 'Model-dependent'
    : `Up to ${CONTEXT_WINDOW_FORMAT.format(tokens)} tokens`;
}

function managedPlanCapabilities(plan: BillingPlanTier, freeMedia: FreeQuotaMediaOffer) {
  const limits = getBillingPlanProductLimits(plan);
  return {
    contextWindow: contextWindowCell(plan),
    managedChat: capabilityCell(plan, 'managed_chat'),
    projects: limits ? formatLimit(limits.projects, 'project', 'projects') : ', ',
    customMcp: limits ? formatLimit(limits.customMcpServers, 'custom MCP', 'custom MCP') : ', ',
    skillsConnectors: capabilityCell(plan, 'skills_connectors'),
    agiWork: capabilityCell(plan, 'agi_work'),
    imageGeneration: mediaCapabilityCell(plan, 'image', freeMedia.image),
    videoGeneration: mediaCapabilityCell(plan, 'video', freeMedia.video),
    apiAccess: capabilityCell(plan, 'managed_api'),
    developerSurfaces: capabilityCell(plan, 'developer_surfaces'),
    teamAdmin: capabilityCell(plan, 'team_admin'),
    enterpriseControls: capabilityCell(plan, 'enterprise_controls'),
    trainingData: isFreeOfChargePlanTier(plan)
      ? FREE_PLAN_TRAINING_DATA_DISCLOSURE
      : TRAINING_DATA_DISCLOSURE,
  };
}

/**
 * A per-provider "models included" matrix generated live from the canonical
 * catalog
 * (packages/contracts/types/src/models.json's `tierAllowedModels`), through
 * the SAME `canAccessModelForSubscriptionTier` gate the in-app model picker
 * enforces (apps/web/features/chat/components/Composer/ComposerFooter.tsx's
 * `modelLock` -> `isModelSelectableForTier` -> that function). Grouped by
 * provider rather than one row per model, models.json's own verificationLog
 * notes the roster changes weekly, and a
 * hand-typed per-model table would rot the moment it did. Team and Enterprise
 * are folded onto Pro's and Max's columns respectively because
 * `canAccessModelForSubscriptionTier` normalizes them to the same access
 * level (`normalizeSubscriptionAccessTier`: team -> pro, and max/enterprise
 * both unlock the full flagship roster), the column headers say so plainly
 * rather than implying four identical columns are different.
 */
const MODEL_ACCESS_COLUMNS: ReadonlyArray<{ label: string; plan: BillingPlanTier }> = [
  { label: BILLING_PLAN_PRICING.free.label, plan: 'free' },
  { label: BILLING_PLAN_PRICING.basic.label, plan: 'basic' },
  { label: `${BILLING_PLAN_PRICING.pro.label} & ${BILLING_PLAN_PRICING.team.label}`, plan: 'pro' },
  {
    label: [
      `${BILLING_PLAN_PRICING.max.label}, ${BILLING_PLAN_PRICING.max_15x.label}`,
      BILLING_PLAN_PRICING.enterprise.label,
    ].join(' & '),
    plan: 'max',
  },
];

const FLAGSHIP_MODEL_COUNT = getAllowedModelsForTier('flagship_additions').length;

interface ModelAccessRow {
  provider: string;
  label: string;
  total: number;
  accessByColumn: number[];
}

function modelAccessByProvider(): ModelAccessRow[] {
  const rosterModelIds = Array.from(
    new Set([
      ...getAllowedModelsForTier('economy'),
      ...getAllowedModelsForTier('pro_additions'),
      ...getAllowedModelsForTier('flagship_additions'),
    ]),
  );

  const modelIdsByProvider = new Map<string, string[]>();
  for (const modelId of rosterModelIds) {
    const metadata = getModelMetadataById(modelId);
    if (!metadata) continue;
    const bucket = modelIdsByProvider.get(metadata.provider) ?? [];
    bucket.push(modelId);
    modelIdsByProvider.set(metadata.provider, bucket);
  }

  return PROVIDERS_IN_ORDER.filter((provider) => modelIdsByProvider.has(provider)).map(
    (provider) => {
      const providerModelIds = modelIdsByProvider.get(provider) ?? [];
      return {
        provider,
        label: providerLabels[provider] ?? provider,
        total: providerModelIds.length,
        accessByColumn: MODEL_ACCESS_COLUMNS.map(
          (column) =>
            providerModelIds.filter((modelId) =>
              canAccessModelForSubscriptionTier(modelId, column.plan),
            ).length,
        ),
      };
    },
  );
}

function formatModelAccess(accessibleCount: number, total: number): string {
  if (accessibleCount === 0) return 'None';
  if (accessibleCount === total) return total === 1 ? 'Included' : `All ${total}`;
  return `${accessibleCount} of ${total}`;
}

export default function PricingPage() {
  const { t } = useTranslation('pricing');
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const authInitialized = useAuthStore((s) => s.initialized);
  const { data: billing, isLoading: billingLoading, refetch: refetchBilling } = useBillingData();
  const accountSubscription = useBillingStore((s) => s.subscription);
  const billingPolicyReady = useBillingStore(isBillingPolicyReady);
  /**
   * The plan is not current the moment /api/upgrade returns.
   *
   * That route answers `activation: 'webhook_pending'`, Stripe has charged, but
   * plan_tier is only written when customer.subscription.updated arrives. A
   * single refetch on confirm therefore races the webhook and usually re-reads
   * the OLD plan, which is what left this page offering "Get Max" next to a
   * toast saying the upgrade had succeeded.
   *
   * So poll, briefly, until the plan actually moves. Bounded because a webhook
   * that never lands must not spin forever: the page then keeps the plan it last
   * read, which the query's own refetch-on-focus corrects.
   */
  const settleUpgradedPlan = useCallback(async () => {
    const planBeforeUpgrade = billing?.plan;
    for (let attempt = 0; attempt < UPGRADE_SETTLE_ATTEMPTS; attempt += 1) {
      const { data } = await refetchBilling();
      if (data?.plan && data.plan !== planBeforeUpgrade) return;
      await new Promise((resolve) => setTimeout(resolve, UPGRADE_SETTLE_INTERVAL_MS));
    }
  }, [billing?.plan, refetchBilling]);

  const [audience, setAudience] = useState<'individual' | 'business'>('individual');
  const [maxVariant, setMaxVariant] = useState<'max' | 'max_15x'>('max');
  const [localizedPricing, setLocalizedPricing] = useState<LocalizedPricingCatalog | null>(null);
  const [pricingStatus, setPricingStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [freeMediaOffer, setFreeMediaOffer] = useState<FreeQuotaMediaOffer>(NO_FREE_MEDIA_OFFER);
  const priceLocale = useMounted() ? undefined : SERVER_RENDER_PRICE_LOCALE;
  const [pendingPlan, setPendingPlan] = useState<CheckoutPlan | null>(null);
  const [portalPending, setPortalPending] = useState(false);
  const [upgradeConfirm, setUpgradeConfirm] = useState<UpgradeConfirmRequest | null>(null);
  const [waitlistRequest, setWaitlistRequest] = useState<UpgradeWaitlistRequest | null>(null);
  const [downgradePlan, setDowngradePlan] = useState<SelfServeIndividualPlanTier | null>(null);
  // Team is billed per seat. Start at the contract minimum of two seats; the
  // buyer picks the real count and the total below updates from it.
  const [teamSeats, setTeamSeats] = useState<number>(MIN_PURCHASABLE_SEATS);
  const [teamAnnualChoice, setTeamAnnualChoice] = useState<boolean | null>(null);
  const [subscribedInterval, setSubscribedInterval] = useState<BillingInterval | null>(null);

  // Team CTAs across marketing, billing, chat upgrades, and Team settings all
  // link to this anchor. The Team card lives behind the business audience tab,
  // so honoring the hash must also reveal that tab; otherwise a buyer lands on
  // the Individual cards with no visible seat selector.
  useEffect(() => {
    const revealTeamPricing = () => {
      if (window.location.hash === '#pricing-team-title') {
        setAudience('business');
        const requestedSeats = Number.parseInt(
          new URLSearchParams(window.location.search).get('seats') ?? '',
          10,
        );
        if (
          Number.isInteger(requestedSeats) &&
          requestedSeats >= MIN_PURCHASABLE_SEATS &&
          requestedSeats <= MAX_PURCHASABLE_SEATS
        ) {
          setTeamSeats(requestedSeats);
        }
      }
    };

    revealTeamPricing();
    window.addEventListener('hashchange', revealTeamPricing);
    return () => window.removeEventListener('hashchange', revealTeamPricing);
  }, []);

  useEffect(() => {
    if (audience !== 'business' || window.location.hash !== '#pricing-team-title') return;
    document.getElementById('pricing-team-title')?.scrollIntoView?.({ block: 'start' });
  }, [audience]);

  // Display the exact same trusted country-derived Stripe prices that Checkout
  // validates server-side. A malformed/unavailable response falls back to the
  // public USD catalog without changing the charged amount.
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/pricing/localized', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Localized pricing is unavailable');
        return response.json();
      })
      .then((value: unknown) => {
        const parsed = localizedPricingCatalogSchema.safeParse(value);
        if (!parsed.success) throw new Error('Localized pricing response is invalid');
        setLocalizedPricing(parsed.data);
        setPricingStatus('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setPricingStatus('error');
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(FREE_QUOTA_MEDIA_OFFER_PATH, { signal: controller.signal })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((value: unknown) => {
        const parsed = FreeQuotaMediaOfferSchema.safeParse(value);
        setFreeMediaOffer(parsed.success ? parsed.data : NO_FREE_MEDIA_OFFER);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const localLabel = formatPrivacyModeLabel('local');
  const byokLabel = formatPrivacyModeLabel('byok');

  const pro = BILLING_PLAN_PRICING.pro;
  const max = BILLING_PLAN_PRICING.max;
  const max15x = BILLING_PLAN_PRICING.max_15x;
  const basic = BILLING_PLAN_PRICING.basic;
  const team = BILLING_PLAN_PRICING.team;

  const localizedPlans = localizedPricing?.plans;
  const proPrice = formatLocalizedAmount(
    localizedPlans?.pro.monthly,
    pro.monthlyPriceUsd,
    priceLocale,
  );
  const basicPrice = formatLocalizedAmount(
    localizedPlans?.basic.monthly,
    basic.monthlyPriceUsd,
    priceLocale,
  );
  const maxPrice = formatLocalizedAmount(
    localizedPlans?.max.monthly,
    max.monthlyPriceUsd,
    priceLocale,
  );
  const max15xPrice = formatLocalizedAmount(
    localizedPlans?.max_15x.monthly,
    max15x.monthlyPriceUsd,
    priceLocale,
  );
  // Per-seat unit price, and the total for the seats currently selected.
  const teamSeatPrice = formatLocalizedAmount(
    localizedPlans?.team.monthly,
    team.monthlyPriceUsd,
    priceLocale,
  );
  const teamTotalPrice = formatLocalizedAmount(
    localizedPlans?.team.monthly,
    team.monthlyPriceUsd,
    priceLocale,
    1,
    teamSeats,
  );
  const hasActivePaidPlan =
    billing != null &&
    !isFreeBillingPlanTier(billing.plan) &&
    ['active', 'trialing'].includes(billing.status ?? '');
  const stripeSubscriber =
    hasActivePaidPlan && accountSubscription?.subscription_source === 'stripe';
  const paymentOverdue =
    billing != null &&
    !isFreeBillingPlanTier(billing.plan) &&
    ['past_due', 'unpaid'].includes(billing.status ?? '');

  useEffect(() => {
    if (!stripeSubscriber) return;
    let cancelled = false;
    fetchPlanChangeState()
      .then((state) => {
        if (!cancelled) setSubscribedInterval(state.price?.interval ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [stripeSubscriber]);

  // Yearly Team is offered ONLY when the yearly Price is configured and its
  // amount matches the catalog (checkoutReady). Absent env → not offered, and
  // the cadence stays monthly (fail-closed at the display layer; the checkout
  // route refuses a yearly Team price it cannot resolve regardless).
  const teamYearlyAvailable = localizedPlans?.team.yearly?.checkoutReady === true;
  const teamAnnual =
    teamAnnualChoice ?? (hasActivePaidPlan ? subscribedInterval === 'yearly' : true);
  const teamInterval: BillingInterval = teamAnnual && teamYearlyAvailable ? 'yearly' : 'monthly';
  const teamSavingsPct = annualSavingsPct(team);
  const teamYearlySeatPricePerMonth = formatLocalizedAmount(
    localizedPlans?.team.yearly,
    team.yearlyPriceUsd,
    priceLocale,
    12,
  );
  const teamYearlyTotalPrice = formatLocalizedAmount(
    localizedPlans?.team.yearly,
    team.yearlyPriceUsd,
    priceLocale,
    1,
    teamSeats,
  );
  const paidPlanSelectionDisabled =
    pendingPlan !== null ||
    !authInitialized ||
    (Boolean(user) && billingLoading) ||
    (Boolean(user) && hasActivePaidPlan && !billingPolicyReady) ||
    !CHECKOUT_ENABLED ||
    (Boolean(user) && !hasActivePaidPlan && pricingStatus !== 'ready');

  function selectedInterval(plan: CheckoutPlan): BillingInterval {
    return isPerSeatBillingPlan(plan) ? teamInterval : 'monthly';
  }

  function selectedPriceEntry(plan: CheckoutPlan) {
    return localizedPlans?.[plan][selectedInterval(plan)];
  }

  function isPlanCheckoutReady(plan: CheckoutPlan): boolean {
    if (!user || hasActivePaidPlan) return true;
    return selectedPriceEntry(plan)?.checkoutReady === true;
  }

  const unavailableCheckoutPlans: CheckoutPlan[] =
    user && !hasActivePaidPlan && !paymentOverdue && pricingStatus === 'ready'
      ? SELF_SERVE_PAID_PLAN_TIERS.filter((plan) => !isPlanCheckoutReady(plan))
      : [];

  function planRelationship(plan: CheckoutPlan): 'upgrade' | 'current' | 'lower' {
    if (!hasActivePaidPlan || !billing) return 'upgrade';

    // A per-seat plan you already own is still actionable: the change on offer
    // is MORE SEATS, which goes through the same mid-cycle upgrade path. Showing
    // a disabled "Current plan" here would dead-end a growing team.
    if (isPerSeatBillingPlan(plan) && isPerSeatBillingPlan(billing.plan)) return 'upgrade';
    if (billing.plan === plan) return 'current';

    // Moving OFF a per-seat organization plan onto an individual plan is not an
    // upgrade in any direction, it would convert an org subscription into a
    // personal one and strand the other seats. Route it through billing.
    if (isPerSeatBillingPlan(billing.plan)) return 'lower';

    // Team has no rank on the individual ladder, but it IS reachable from any
    // individual plan: the upgrade route accepts pro/basic/max -> team.
    if (isPerSeatBillingPlan(plan)) return 'upgrade';

    const currentIndex = SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER.indexOf(
      billing.plan as SelfServeIndividualPlanTier,
    );
    const targetIndex = SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER.indexOf(
      plan as SelfServeIndividualPlanTier,
    );
    return currentIndex < 0 || targetIndex < 0 || targetIndex < currentIndex ? 'lower' : 'upgrade';
  }

  /**
   * `openBillingPortal` navigates away on success, so reaching the catch means
   * it failed. Surfacing it as a toast matters more here than elsewhere: this
   * button is the ONLY exit from a plan the user wants to leave, and a silent
   * failure would restore exactly the dead control it was added to remove.
   */
  async function openPortalFromPricing() {
    if (portalPending) return;
    setPortalPending(true);
    try {
      await openBillingPortal();
    } catch (error) {
      toast.error(toUserMessage(error, 'Could not open the billing portal.'));
      setPortalPending(false);
    }
  }

  function renderPlanAction(plan: CheckoutPlan, upgradeLabel: string) {
    if (!authInitialized) {
      return (
        <button type="button" className="agi-tier-cta" disabled>
          Checking account…
        </button>
      );
    }
    if (paymentOverdue) {
      return (
        <Link href="/settings/billing" className="agi-tier-cta agi-tier-cta--ghost">
          Update payment
        </Link>
      );
    }
    const relationship = planRelationship(plan);
    if (relationship === 'current') {
      return (
        <button type="button" className="agi-tier-cta" disabled>
          Current plan
        </button>
      );
    }
    if (relationship === 'lower') {
      if (billingPolicyReady && accountSubscription?.subscription_source !== 'stripe') {
        return (
          <Link href="/settings/billing" className="agi-tier-cta agi-tier-cta--ghost">
            {billingOwnerPlanActionLabel(accountSubscription?.subscription_source)}
          </Link>
        );
      }
      if (
        billing &&
        isSelfServeIndividualPlanTier(billing.plan) &&
        isSelfServeIndividualPlanTier(plan)
      ) {
        return (
          <button
            type="button"
            className="agi-tier-cta agi-tier-cta--ghost"
            disabled={!billingPolicyReady}
            onClick={() => setDowngradePlan(plan)}
          >
            {t('switchToPlanCta', { plan: BILLING_PLAN_PRICING[plan].label })}
          </button>
        );
      }
      return (
        <button
          type="button"
          className="agi-tier-cta agi-tier-cta--ghost"
          disabled={portalPending}
          onClick={() => void openPortalFromPricing()}
        >
          {portalPending ? 'Opening billing…' : 'Manage billing'}
        </button>
      );
    }
    if (
      hasActivePaidPlan &&
      billingPolicyReady &&
      accountSubscription?.subscription_source !== 'stripe'
    ) {
      return (
        <Link href="/settings/billing" className="agi-tier-cta agi-tier-cta--ghost">
          {billingOwnerPlanActionLabel(accountSubscription?.subscription_source)}
        </Link>
      );
    }
    return (
      <button
        type="button"
        className="agi-tier-cta"
        disabled={paidPlanSelectionDisabled || !isPlanCheckoutReady(plan)}
        onClick={() => void handleUpgrade(plan)}
      >
        {upgradeLabel}
      </button>
    );
  }

  async function handleUpgrade(plan: CheckoutPlan) {
    if (!user) {
      const returnTo = isPerSeatBillingPlan(plan)
        ? `/pricing?seats=${teamSeats}#pricing-team-title`
        : '/pricing';
      router.push(`/login?redirectTo=${encodeURIComponent(returnTo)}`);
      return;
    }

    if (!CHECKOUT_ENABLED) {
      toast.error('Checkout is temporarily unavailable. Please try again later.');
      return;
    }

    if (!hasActivePaidPlan && !isPlanCheckoutReady(plan)) {
      toast.error(`${BILLING_PLAN_PRICING[plan].label} checkout is unavailable in your region.`);
      return;
    }

    // A mid-cycle upgrade charges the saved card immediately with no Stripe
    // screen, so it has to pass through an order screen that prices the
    // proration, names the card and takes assent before anything is charged.
    if (hasActivePaidPlan) {
      if (!billingPolicyReady) {
        toast.error('Billing details are still loading. Please try again in a moment.');
        return;
      }
      if (accountSubscription?.subscription_source !== 'stripe') {
        toast.error(billingOwnerPlanChangeMessage(accountSubscription?.subscription_source));
        return;
      }
      // Team stays on the dialog: its price depends on a seat count and interval
      // chosen here, which /upgrade/[plan] has no picker for.
      if (!isPerSeatBillingPlan(plan)) {
        router.push(`/upgrade/${plan}`);
        return;
      }
      setUpgradeConfirm({
        plan,
        billingInterval: teamInterval,
        ...(isPerSeatBillingPlan(plan) ? { seats: teamSeats } : {}),
      });
      return;
    }

    setWaitlistRequest({
      plan,
      billingInterval: selectedInterval(plan),
      ...(isPerSeatBillingPlan(plan) ? { seats: teamSeats } : {}),
    });
  }

  async function startInitialCheckout(request: UpgradeWaitlistRequest) {
    if (!user) throw new Error('Please sign in to upgrade.');
    setPendingPlan(request.plan);
    const toastId = toast.loading(t('redirectingToCheckout'));
    try {
      const userId = user.id;
      const userEmail = user.email || '';
      if (isBasicPlanTier(request.plan)) {
        await upgradeToBasicPlan({ userId, userEmail });
      } else if (isProPlanTier(request.plan)) {
        await upgradeToProPlan({ userId, userEmail });
      } else if (isMaxPlanTier(request.plan)) {
        await upgradeToMaxPlan({ userId, userEmail });
      } else if (isMax15xPlanTier(request.plan)) {
        await upgradeToMax15xPlan({ userId, userEmail });
      } else if (isPerSeatBillingPlan(request.plan)) {
        await upgradeToTeamPlan({
          seats: request.seats ?? MIN_PURCHASABLE_SEATS,
          ...(request.billingInterval === 'yearly' ? { billingPeriod: 'yearly' } : {}),
        });
      }
      toast.dismiss(toastId);
    } catch (err) {
      toast.dismiss(toastId);
      throw err;
    } finally {
      setPendingPlan(null);
    }
  }

  const freeHref = user ? '/' : '/login?redirectTo=%2F';

  function usageComparisonCopy(plan: BillingPlanTier): string[] {
    const comparison = compareManagedUsage(plan);
    if (!comparison) return [];
    const baseline = BILLING_PLAN_PRICING[comparison.baseline].label;
    if (comparison.factor === 1) {
      return [t(comparison.perSeat ? 'usageSameAsPerSeat' : 'usageSameAs', { baseline })];
    }
    if (comparison.factor !== null) {
      return [
        t(comparison.perSeat ? 'usageMultiplierAllPerSeat' : 'usageMultiplierAll', {
          factor: comparison.factor,
          baseline,
        }),
      ];
    }
    return presentCopy([
      comparison.session === null
        ? null
        : t('usageMultiplierSession', { factor: comparison.session, baseline }),
      comparison.weekly === null
        ? null
        : t('usageMultiplierWeekly', { factor: comparison.weekly, baseline }),
    ]);
  }

  function presentCopy(parts: Array<string | null>): string[] {
    return parts.filter((part): part is string => Boolean(part));
  }

  function usageCapacityCopy(plan: BillingPlanTier): string {
    return usageComparisonCopy(plan).join(' · ');
  }

  const usageExplainer = `${t('usageWindowsExplainer')} ${t('flagshipShare', {
    baseline: pro.label,
    percent: Math.round(FLAGSHIP_OF_WEEKLY_BUDGET_RATIO * 100),
  })}`;

  const mediaPreview = freeMediaPreview(freeMediaOffer);
  const freeMediaLine = mediaPreview
    ? mediaPreview.lastDay
      ? t(mediaPreview.copy.line, {
          date: freeMediaLastDayLabel(mediaPreview.lastDay, priceLocale),
        })
      : t(mediaPreview.copy.undated)
    : null;
  const freeFeatures = presentCopy([
    mediaPreview ? t(mediaPreview.copy.feature) : null,
    t('freeFeature1'),
    t('freeFeature2'),
    t('freeFeature3'),
    t('freeLocalByok'),
  ]);
  const basicFeatures = presentCopy([
    ...usageComparisonCopy('basic'),
    t('basicFeature2'),
    t('basicFeature3'),
    t('basicFeature4'),
    t('basicFeature5'),
    t('basicFeature6'),
  ]);
  const proFeatures = presentCopy([
    ...usageComparisonCopy('pro'),
    t('proFeature2'),
    t('proFeature3'),
    t('proFeature4'),
    t('proFeature5'),
    t('proFeature6'),
  ]);
  const teamFeatures = presentCopy([
    ...usageComparisonCopy('team'),
    t('teamFeature2'),
    t('teamFeature3'),
    t('teamFeature4'),
    t('teamFeature5'),
  ]);
  const maxTierFeatures =
    maxVariant === 'max'
      ? presentCopy([
          ...usageComparisonCopy('max'),
          `All ${FLAGSHIP_MODEL_COUNT} flagship models unlocked for manual selection`,
          t('maxFeature4'),
          t('maxFeature5'),
          t('maxFeature6'),
        ])
      : presentCopy([
          ...usageComparisonCopy('max_15x'),
          t('max15xFeature2'),
          t('max15xFeature3'),
          t('max15xFeature4'),
          t('max15xFeature5'),
          t('max15xFeature6'),
        ]);

  const compareRows: CompareRow[] = [
    {
      planId: 'local-only',
      label: localLabel,
      price: t('free'),
      billingInterval: t('foreverLabel'),
      usageCapacity: t('compareLocalUsage'),
      contextWindow: 'Model-dependent',
      managedChat: 'No',
      projects: 'Device-bound',
      customMcp: 'Unlimited local',
      skillsConnectors: 'Local',
      agiWork: 'Local',
      imageGeneration: 'Model-dependent',
      videoGeneration: 'Model-dependent',
      apiAccess: 'No',
      developerSurfaces: 'Local in the CLI',
      teamAdmin: 'No',
      enterpriseControls: 'No',
      trainingData: TRAINING_DATA_DISCLOSURE,
      bestFor: t('compareLocalBestFor'),
    },
    {
      planId: 'byok',
      label: byokLabel,
      price: t('free'),
      billingInterval: t('foreverLabel'),
      usageCapacity: t('compareByokUsage'),
      contextWindow: 'Provider-dependent',
      managedChat: 'No',
      projects: 'Device-bound',
      customMcp: 'Unlimited custom',
      skillsConnectors: 'Local',
      agiWork: 'Local',
      imageGeneration: 'Provider-dependent',
      videoGeneration: 'Provider-dependent',
      apiAccess: 'Your provider API',
      developerSurfaces: 'Your keys in the CLI',
      teamAdmin: 'No',
      enterpriseControls: 'No',
      trainingData: TRAINING_DATA_DISCLOSURE,
      bestFor: t('compareByokBestFor'),
    },
    {
      planId: 'free',
      label: BILLING_PLAN_PRICING.free.label,
      price: t('free'),
      billingInterval: t('foreverLabel'),
      usageCapacity: t('compareFreeUsage'),
      ...managedPlanCapabilities('free', freeMediaOffer),
      bestFor: t('compareFreeBestFor'),
    },
    {
      planId: 'basic',
      label: basic.label,
      price: `${basicPrice}/mo`,
      billingInterval: t('monthlyOnly'),
      usageCapacity: usageCapacityCopy('basic'),
      ...managedPlanCapabilities('basic', freeMediaOffer),
      bestFor: t('compareBasicBestFor'),
    },
    {
      planId: 'pro',
      label: pro.label,
      price: `${proPrice}/mo`,
      billingInterval: t('monthlyOnly'),
      usageCapacity: usageCapacityCopy('pro'),
      ...managedPlanCapabilities('pro', freeMediaOffer),
      bestFor: t('compareProBestFor'),
    },
    {
      planId: 'max',
      label: max.label,
      price: `${maxPrice}/mo`,
      billingInterval: t('monthlyOnly'),
      usageCapacity: usageCapacityCopy('max'),
      ...managedPlanCapabilities('max', freeMediaOffer),
      bestFor: t('compareMaxBestFor'),
    },
    {
      planId: 'max_15x',
      label: max15x.label,
      price: `${max15xPrice}/mo`,
      billingInterval: t('monthlyOnly'),
      usageCapacity: usageCapacityCopy('max_15x'),
      ...managedPlanCapabilities('max_15x', freeMediaOffer),
      bestFor: 'Highest-capacity work and video generation',
    },
    {
      planId: 'team',
      label: team.label,
      price: teamYearlyAvailable
        ? t('compareTeamPriceYearly', {
            yearly: teamYearlySeatPricePerMonth,
            monthly: teamSeatPrice,
          })
        : t('perSeatPrice', { price: teamSeatPrice }),
      billingInterval: teamYearlyAvailable
        ? t('compareTeamBillingYearly')
        : t('compareTeamBilling'),
      usageCapacity: usageCapacityCopy('team'),
      ...managedPlanCapabilities('team', freeMediaOffer),
      bestFor: t('compareTeamBestFor'),
      highlighted: true,
    },
    {
      planId: 'enterprise',
      label: BILLING_PLAN_PRICING.enterprise.label,
      price: t('custom'),
      billingInterval: t('annualContract'),
      usageCapacity: t('compareEnterpriseUsage'),
      ...managedPlanCapabilities('enterprise', freeMediaOffer),
      bestFor: t('compareEnterpriseBestFor'),
      highlighted: true,
    },
  ];

  // Filtered once: the table renders these and the disclosure summary counts
  // them, so the two can never disagree about how many plans are compared.
  const comparableRows = compareRows.filter((row) => isPlanSelectableOnSurface(row.planId, 'web'));
  const comparablePlanCount = comparableRows.length;

  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section
          className="agi-page-hero"
          aria-labelledby="pricing-hero-title"
          style={{
            borderBottom: 'none',
            paddingTop: 'var(--space-7)',
            paddingBottom: 'var(--space-5)',
          }}
        >
          <h1 id="pricing-hero-title" className="agi-fl-h1">
            {t('pageTitle')}
          </h1>
          <p className="agi-fl-section-lede">{t('heroLede')}</p>
          {freeMediaLine ? (
            <p className="agi-fl-section-lede" style={{ marginTop: 'var(--space-2)' }}>
              {freeMediaLine}
            </p>
          ) : null}
          {!CHECKOUT_ENABLED ? (
            <p
              role="status"
              className="agi-fl-section-lede"
              style={{ marginTop: 'var(--space-2)' }}
            >
              Checkout is temporarily unavailable. Please try again later. Existing plans and
              Enterprise contact are unaffected.
            </p>
          ) : null}
        </section>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 'var(--space-3)',
            marginBottom: 'var(--space-6)',
          }}
        >
          <div
            className="agi-tier-toggle"
            role="group"
            aria-label={t('audienceLabel')}
            style={{ marginBottom: 0 }}
          >
            <button
              type="button"
              aria-pressed={audience === 'individual'}
              onClick={() => setAudience('individual')}
              className={
                audience === 'individual'
                  ? 'agi-tier-toggle-btn agi-tier-toggle-btn--active'
                  : 'agi-tier-toggle-btn'
              }
            >
              {t('audienceIndividual')}
            </button>
            <button
              type="button"
              aria-pressed={audience === 'business'}
              onClick={() => setAudience('business')}
              className={
                audience === 'business'
                  ? 'agi-tier-toggle-btn agi-tier-toggle-btn--active'
                  : 'agi-tier-toggle-btn'
              }
            >
              {t('audienceBusiness')}
            </button>
          </div>
        </div>

        <section
          className="agi-fl-section"
          aria-label={t('audienceBusiness')}
          hidden={audience !== 'business'}
          style={{ paddingTop: 0 }}
        >
          <h2 className="sr-only">{t('audienceBusiness')}</h2>
          <div
            className="agi-tier-grid agi-tier-grid--featured"
            style={{ marginTop: 'var(--space-5)' }}
          >
            <Reveal as="article" className="agi-tier agi-tier--featured">
              <span className="agi-tier-badge">{t('teamBadge')}</span>
              <h3 id="pricing-team-title" className="agi-tier-name">
                {team.label}
              </h3>
              {teamYearlyAvailable ? (
                <div
                  className="agi-tier-toggle"
                  role="group"
                  aria-label="Team billing cadence"
                  style={{ marginBottom: 'var(--space-4)' }}
                >
                  <button
                    type="button"
                    aria-pressed={!teamAnnual}
                    onClick={() => setTeamAnnualChoice(false)}
                    className={
                      teamAnnual
                        ? 'agi-tier-toggle-btn'
                        : 'agi-tier-toggle-btn agi-tier-toggle-btn--active'
                    }
                  >
                    {t('monthly')}
                  </button>
                  <button
                    type="button"
                    aria-pressed={teamAnnual}
                    onClick={() => setTeamAnnualChoice(true)}
                    className={
                      teamAnnual
                        ? 'agi-tier-toggle-btn agi-tier-toggle-btn--active'
                        : 'agi-tier-toggle-btn'
                    }
                  >
                    {t('annual')}{' '}
                    {teamSavingsPct > 0 ? (
                      <span className="agi-tier-toggle-save">
                        {t('annualSave', { pct: teamSavingsPct })}
                      </span>
                    ) : null}
                  </button>
                </div>
              ) : null}
              <p className="agi-tier-price">
                <span className="agi-tier-price-num">
                  {teamInterval === 'yearly' ? teamYearlySeatPricePerMonth : teamSeatPrice}
                </span>{' '}
                <span className="agi-tier-price-sub">{t('perSeatPricingSub')}</span>{' '}
                <span className="agi-tier-price-sub">
                  {teamInterval === 'yearly' ? t('billedYearly') : t('billedMonthly')}
                </span>
              </p>
              <p className="agi-tier-body">{t('teamTierBody')}</p>
              <ul className="agi-tier-features">
                {teamFeatures.map((feature) => (
                  <li key={feature}>
                    <CheckIcon />
                    {feature}
                  </li>
                ))}
              </ul>
              <div
                className="agi-tier-seats"
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
              >
                <label
                  className="agi-tier-seats-label"
                  htmlFor="team-seat-count"
                  style={{ fontSize: 13, color: 'var(--agi-ink-2)' }}
                >
                  {t('seatCountLabel')}
                </label>
                <input
                  id="team-seat-count"
                  className="agi-tier-seats-input"
                  type="number"
                  inputMode="numeric"
                  min={MIN_PURCHASABLE_SEATS}
                  max={MAX_PURCHASABLE_SEATS}
                  step={1}
                  value={teamSeats}
                  style={{
                    width: 88,
                    minHeight: 36,
                    padding: 'var(--space-2) var(--space-3)',
                    background: 'var(--agi-bg-2)',
                    border: '1px solid var(--agi-rule)',
                    borderRadius: 'var(--corner-control)',
                    color: 'var(--agi-ink)',
                    fontSize: 14,
                    fontFamily: 'inherit',
                  }}
                  onChange={(event) => {
                    const parsed = Number.parseInt(event.target.value, 10);
                    if (!Number.isFinite(parsed)) {
                      setTeamSeats(MIN_PURCHASABLE_SEATS);
                      return;
                    }
                    setTeamSeats(
                      Math.min(Math.max(parsed, MIN_PURCHASABLE_SEATS), MAX_PURCHASABLE_SEATS),
                    );
                  }}
                />
              </div>
              <p
                className="agi-tier-seats-total"
                style={{ margin: 0, fontSize: 13, color: 'var(--agi-ink-quiet)' }}
              >
                {teamInterval === 'yearly'
                  ? t('seatTotalAnnual', { seats: teamSeats, total: teamYearlyTotalPrice })
                  : t('seatTotal', { seats: teamSeats, total: teamTotalPrice })}
              </p>
              <div className="agi-tier-cta-group">
                {renderPlanAction(
                  'team',
                  isPerSeatBillingPlan(billing?.plan) ? t('changeSeatsCta') : t('teamCta'),
                )}
              </div>
            </Reveal>

            <Reveal as="article" delay={60} className="agi-tier agi-tier--featured">
              <span className="agi-tier-badge">{t('enterpriseBadge')}</span>
              <h3 className="agi-tier-name">{t('enterpriseHeading')}</h3>
              <p className="agi-tier-price">
                <span className="agi-tier-price-num">{t('custom')}</span>
                <span className="agi-tier-price-sub">{t('customPricingSub')}</span>
              </p>
              <p className="agi-tier-body">
                SSO, SCIM, and audit are shipped and entitlement-gated; we scope capacity, data
                retention, and rollout to how your org actually works. Reach out and we will plan it
                together.
              </p>
              <ul className="agi-tier-features">
                <li>
                  <CheckIcon />
                  {t('enterpriseFeature1')}
                </li>
                <li>
                  <CheckIcon />
                  {t('enterpriseFeature2')}
                </li>
                <li>
                  <CheckIcon />
                  SSO, SCIM directory sync, and audit logs: shipped, gated on the Enterprise
                  plan&apos;s entitlement. Retention windows stay contract-scoped.
                </li>
                <li>
                  <CheckIcon />
                  {t('enterpriseFeature4')}
                </li>
              </ul>
              <div className="agi-tier-cta-group">
                <Link href="/contact-sales" className="agi-tier-cta">
                  {t('contactSalesCta')}
                </Link>
              </div>
            </Reveal>
          </div>
        </section>

        <section
          className="agi-fl-section"
          aria-label={t('audienceIndividual')}
          hidden={audience !== 'individual'}
          style={{ paddingTop: 0 }}
        >
          <h2 className="sr-only">{t('audienceIndividual')}</h2>

          {paymentOverdue ? (
            <p role="alert" className="agi-fl-section-lede" style={{ marginTop: 'var(--space-4)' }}>
              Your last payment didn&rsquo;t go through. Pay the open invoice or update your payment
              method in{' '}
              <Link href="/settings/billing" className="agi-ds-link">
                Billing
              </Link>{' '}
              before you change plans.
            </p>
          ) : null}
          {user && !hasActivePaidPlan && !paymentOverdue && pricingStatus === 'loading' ? (
            <p
              role="status"
              className="agi-fl-section-lede"
              style={{ marginTop: 'var(--space-4)' }}
            >
              Loading checkout availability…
            </p>
          ) : null}
          {user && !hasActivePaidPlan && !paymentOverdue && pricingStatus === 'error' ? (
            <p role="alert" className="agi-fl-section-lede" style={{ marginTop: 'var(--space-4)' }}>
              Checkout availability could not be verified. Refresh this page to try again.
            </p>
          ) : null}
          {unavailableCheckoutPlans.map((plan) => (
            <p
              key={plan}
              role="status"
              className="agi-fl-section-lede"
              style={{ marginTop: 'var(--space-2)' }}
            >
              {BILLING_PLAN_PRICING[plan].label} checkout is not available in your region yet.
            </p>
          ))}

          <div
            className="agi-tier-grid agi-tier-grid--four"
            style={{ marginTop: 'var(--space-5)' }}
          >
            <Reveal as="article" className="agi-tier">
              <h3 className="agi-tier-name">{BILLING_PLAN_PRICING.free.label}</h3>
              <p className="agi-tier-price">
                <span className="agi-tier-price-num">{t('free')}</span>
                <span className="agi-tier-price-sub">{t('foreverLabel')}</span>
              </p>
              <p className="agi-tier-body">{t('freeTierBody')}</p>
              <ul className="agi-tier-features">
                {freeFeatures.map((feature) => (
                  <li key={feature}>
                    <CheckIcon />
                    {feature}
                  </li>
                ))}
              </ul>
              <div className="agi-tier-cta-group">
                <Link href={freeHref} className="agi-tier-cta agi-tier-cta--ghost">
                  {t('freeCta')}
                </Link>
              </div>
            </Reveal>

            {isPlanSelectableOnSurface('basic', 'web') && (
              <Reveal as="article" delay={40} className="agi-tier">
                <h3 className="agi-tier-name">{basic.label}</h3>
                <p className="agi-tier-price">
                  <span className="agi-tier-price-num">{basicPrice}</span>
                  <span className="agi-tier-price-sub">{t('perMonthBilledMonthly')}</span>
                </p>
                <p className="agi-tier-body">{t('basicTierBody')}</p>
                <ul className="agi-tier-features">
                  {basicFeatures.map((feature) => (
                    <li key={feature}>
                      <CheckIcon />
                      {feature}
                    </li>
                  ))}
                </ul>
                <div className="agi-tier-cta-group">{renderPlanAction('basic', t('basicCta'))}</div>
              </Reveal>
            )}

            <Reveal as="article" delay={80} className="agi-tier">
              <h3 className="agi-tier-name">{pro.label}</h3>
              <p className="agi-tier-price">
                <span className="agi-tier-price-num">{proPrice}</span>
                <span className="agi-tier-price-sub">{t('perMonthBilledMonthly')}</span>
              </p>
              <p className="agi-tier-body">{t('proTierBody')}</p>
              <ul className="agi-tier-features">
                {proFeatures.map((feature) => (
                  <li key={feature}>
                    <CheckIcon />
                    {feature}
                  </li>
                ))}
              </ul>
              <div className="agi-tier-cta-group">{renderPlanAction('pro', t('proCta'))}</div>
            </Reveal>

            <Reveal as="article" delay={120} className="agi-tier">
              <div className="agi-tier-head">
                <h3 className="agi-tier-name">{t('maxFamilyName')}</h3>
                <div className="agi-tier-toggle" role="group" aria-label={t('maxVariantLabel')}>
                  <button
                    type="button"
                    aria-pressed={maxVariant === 'max'}
                    aria-label={max.label}
                    onClick={() => setMaxVariant('max')}
                    className={
                      maxVariant === 'max'
                        ? 'agi-tier-toggle-btn agi-tier-toggle-btn--active'
                        : 'agi-tier-toggle-btn'
                    }
                  >
                    {t('maxVariant5x')}
                  </button>
                  <button
                    type="button"
                    aria-pressed={maxVariant === 'max_15x'}
                    aria-label={max15x.label}
                    onClick={() => setMaxVariant('max_15x')}
                    className={
                      maxVariant === 'max_15x'
                        ? 'agi-tier-toggle-btn agi-tier-toggle-btn--active'
                        : 'agi-tier-toggle-btn'
                    }
                  >
                    {t('maxVariant15x')}
                  </button>
                </div>
              </div>
              <p className="agi-tier-price">
                <span className="agi-tier-price-num">
                  {maxVariant === 'max' ? maxPrice : max15xPrice}
                </span>
                <span className="agi-tier-price-sub">{t('perMonthBilledMonthly')}</span>
              </p>
              <p className="agi-tier-body">
                {maxVariant === 'max' ? t('maxTierBody') : t('max15xTierBody')}
              </p>
              <ul className="agi-tier-features">
                {maxTierFeatures.map((feature) => (
                  <li key={feature}>
                    <CheckIcon />
                    {feature}
                  </li>
                ))}
              </ul>
              <div className="agi-tier-cta-group">
                {maxVariant === 'max'
                  ? renderPlanAction('max', t('maxCta'))
                  : renderPlanAction('max_15x', t('max15xCta', { plan: max15x.label }))}
              </div>
            </Reveal>
          </div>
          <p className="agi-fl-section-lede" style={{ marginTop: 'var(--space-5)' }}>
            {usageExplainer}
          </p>
          <p className="agi-fl-section-lede" style={{ marginTop: 'var(--space-2)' }}>
            {t('pricingFootnote')}{' '}
            <Link href="/refund-policy" className="agi-ds-link">
              {t('refundPolicyLink')}
            </Link>
          </p>
        </section>

        <section className="agi-fl-section" aria-labelledby="pricing-compare-title">
          <p className="agi-fl-eyebrow">{t('compareEyebrow')}</p>
          <h2 id="pricing-compare-title" className="agi-fl-h2">
            {t('compareHeading')}
          </h2>
          <p className="agi-fl-section-lede">{t('compareSubheading', { topPlan: max15x.label })}</p>
          <details className="agi-compare-disclosure" open>
            <summary className="agi-compare-summary">
              <span>Full capability table</span>
              <span className="agi-compare-summary-hint">
                {comparablePlanCount} plans across {COMPARISON_COLUMNS.length} capabilities
              </span>
            </summary>
            <div
              aria-label="Scrollable plan comparison"
              role="region"
              tabIndex={0}
              style={{ overflowX: 'auto', marginTop: 'var(--space-5)' }}
            >
              <table
                aria-label="Plan capabilities"
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 13,
                  color: 'var(--agi-ink)',
                }}
              >
                <thead>
                  <tr>
                    {COMPARISON_COLUMNS.map(([col, label]) => (
                      <th
                        key={col}
                        scope="col"
                        style={{
                          textAlign: 'left',
                          padding: 'var(--space-3) var(--space-4)',
                          borderBottom: '1px solid var(--agi-rule-strong)',
                          color: 'var(--agi-ink-quiet)',
                          fontSize: 12,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          fontFamily: 'var(--agi-font-mono)',
                          fontWeight: 500,
                          verticalAlign: 'bottom',
                          minWidth: '9rem',
                        }}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparableRows.map((row, i) => (
                    <tr
                      key={row.planId}
                      style={{
                        background: row.highlighted
                          ? 'var(--agi-amber-soft)'
                          : i % 2 === 0
                            ? 'transparent'
                            : 'var(--agi-bg-2)',
                      }}
                    >
                      <td
                        style={{
                          padding: 'var(--space-4) var(--space-4)',
                          borderBottom: '1px solid var(--agi-rule)',
                          fontWeight: 600,
                          color: row.highlighted ? 'var(--agi-amber)' : 'var(--agi-ink)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {row.label}
                      </td>
                      <td
                        style={{
                          padding: 'var(--space-4) var(--space-4)',
                          borderBottom: '1px solid var(--agi-rule)',
                          color: 'var(--agi-ink)',
                        }}
                      >
                        {row.price}
                      </td>
                      <td
                        style={{
                          padding: 'var(--space-4) var(--space-4)',
                          borderBottom: '1px solid var(--agi-rule)',
                          color: 'var(--agi-ink-2)',
                        }}
                      >
                        {row.billingInterval}
                      </td>
                      <td
                        style={{
                          padding: 'var(--space-4) var(--space-4)',
                          borderBottom: '1px solid var(--agi-rule)',
                          color: 'var(--agi-ink-2)',
                        }}
                      >
                        {row.usageCapacity}
                      </td>
                      {[
                        row.contextWindow,
                        row.managedChat,
                        row.projects,
                        row.customMcp,
                        row.skillsConnectors,
                        row.agiWork,
                        row.imageGeneration,
                        row.videoGeneration,
                        row.apiAccess,
                        row.developerSurfaces,
                        row.teamAdmin,
                        row.enterpriseControls,
                        row.trainingData,
                      ].map((value, index) => (
                        <td
                          key={`${row.planId}-capability-${index}`}
                          style={{
                            padding: 'var(--space-4) var(--space-4)',
                            borderBottom: '1px solid var(--agi-rule)',
                            color: 'var(--agi-ink-2)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {value}
                        </td>
                      ))}
                      <td
                        style={{
                          padding: 'var(--space-4) var(--space-4)',
                          borderBottom: '1px solid var(--agi-rule)',
                          color: 'var(--agi-ink-2)',
                        }}
                      >
                        {row.bestFor}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>

        <section className="agi-fl-section" aria-labelledby="pricing-models-title">
          <p className="agi-fl-eyebrow">Models</p>
          <h2 id="pricing-models-title" className="agi-fl-h2">
            Models included by plan
          </h2>
          <p className="agi-fl-section-lede">
            Auto routes each message to the best model for the task, your plan, and cost; the
            ceiling it can reach rises with the plan. Manual model selection widens the same way:
            this is how many of each provider&apos;s models are reachable at each level, read live
            from our model catalog.
          </p>
          <div
            aria-label="Scrollable model access by plan"
            role="region"
            tabIndex={0}
            style={{ overflowX: 'auto', marginTop: 'var(--space-6)' }}
          >
            <table
              aria-label="Model access by plan"
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13,
                color: 'var(--agi-ink)',
              }}
            >
              <thead>
                <tr>
                  <th
                    scope="col"
                    style={{
                      textAlign: 'left',
                      padding: 'var(--space-3) var(--space-4)',
                      borderBottom: '1px solid var(--agi-rule-strong)',
                      color: 'var(--agi-ink-quiet)',
                      fontSize: 12,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      fontFamily: 'var(--agi-font-mono)',
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Provider
                  </th>
                  {MODEL_ACCESS_COLUMNS.map((column) => (
                    <th
                      key={column.label}
                      scope="col"
                      style={{
                        textAlign: 'left',
                        padding: 'var(--space-3) var(--space-4)',
                        borderBottom: '1px solid var(--agi-rule-strong)',
                        color: 'var(--agi-ink-quiet)',
                        fontSize: 12,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        fontFamily: 'var(--agi-font-mono)',
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {modelAccessByProvider().map((row, i) => (
                  <tr
                    key={row.provider}
                    style={{ background: i % 2 === 0 ? 'transparent' : 'var(--agi-bg-2)' }}
                  >
                    <td
                      style={{
                        padding: 'var(--space-4) var(--space-4)',
                        borderBottom: '1px solid var(--agi-rule)',
                        fontWeight: 600,
                        color: 'var(--agi-ink)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.label}
                    </td>
                    {row.accessByColumn.map((accessibleCount, columnIndex) => (
                      <td
                        key={`${row.provider}-${MODEL_ACCESS_COLUMNS[columnIndex]?.label}`}
                        style={{
                          padding: 'var(--space-4) var(--space-4)',
                          borderBottom: '1px solid var(--agi-rule)',
                          color: 'var(--agi-ink-2)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {formatModelAccess(accessibleCount, row.total)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="pricing-faq-title">
          <p className="agi-fl-eyebrow">Questions</p>
          <h2 id="pricing-faq-title" className="agi-fl-h2">
            Have a question about a plan?
          </h2>
          <p className="agi-fl-section-lede">
            Billing, upgrades, downgrades, cancellations, invoices, and what happens to your data
            are answered on the{' '}
            <Link href="/faq" className="agi-ds-link">
              FAQ
            </Link>
            .
          </p>
        </section>

        <MarketingFooter />
      </main>
      <UpgradeConfirmDialog
        request={upgradeConfirm}
        onCancel={() => setUpgradeConfirm(null)}
        onConfirmed={() => {
          setUpgradeConfirm(null);
          toast.success('Your plan has been upgraded.');
          void settleUpgradedPlan();
        }}
      />
      <UpgradeWaitlistDialog
        request={waitlistRequest}
        onClose={() => setWaitlistRequest(null)}
        onAccessGranted={startInitialCheckout}
      />
      <DowngradeReviewDialog
        open={downgradePlan !== null}
        initialPlan={downgradePlan}
        onClose={() => setDowngradePlan(null)}
        onScheduled={(state) => {
          setDowngradePlan(null);
          const change = state.scheduledChange;
          if (!change) return;
          toast.success(
            t('downgradeScheduledToast', {
              plan: BILLING_PLAN_PRICING[change.plan].label,
              date: formatBillingDate(change.effectiveAt) ?? '',
            }),
          );
        }}
      />
    </div>
  );
}
