'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  BILLING_PLAN_PRICING,
  canAccessModelForSubscriptionTier,
  canUseBillingPlanCapability,
  formatPrivacyModeLabel,
  getAllowedModelsForTier,
  getBillingPlanProductLimits,
  getModelMetadataById,
  isPlanSelectableOnSurface,
  isPerSeatBillingPlan,
  isFreeBillingPlanTier,
  isBasicPlanTier,
  isProPlanTier,
  isMaxPlanTier,
  isMax15xPlanTier,
  MAX_PURCHASABLE_SEATS,
  MIN_PURCHASABLE_SEATS,
  PROVIDERS_IN_ORDER,
  providerLabels,
  SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER,
  SELF_SERVE_PAID_PLAN_TIERS,
  type BillingInterval,
  type BillingPlanLimit,
  type BillingPlanTier,
  type SelfServeIndividualPlanTier,
  type SelfServePaidPlanTier,
} from '@agiworkforce/types';
import { useAuthStore } from '@shared/stores/authentication-store';
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
import { useBillingData } from '@features/billing/hooks/use-billing-queries';
import { managedUsageMultiplier } from '@/lib/billing/managed-usage-caps';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { isBillingPolicyReady } from '@shared/stores/billing-policy';
import {
  billingOwnerPlanActionLabel,
  billingOwnerPlanChangeMessage,
} from '@features/billing/lib/subscription-owner-presentation';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Container, Eyebrow, Prose, ScrollableTable } from '@/features/marketing/components/system';
import { toUserMessage } from '@/lib/user-error-message';
import '@/features/marketing/components/pages/business/pricing.css';
import '@/features/marketing/components/pages/business/data-table.css';

// Paid-plan checkout (2026-07-04): open by default, matching the
// managed-compute public-alpha decision (2026-06-27, lib/managed-compute-gate.ts).
// The env var is retained ONLY as an incident-response kill-switch: set
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

function formatLocalizedAmount(
  entry: z.infer<typeof localizedPriceEntrySchema> | undefined,
  fallbackUsd: number,
  divisor = 1,
  multiplier = 1,
): string {
  if (!entry) return `$${((fallbackUsd * multiplier) / divisor).toFixed(2).replace(/\.00$/, '')}`;
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: entry.currency.toUpperCase(),
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format((entry.amountMinor * multiplier) / 100 / divisor);
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
  ['projects', 'Projects'],
  ['customMcp', 'Custom MCP'],
  ['skillsConnectors', 'Skills & connectors'],
  ['agiWork', 'AGI Work'],
  ['imageGeneration', 'Images'],
  ['videoGeneration', 'Video'],
  ['apiAccess', 'Managed API'],
  ['developerSurfaces', 'Developer surfaces'],
  ['teamControls', 'Team controls'],
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
      className="agi-ds-tier-check-icon"
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
  projects: string;
  customMcp: string;
  skillsConnectors: string;
  agiWork: string;
  imageGeneration: string;
  videoGeneration: string;
  apiAccess: string;
  developerSurfaces: string;
  teamControls: string;
  trainingData: string;
  bestFor: string;
  highlighted?: boolean;
}

/**
 * The training-data-use row is unconditional and identical across every trust
 * mode and plan, apps/web/app/privacy/page.tsx states plainly that "AGI does
 * not use customer conversation content to train AGI-owned models", so the row
 * is a single constant rather than a per-plan derivation; there is no
 * weaker/stronger variant by tier to compute.
 */
const UPGRADE_SETTLE_ATTEMPTS = 6;
const UPGRADE_SETTLE_INTERVAL_MS = 1_000;

const TRAINING_DATA_DISCLOSURE = 'No';

function formatLimit(limit: BillingPlanLimit, singular: string, plural: string): string {
  if (limit === 'unlimited') return 'Unlimited';
  if (limit === 'custom') return 'Custom';
  return `${limit} ${limit === 1 ? singular : plural}`;
}

function managedPlanCapabilities(plan: BillingPlanTier) {
  const limits = getBillingPlanProductLimits(plan);
  return {
    projects: limits ? formatLimit(limits.projects, 'project', 'projects') : ', ',
    customMcp: limits ? formatLimit(limits.customMcpServers, 'custom MCP', 'custom MCP') : ', ',
    skillsConnectors: canUseBillingPlanCapability(plan, 'skills_connectors') ? 'Yes' : 'No',
    agiWork: canUseBillingPlanCapability(plan, 'agi_work') ? 'Yes' : 'No',
    imageGeneration: canUseBillingPlanCapability(plan, 'image_generation') ? 'Yes' : 'No',
    videoGeneration: canUseBillingPlanCapability(plan, 'video_generation') ? 'Yes' : 'No',
    apiAccess: canUseBillingPlanCapability(plan, 'managed_api') ? 'Yes' : 'No',
    developerSurfaces: canUseBillingPlanCapability(plan, 'developer_surfaces')
      ? 'CLI, Chrome & VS Code'
      : 'No managed access',
    // SSO and SCIM directory sync are implemented and entitlement-gated on
    // `enterprise_controls` (apps/web/features/admin/pages/AdminConsolePage.tsx's
    // "Implemented, entitlement-gated" Identity row; live routes at
    // /api/admin/sso and /api/scim/v2), which today only the Enterprise plan
    // carries. Team gets the underlying `team_admin` controls without those.
    teamControls: canUseBillingPlanCapability(plan, 'enterprise_controls')
      ? 'SSO, SCIM & admin'
      : canUseBillingPlanCapability(plan, 'team_admin')
        ? 'Yes'
        : 'No',
    trainingData: TRAINING_DATA_DISCLOSURE,
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

  // Nine billing tiers exist, but showing all nine at once is where people stall.
  // ChatGPT and Claude both segment by audience first and then show three or four
  // cards; `audience` is that first cut, and `maxVariant` keeps Max 5x and Max 15x
  // in one card so the individual grid really does hold the four it is classed for.
  const [audience, setAudience] = useState<'individual' | 'business'>('individual');
  const [maxVariant, setMaxVariant] = useState<'max' | 'max_15x'>('max');
  const [annual, setAnnual] = useState(false);
  const [localizedPricing, setLocalizedPricing] = useState<LocalizedPricingCatalog | null>(null);
  const [pricingStatus, setPricingStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [pendingPlan, setPendingPlan] = useState<CheckoutPlan | null>(null);
  const [portalPending, setPortalPending] = useState(false);
  const [upgradeConfirm, setUpgradeConfirm] = useState<UpgradeConfirmRequest | null>(null);
  // Team is billed per seat. Start at the contract minimum of two seats; the
  // buyer picks the real count and the total below updates from it.
  const [teamSeats, setTeamSeats] = useState<number>(MIN_PURCHASABLE_SEATS);
  // Team billing cadence is independent of the individual-plan `annual` toggle
  // (different section, different product). Defaults to monthly and only becomes
  // yearly when the yearly Team Price is actually configured and checkout-ready.
  const [teamAnnual, setTeamAnnual] = useState(false);

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

  const localLabel = formatPrivacyModeLabel('local');
  const byokLabel = formatPrivacyModeLabel('byok');

  const pro = BILLING_PLAN_PRICING.pro;
  const max = BILLING_PLAN_PRICING.max;
  const max15x = BILLING_PLAN_PRICING.max_15x;
  const basic = BILLING_PLAN_PRICING.basic;
  const team = BILLING_PLAN_PRICING.team;

  const proSavingsPct = annualSavingsPct(pro);

  const localizedPlans = localizedPricing?.plans;
  const proPrice = annual
    ? formatLocalizedAmount(localizedPlans?.pro.yearly, pro.yearlyPriceUsd, 12)
    : formatLocalizedAmount(localizedPlans?.pro.monthly, pro.monthlyPriceUsd);
  const basicPrice = formatLocalizedAmount(localizedPlans?.basic.monthly, basic.monthlyPriceUsd);
  const maxPrice = formatLocalizedAmount(localizedPlans?.max.monthly, max.monthlyPriceUsd);
  const max15xPrice = formatLocalizedAmount(
    localizedPlans?.max_15x.monthly,
    max15x.monthlyPriceUsd,
  );
  // Per-seat unit price, and the total for the seats currently selected.
  const teamSeatPrice = formatLocalizedAmount(localizedPlans?.team.monthly, team.monthlyPriceUsd);
  const teamTotalPrice = formatLocalizedAmount(
    localizedPlans?.team.monthly,
    team.monthlyPriceUsd,
    1,
    teamSeats,
  );
  // Yearly Team is offered ONLY when the yearly Price is configured and its
  // amount matches the catalog (checkoutReady). Absent env → not offered, and
  // the cadence stays monthly (fail-closed at the display layer; the checkout
  // route refuses a yearly Team price it cannot resolve regardless).
  const teamYearlyAvailable = localizedPlans?.team.yearly?.checkoutReady === true;
  const teamInterval: BillingInterval = teamAnnual && teamYearlyAvailable ? 'yearly' : 'monthly';
  const teamSavingsPct = annualSavingsPct(team);
  // The annual seat price normalised to a month, so the cadence toggle compares
  // like with like ($25/seat/mo against $20/seat/mo) instead of asking the
  // reader to divide $240 by twelve. What is charged is still the yearly amount,
  // which the cadence line above states.
  const teamYearlySeatPricePerMonth = formatLocalizedAmount(
    localizedPlans?.team.yearly,
    team.yearlyPriceUsd,
    12,
  );
  const teamYearlyTotalPrice = formatLocalizedAmount(
    localizedPlans?.team.yearly,
    team.yearlyPriceUsd,
    1,
    teamSeats,
  );
  const hasActivePaidPlan =
    billing != null &&
    !isFreeBillingPlanTier(billing.plan) &&
    ['active', 'trialing'].includes(billing.status ?? '');
  const paidPlanSelectionDisabled =
    pendingPlan !== null ||
    !authInitialized ||
    (Boolean(user) && billingLoading) ||
    (Boolean(user) && hasActivePaidPlan && !billingPolicyReady) ||
    !CHECKOUT_ENABLED ||
    (Boolean(user) && !hasActivePaidPlan && pricingStatus !== 'ready');

  function selectedPriceEntry(plan: CheckoutPlan) {
    const interval: BillingInterval = isProPlanTier(plan)
      ? annual
        ? 'yearly'
        : 'monthly'
      : isPerSeatBillingPlan(plan)
        ? teamInterval
        : 'monthly';
    return localizedPlans?.[plan][interval];
  }

  function isPlanCheckoutReady(plan: CheckoutPlan): boolean {
    if (!user || hasActivePaidPlan) return true;
    return selectedPriceEntry(plan)?.checkoutReady === true;
  }

  const unavailableCheckoutPlans: CheckoutPlan[] =
    user && !hasActivePaidPlan && pricingStatus === 'ready'
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
        <button type="button" className="agi-ds-btn" data-variant="primary" disabled>
          Checking account…
        </button>
      );
    }
    const relationship = planRelationship(plan);
    if (relationship === 'current') {
      return (
        <button type="button" className="agi-ds-btn" data-variant="primary" disabled>
          Current plan
        </button>
      );
    }
    if (relationship === 'lower') {
      // Opens the Stripe Customer Portal, which is the only surface that can
      // actually perform a downgrade. This used to be `<Link href="/billing">`,
      // and that closed a loop with no exit: /billing redirects to
      // /settings/billing, which opens the Billing settings modal, the exact
      // screen whose "Adjust plan" button sent the user to /pricing in the
      // first place. A Max 15x subscriber who wanted Max 5x could go
      // Settings → Adjust plan → Pricing → 5x → Manage billing → Settings,
      // forever, and never reach a control that changes the plan.
      //
      // BillingSection hit the identical bug and was fixed the same way; this
      // copy of it was missed. See the note on `openPortal` there.
      return (
        <button
          type="button"
          className="agi-ds-btn"
          data-variant="secondary"
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
        <Link href="/settings/billing" className="agi-ds-btn" data-variant="secondary">
          {billingOwnerPlanActionLabel(accountSubscription?.subscription_source)}
        </Link>
      );
    }
    return (
      <button
        type="button"
        className="agi-ds-btn"
        data-variant="primary"
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
        const yearly = isProPlanTier(plan) && annual;
        router.push(`/upgrade/${plan}${yearly ? '?interval=yearly' : ''}`);
        return;
      }
      setUpgradeConfirm({
        plan,
        billingInterval: teamInterval,
        ...(isPerSeatBillingPlan(plan) ? { seats: teamSeats } : {}),
      });
      return;
    }

    setPendingPlan(plan);
    const toastId = toast.loading(t('redirectingToCheckout'));
    try {
      const userId = user.id;
      const userEmail = user.email || '';
      if (isBasicPlanTier(plan)) {
        await upgradeToBasicPlan({ userId, userEmail });
      } else if (isProPlanTier(plan)) {
        await upgradeToProPlan({ userId, userEmail, billingPeriod: annual ? 'yearly' : 'monthly' });
      } else if (isMaxPlanTier(plan)) {
        await upgradeToMaxPlan({ userId, userEmail });
      } else if (isMax15xPlanTier(plan)) {
        await upgradeToMax15xPlan({ userId, userEmail });
      } else if (isPerSeatBillingPlan(plan)) {
        await upgradeToTeamPlan({
          seats: teamSeats,
          ...(teamInterval === 'yearly' ? { billingPeriod: 'yearly' } : {}),
        });
      }
      toast.dismiss(toastId);
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(toUserMessage(err, t('checkoutFailed')));
    } finally {
      setPendingPlan(null);
    }
  }

  const freeHref = user ? '/' : '/login?redirectTo=%2F';

  const max15xUsageMultiplier = managedUsageMultiplier('max_15x', 'pro');
  const max15xUsage =
    max15xUsageMultiplier === null ? ', ' : `${max15xUsageMultiplier}x ${pro.label} usage`;

  const maxTierFeatures =
    maxVariant === 'max'
      ? [
          t('maxFeature1'),
          `All ${FLAGSHIP_MODEL_COUNT} flagship models unlocked for manual selection`,
          t('maxFeature4'),
          t('maxFeature5'),
          t('maxFeature6'),
        ]
      : [
          t('max15xFeature1'),
          t('max15xFeature2'),
          t('max15xFeature3'),
          t('max15xFeature4'),
          t('max15xFeature5'),
          t('max15xFeature6'),
        ];

  const compareRows: CompareRow[] = [
    {
      planId: 'local-only',
      label: localLabel,
      price: t('free'),
      billingInterval: t('foreverLabel'),
      usageCapacity: t('compareLocalUsage'),
      projects: 'Device-bound',
      customMcp: 'Unlimited local',
      skillsConnectors: 'Local',
      agiWork: 'Local',
      imageGeneration: 'Model-dependent',
      videoGeneration: 'Model-dependent',
      apiAccess: 'No managed access',
      developerSurfaces: 'Desktop, CLI & VS Code',
      teamControls: 'No',
      trainingData: TRAINING_DATA_DISCLOSURE,
      bestFor: t('compareLocalBestFor'),
    },
    {
      planId: 'byok',
      label: byokLabel,
      price: t('free'),
      billingInterval: t('foreverLabel'),
      usageCapacity: t('compareByokUsage'),
      projects: 'Device-bound',
      customMcp: 'Unlimited custom',
      skillsConnectors: 'Local',
      agiWork: 'Local',
      imageGeneration: 'Provider-dependent',
      videoGeneration: 'Provider-dependent',
      apiAccess: 'Your provider API',
      developerSurfaces: 'Desktop, CLI & VS Code',
      teamControls: 'No',
      trainingData: TRAINING_DATA_DISCLOSURE,
      bestFor: t('compareByokBestFor'),
    },
    {
      planId: 'free',
      label: BILLING_PLAN_PRICING.free.label,
      price: t('free'),
      billingInterval: t('foreverLabel'),
      usageCapacity: t('compareFreeUsage'),
      ...managedPlanCapabilities('free'),
      bestFor: t('compareFreeBestFor'),
    },
    {
      planId: 'basic',
      label: basic.label,
      price: `${basicPrice}/mo`,
      billingInterval: t('monthly'),
      usageCapacity: t('compareBasicUsage'),
      ...managedPlanCapabilities('basic'),
      bestFor: t('compareBasicBestFor'),
    },
    {
      planId: 'pro',
      label: pro.label,
      price: `${formatLocalizedAmount(localizedPlans?.pro.monthly, pro.monthlyPriceUsd)}/mo`,
      billingInterval: t('compareProInterval', {
        yearly: formatLocalizedAmount(localizedPlans?.pro.yearly, pro.yearlyPriceUsd, 12),
      }),
      usageCapacity: t('compareProUsage'),
      ...managedPlanCapabilities('pro'),
      bestFor: t('compareProBestFor'),
    },
    {
      planId: 'max',
      label: max.label,
      price: `${maxPrice}/mo`,
      billingInterval: t('monthlyOnly'),
      usageCapacity: t('compareMaxUsage'),
      ...managedPlanCapabilities('max'),
      bestFor: t('compareMaxBestFor'),
    },
    {
      planId: 'max_15x',
      label: max15x.label,
      price: `${max15xPrice}/mo`,
      billingInterval: t('monthlyOnly'),
      usageCapacity: max15xUsage,
      ...managedPlanCapabilities('max_15x'),
      bestFor: 'Highest-capacity work and video generation',
    },
    {
      planId: 'team',
      label: team.label,
      price: t('perSeatPrice', { price: teamSeatPrice }),
      billingInterval: t('compareTeamBilling'),
      usageCapacity: t('compareTeamUsage'),
      ...managedPlanCapabilities('team'),
      bestFor: t('compareTeamBestFor'),
      highlighted: true,
    },
    {
      planId: 'enterprise',
      label: BILLING_PLAN_PRICING.enterprise.label,
      price: t('custom'),
      billingInterval: t('annualContract'),
      usageCapacity: t('compareEnterpriseUsage'),
      ...managedPlanCapabilities('enterprise'),
      bestFor: t('compareEnterpriseBestFor'),
      highlighted: true,
    },
  ];

  // Filtered once: the table renders these and the disclosure summary counts
  // them, so the two can never disagree about how many plans are compared.
  const comparableRows = compareRows.filter((row) => isPlanSelectableOnSurface(row.planId, 'web'));
  const comparablePlanCount = comparableRows.length;

  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <section
          className="agi-ds-section agi-ds-pricing-plans"
          aria-labelledby="pricing-hero-title"
        >
          <Container>
            <h1 id="pricing-hero-title" className="sr-only">
              {t('pageTitle')}
            </h1>
            {!CHECKOUT_ENABLED ? (
              <p role="status" className="agi-ds-prose" data-size="sm">
                Checkout is temporarily unavailable. Please try again later. Existing plans and
                Enterprise contact are unaffected.
              </p>
            ) : null}
            <div className="agi-ds-tier-controls">
              <div className="agi-ds-tier-toggle" role="group" aria-label={t('audienceLabel')}>
                <button
                  type="button"
                  aria-pressed={audience === 'individual'}
                  onClick={() => setAudience('individual')}
                  className={
                    audience === 'individual'
                      ? 'agi-ds-tier-toggle-btn agi-ds-tier-toggle-btn--active'
                      : 'agi-ds-tier-toggle-btn'
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
                      ? 'agi-ds-tier-toggle-btn agi-ds-tier-toggle-btn--active'
                      : 'agi-ds-tier-toggle-btn'
                  }
                >
                  {t('audienceBusiness')}
                </button>
              </div>

              {audience === 'individual' ? (
                <div
                  className="agi-ds-tier-toggle"
                  role="group"
                  aria-label={t('billingCadenceLabel')}
                >
                  <button
                    type="button"
                    aria-pressed={!annual}
                    onClick={() => setAnnual(false)}
                    className={
                      annual
                        ? 'agi-ds-tier-toggle-btn'
                        : 'agi-ds-tier-toggle-btn agi-ds-tier-toggle-btn--active'
                    }
                  >
                    {t('monthly')}
                  </button>
                  <button
                    type="button"
                    aria-pressed={annual}
                    onClick={() => setAnnual(true)}
                    className={
                      annual
                        ? 'agi-ds-tier-toggle-btn agi-ds-tier-toggle-btn--active'
                        : 'agi-ds-tier-toggle-btn'
                    }
                  >
                    {t('annual')}{' '}
                    <span className="agi-ds-tier-toggle-save">
                      {t('annualSave', { pct: proSavingsPct })}
                    </span>
                  </button>
                </div>
              ) : null}
            </div>

            <section aria-label={t('audienceBusiness')} hidden={audience !== 'business'}>
              <h2 className="sr-only">{t('audienceBusiness')}</h2>
              <div className="agi-ds-tier-grid agi-ds-tier-columns" data-columns="2">
                <article className="agi-ds-tier agi-ds-tier-lifted">
                  <div className="agi-ds-tier-head">
                    <h3 id="pricing-team-title" className="agi-ds-h3">
                      {team.label}
                    </h3>
                    <span className="agi-ds-tier-mark">{t('teamBadge')}</span>
                  </div>
                  {teamYearlyAvailable ? (
                    <div
                      className="agi-ds-tier-toggle"
                      role="group"
                      aria-label="Team billing cadence"
                    >
                      <button
                        type="button"
                        aria-pressed={!teamAnnual}
                        onClick={() => setTeamAnnual(false)}
                        className={
                          teamAnnual
                            ? 'agi-ds-tier-toggle-btn'
                            : 'agi-ds-tier-toggle-btn agi-ds-tier-toggle-btn--active'
                        }
                      >
                        {t('monthly')}
                      </button>
                      <button
                        type="button"
                        aria-pressed={teamAnnual}
                        onClick={() => setTeamAnnual(true)}
                        className={
                          teamAnnual
                            ? 'agi-ds-tier-toggle-btn agi-ds-tier-toggle-btn--active'
                            : 'agi-ds-tier-toggle-btn'
                        }
                      >
                        {t('annual')}{' '}
                        {teamSavingsPct > 0 ? (
                          <span className="agi-ds-tier-toggle-save">
                            {t('annualSave', { pct: teamSavingsPct })}
                          </span>
                        ) : null}
                      </button>
                    </div>
                  ) : null}
                  <p className="agi-ds-tier-price-row">
                    <span className="agi-ds-tier-price">
                      {teamInterval === 'yearly' ? teamYearlyTotalPrice : teamTotalPrice}
                    </span>
                    <span className="agi-ds-tier-price-sub">
                      {teamInterval === 'yearly'
                        ? t('seatCadenceAnnual', { count: teamSeats })
                        : t('seatCadenceMonthly', { count: teamSeats })}
                    </span>
                  </p>
                  <p className="agi-ds-tier-seats-total">
                    {teamInterval === 'yearly'
                      ? t('perSeatPriceAnnual', { price: teamYearlySeatPricePerMonth })
                      : t('perSeatPrice', { price: teamSeatPrice })}
                  </p>
                  <Prose size="sm">{t('teamTierBody')}</Prose>
                  <ul className="agi-ds-tier-features">
                    <li>
                      <CheckIcon />
                      {t('teamFeature1')}
                    </li>
                    <li>
                      <CheckIcon />
                      {t('teamFeature2')}
                    </li>
                    <li>
                      <CheckIcon />
                      {t('teamFeature3')}
                    </li>
                    <li>
                      <CheckIcon />
                      {t('teamFeature4')}
                    </li>
                    <li>
                      <CheckIcon />
                      {t('teamFeature5')}
                    </li>
                  </ul>
                  <div className="agi-ds-tier-seats">
                    <label className="agi-ds-tier-seats-label" htmlFor="team-seat-count">
                      {t('seatCountLabel')}
                    </label>
                    <input
                      id="team-seat-count"
                      className="agi-ds-tier-seats-input"
                      type="number"
                      inputMode="numeric"
                      min={MIN_PURCHASABLE_SEATS}
                      max={MAX_PURCHASABLE_SEATS}
                      step={1}
                      value={teamSeats}
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
                  <div className="agi-ds-tier-cta-group">
                    {renderPlanAction(
                      'team',
                      isPerSeatBillingPlan(billing?.plan) ? t('changeSeatsCta') : t('teamCta'),
                    )}
                  </div>
                </article>

                <article className="agi-ds-tier">
                  <div className="agi-ds-tier-head">
                    <h3 className="agi-ds-h3">{t('enterpriseHeading')}</h3>
                    <span className="agi-ds-tier-mark">{t('enterpriseBadge')}</span>
                  </div>
                  <p className="agi-ds-tier-price-row">
                    <span className="agi-ds-tier-price">{t('custom')}</span>
                    <span className="agi-ds-tier-price-sub">{t('customPricingSub')}</span>
                  </p>
                  <Prose size="sm">
                    SSO, SCIM, and audit are shipped and entitlement-gated; we scope capacity, data
                    retention, and rollout to how your org actually works. Reach out and we will
                    plan it together.
                  </Prose>
                  <ul className="agi-ds-tier-features">
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
                  <div className="agi-ds-tier-cta-group">
                    <Link href="/contact-sales" className="agi-ds-btn" data-variant="primary">
                      {t('contactSalesCta')}
                    </Link>
                  </div>
                </article>
              </div>
            </section>

            <section aria-label={t('audienceIndividual')} hidden={audience !== 'individual'}>
              <h2 className="sr-only">{t('audienceIndividual')}</h2>

              {user && !hasActivePaidPlan && pricingStatus === 'loading' ? (
                <p role="status" className="agi-ds-prose" data-size="sm">
                  Loading checkout availability…
                </p>
              ) : null}
              {user && !hasActivePaidPlan && pricingStatus === 'error' ? (
                <p role="alert" className="agi-ds-prose" data-size="sm">
                  Checkout availability could not be verified. Refresh this page to try again.
                </p>
              ) : null}
              {unavailableCheckoutPlans.map((plan) => (
                <p key={plan} role="status" className="agi-ds-prose" data-size="sm">
                  {BILLING_PLAN_PRICING[plan].label} checkout is not available in your region yet.
                </p>
              ))}

              <div className="agi-ds-tier-grid agi-ds-tier-columns" data-columns="4">
                <article className="agi-ds-tier">
                  <h3 className="agi-ds-h3">{BILLING_PLAN_PRICING.free.label}</h3>
                  <p className="agi-ds-tier-price-row">
                    <span className="agi-ds-tier-price">{t('free')}</span>
                    <span className="agi-ds-tier-price-sub">{t('foreverLabel')}</span>
                  </p>
                  <Prose size="sm">{t('freeTierBody')}</Prose>
                  <ul className="agi-ds-tier-features">
                    <li>
                      <CheckIcon />
                      {t('freeFeature1')}
                    </li>
                    <li>
                      <CheckIcon />
                      {t('freeFeature2')}
                    </li>
                    <li>
                      <CheckIcon />
                      {t('freeFeature3')}
                    </li>
                    <li>
                      <CheckIcon />
                      {t('freeLocalByok')}
                    </li>
                  </ul>
                  <div className="agi-ds-tier-cta-group">
                    <Link href={freeHref} className="agi-ds-btn" data-variant="secondary">
                      {t('freeCta')}
                    </Link>
                  </div>
                </article>

                {isPlanSelectableOnSurface('basic', 'web') && (
                  <article className="agi-ds-tier">
                    <h3 className="agi-ds-h3">{basic.label}</h3>
                    <p className="agi-ds-tier-price-row">
                      <span className="agi-ds-tier-price">{basicPrice}</span>
                      <span className="agi-ds-tier-price-sub">{t('perMonthBilledMonthly')}</span>
                    </p>
                    <Prose size="sm">{t('basicTierBody')}</Prose>
                    <ul className="agi-ds-tier-features">
                      <li>
                        <CheckIcon />
                        {t('basicFeature1')}
                      </li>
                      <li>
                        <CheckIcon />
                        {t('basicFeature2')}
                      </li>
                      <li>
                        <CheckIcon />
                        {t('basicFeature3')}
                      </li>
                      <li>
                        <CheckIcon />
                        {t('basicFeature4')}
                      </li>
                      <li>
                        <CheckIcon />
                        {t('basicFeature5')}
                      </li>
                      <li>
                        <CheckIcon />
                        {t('basicFeature6')}
                      </li>
                    </ul>
                    <div className="agi-ds-tier-cta-group">
                      {renderPlanAction('basic', t('basicCta'))}
                    </div>
                  </article>
                )}

                <article className="agi-ds-tier agi-ds-tier-lifted" data-recommended="true">
                  <div className="agi-ds-tier-head">
                    <h3 className="agi-ds-h3">{pro.label}</h3>
                    <span className="agi-ds-tier-mark">Recommended</span>
                  </div>
                  <p className="agi-ds-tier-price-row">
                    <span className="agi-ds-tier-price">{proPrice}</span>
                    <span className="agi-ds-tier-price-sub">
                      {annual && proSavingsPct > 0
                        ? t('perMonthBilledAnnually')
                        : t('perMonthBilledMonthly')}
                    </span>
                  </p>
                  <Prose size="sm">{t('proTierBody')}</Prose>
                  <ul className="agi-ds-tier-features">
                    <li>
                      <CheckIcon />
                      {t('proFeature1')}
                    </li>
                    <li>
                      <CheckIcon />
                      {t('proFeature2')}
                    </li>
                    <li>
                      <CheckIcon />
                      {t('proFeature3')}
                    </li>
                    <li>
                      <CheckIcon />
                      {t('proFeature4')}
                    </li>
                    <li>
                      <CheckIcon />
                      {t('proFeature5')}
                    </li>
                    <li>
                      <CheckIcon />
                      {t('proFeature6')}
                    </li>
                  </ul>
                  <div className="agi-ds-tier-cta-group">
                    {renderPlanAction('pro', t('proCta'))}
                  </div>
                </article>

                <article className="agi-ds-tier">
                  <div className="agi-ds-tier-head">
                    <h3 className="agi-ds-h3">{t('maxFamilyName')}</h3>
                    <div
                      className="agi-ds-tier-toggle"
                      role="group"
                      aria-label={t('maxVariantLabel')}
                    >
                      <button
                        type="button"
                        aria-pressed={maxVariant === 'max'}
                        aria-label={max.label}
                        onClick={() => setMaxVariant('max')}
                        className={
                          maxVariant === 'max'
                            ? 'agi-ds-tier-toggle-btn agi-ds-tier-toggle-btn--active'
                            : 'agi-ds-tier-toggle-btn'
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
                            ? 'agi-ds-tier-toggle-btn agi-ds-tier-toggle-btn--active'
                            : 'agi-ds-tier-toggle-btn'
                        }
                      >
                        {t('maxVariant15x')}
                      </button>
                    </div>
                  </div>
                  <p className="agi-ds-tier-price-row">
                    <span className="agi-ds-tier-price">
                      {maxVariant === 'max' ? maxPrice : max15xPrice}
                    </span>
                    <span className="agi-ds-tier-price-sub">{t('perMonthBilledMonthly')}</span>
                  </p>
                  <Prose size="sm">
                    {maxVariant === 'max' ? t('maxTierBody') : t('max15xTierBody')}
                  </Prose>
                  <ul className="agi-ds-tier-features">
                    {maxTierFeatures.map((feature) => (
                      <li key={feature}>
                        <CheckIcon />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <div className="agi-ds-tier-cta-group">
                    {maxVariant === 'max'
                      ? renderPlanAction('max', t('maxCta'))
                      : renderPlanAction('max_15x', t('max15xCta'))}
                  </div>
                </article>
              </div>
            </section>
          </Container>
        </section>

        <section className="agi-ds-section" aria-labelledby="pricing-compare-title" data-rule="top">
          <Container>
            <Eyebrow>{t('compareEyebrow')}</Eyebrow>
            <h2 id="pricing-compare-title" className="agi-ds-h2">
              {t('compareHeading')}
            </h2>
            <Prose size="lg">{t('compareSubheading')}</Prose>
            <details className="agi-ds-compare-disclosure" open>
              <summary className="agi-ds-compare-summary">
                <span>Full capability table</span>
                <span className="agi-ds-compare-summary-hint">
                  {comparablePlanCount} plans across {COMPARISON_COLUMNS.length} capabilities
                </span>
              </summary>
              <ScrollableTable label="Scrollable plan comparison">
                <table
                  aria-label="Plan capabilities"
                  className="agi-ds-compare-table agi-ds-compare-table-wide"
                >
                  <thead>
                    <tr>
                      {COMPARISON_COLUMNS.map(([col, label]) => (
                        <th key={col} scope="col">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {comparableRows.map((row) => (
                      <tr key={row.planId} data-tone={row.highlighted ? 'highlight' : undefined}>
                        <td>{row.label}</td>
                        <td>{row.price}</td>
                        <td>{row.billingInterval}</td>
                        <td>{row.usageCapacity}</td>
                        {[
                          row.projects,
                          row.customMcp,
                          row.skillsConnectors,
                          row.agiWork,
                          row.imageGeneration,
                          row.videoGeneration,
                          row.apiAccess,
                          row.developerSurfaces,
                          row.teamControls,
                          row.trainingData,
                        ].map((value, index) => (
                          <td key={`${row.planId}-capability-${index}`}>{value}</td>
                        ))}
                        <td>{row.bestFor}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollableTable>
            </details>
          </Container>
        </section>

        <section className="agi-ds-section" aria-labelledby="pricing-models-title" data-rule="top">
          <Container>
            <Eyebrow>Models</Eyebrow>
            <h2 id="pricing-models-title" className="agi-ds-h2">
              Models included by plan
            </h2>
            <Prose size="lg">
              Auto routes each message to the best model for the task, your plan, and cost; the
              ceiling it can reach rises with the plan. Manual model selection widens the same way:
              this is how many of each provider&apos;s models are reachable at each level, read live
              from our model catalog.
            </Prose>
            <ScrollableTable
              label="Scrollable model access by plan"
              style={{ marginTop: 'var(--agi-space-4)' }}
            >
              <table aria-label="Model access by plan" className="agi-ds-compare-table">
                <thead>
                  <tr>
                    <th scope="col">Provider</th>
                    {MODEL_ACCESS_COLUMNS.map((column) => (
                      <th key={column.label} scope="col">
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {modelAccessByProvider().map((row) => (
                    <tr key={row.provider}>
                      <td>{row.label}</td>
                      {row.accessByColumn.map((accessibleCount, columnIndex) => (
                        <td key={`${row.provider}-${MODEL_ACCESS_COLUMNS[columnIndex]?.label}`}>
                          {formatModelAccess(accessibleCount, row.total)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollableTable>
          </Container>
        </section>

        <section className="agi-ds-section" aria-labelledby="pricing-faq-title" data-rule="top">
          <Container>
            <Eyebrow>Questions</Eyebrow>
            <h2 id="pricing-faq-title" className="agi-ds-h2">
              Have a question about a plan?
            </h2>
            <Prose size="lg">
              Billing, upgrades, downgrades, cancellations, invoices, and what happens to your data
              are answered on the{' '}
              <Link href="/faq" className="agi-ds-link">
                FAQ
              </Link>
              .
            </Prose>
          </Container>
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
    </div>
  );
}
