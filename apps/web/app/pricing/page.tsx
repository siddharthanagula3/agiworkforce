'use client';

import { FREE_PLAN_TRAINING_DATA_DISCLOSURE } from '@/lib/compliance/free-plan-training-disclosure';
import '@/features/marketing/components/pricing/pricing.css';
import { PlanComparisonTable } from '@/features/marketing/components/pricing/PlanComparisonTable';
import {
  CheckIcon,
  EXCLUDED_CELL,
  INCLUDED_CELL,
  textCell,
  type PlanComparisonCell,
  type PlanComparisonGroup,
  type PlanComparisonPlan,
  type PlanComparisonRow,
} from '@/features/marketing/components/pricing/PlanComparisonValue';
import {
  pricingDeveloperSurfaceNote,
  pricingManagedChatSurfaceNote,
  pricingSurfaceStatus,
} from '@/features/marketing/components/pricing/developer-surface-presentation';
import { SURFACE_NAMES } from '@/lib/surface-status';
import {
  connectorFeatureNote,
  planCapabilityLabel,
  planCapabilityReleased,
} from '@/features/billing/lib/plan-capability-release';
import type { TFunction } from 'i18next';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { FreeQuotaMediaCategory } from '@agiworkforce/cloud-contracts';
import {
  BILLING_PLAN_PRICING,
  canAccessModelForSubscriptionTier,
  canUseBillingPlanCapability,
  connectorsReleased,
  currencyMinorUnitDigits,
  formatPrivacyModeLabel,
  getAllowedModelsForTier,
  getBillingPlanProductLimits,
  getMinimumRequiredTier,
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
  freeMediaPlanStanding,
  type FreeMediaCategoryOffer,
} from '@/features/models/lib/free-media-offer';
import { useAuthStore } from '@shared/stores/authentication-store';
import { useMounted } from '@shared/hooks/useMounted';
import { formatBytes } from '@shared/utils/format';
import {
  UpgradeAccessRequiredError,
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
import {
  upgradeNeedsWaitlist,
  type UpgradeWaitlistRequest,
} from '@features/billing/services/upgrade-waitlist';
import { useBillingData } from '@features/billing/hooks/use-billing-queries';
import {
  useUpgradeWaitlistStatus,
  resolveUpgradeWaitlistStatus,
} from '@features/billing/hooks/use-upgrade-waitlist';
import { useLocalizedPricing } from '@features/billing/hooks/use-localized-pricing';
import { useFreeMediaOffer } from '@features/billing/hooks/use-free-media-offer';
import {
  CHECKOUT_AVAILABILITY_ERROR_NOTICE,
  CHECKOUT_AVAILABILITY_LOADING_NOTICE,
  CHECKOUT_DISABLED_NOTICE,
  CHECKOUT_ENABLED,
  checkoutUnavailableInRegionNotice,
  formatLocalizedAmount,
  formatPlanAmount,
  localizedFreePrice,
  localizedIncludedTax,
  localizedPricePerMonth,
  planCheckoutReady,
  teamBillingInterval,
  teamYearlyCheckoutReady,
  type LocalizedPricedPlan,
} from '@features/billing/lib/localized-pricing';
import {
  INDIVIDUAL_PLAN_CARDS,
  individualPlanFeatures,
  planCtaLabel,
  planFeatureLead,
  planTierBody,
  pricingUsageExplainer,
  sandboxMinutes,
  teamPlanFeatures,
  teamSeatRows,
  withIncludedTax,
  usageComparisonCopy,
  type IndividualPlanCard,
} from '@features/billing/lib/plan-card-copy';
import { formatBillingDate } from '@features/billing/lib/billing-format';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { isBillingPolicyReady } from '@shared/stores/billing-policy';
import {
  billingOwnerPlanActionLabel,
  billingOwnerPlanChangeMessage,
} from '@features/billing/lib/subscription-owner-presentation';
import { Header } from '@shared/components/layout/Header';
import { ServiceNotices } from '@shared/components/ServiceNotices';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Reveal } from '@/features/marketing/components/Reveal';
import { WEB_ENTRY_HREF, webEntryHref } from '@/features/marketing/components/system/nav';
import { toUserMessage } from '@/lib/user-error-message';

type CheckoutPlan = SelfServePaidPlanTier;

const SERVER_RENDER_PRICE_LOCALE = 'en-US';

/** Annual savings vs monthly billing, from the canonical billing catalog. */
function annualSavingsPct(plan: { monthlyPriceUsd: number; yearlyPriceUsd: number }): number {
  if (plan.monthlyPriceUsd <= 0 || plan.yearlyPriceUsd <= 0) return 0;
  return Math.round((1 - plan.yearlyPriceUsd / 12 / plan.monthlyPriceUsd) * 100);
}

const COMPARED_PLANS = [
  'free',
  ...SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER,
  'team',
] as const satisfies readonly BillingPlanTier[];

type ComparedPlan = (typeof COMPARED_PLANS)[number];

const USAGE_WITHOUT_BASELINE_KEY: Partial<Record<ComparedPlan, string>> = {
  free: 'compareFreeUsage',
};

const UPGRADE_SETTLE_ATTEMPTS = 6;
const UPGRADE_SETTLE_INTERVAL_MS = 1_000;

function limitCell(
  limit: BillingPlanLimit | undefined,
  t: TFunction<'pricing'>,
  formatCount: (count: number) => string = String,
): PlanComparisonCell {
  if (limit === undefined) return EXCLUDED_CELL;
  if (limit === 'unlimited') return textCell(t('noSetLimit'));
  if (limit === 'custom') return textCell(t('custom'));
  return textCell(formatCount(limit));
}

function capabilityCell(
  plan: BillingPlanTier,
  capability: BillingPlanCapability,
  comingSoon: string,
): PlanComparisonCell {
  if (!canUseBillingPlanCapability(plan, capability)) return EXCLUDED_CELL;
  return planCapabilityReleased(capability) ? INCLUDED_CELL : textCell(comingSoon);
}

function countCell(
  limit: BillingPlanLimit | undefined,
  t: TFunction<'pricing'>,
  formatCount?: (count: number) => string,
): PlanComparisonCell {
  return limit === 0 ? EXCLUDED_CELL : limitCell(limit, t, formatCount);
}

function sandboxCell(plan: BillingPlanTier, t: TFunction<'pricing'>): PlanComparisonCell {
  return countCell(getBillingPlanProductLimits(plan)?.maxSandboxes, t, (sandboxes) =>
    t('compareSandboxLimit', { sandboxes, minutes: sandboxMinutes(plan) }),
  );
}

function connectorLimitCell(
  limit: BillingPlanLimit | undefined,
  t: TFunction<'pricing'>,
  comingSoon: string,
): PlanComparisonCell {
  const cell = countCell(limit, t);
  if (connectorsReleased() || cell.kind !== 'text') return cell;
  return textCell(...cell.lines, comingSoon);
}

function mediaCapabilityCell(
  plan: BillingPlanTier,
  category: FreeQuotaMediaCategory,
  offer: FreeMediaCategoryOffer | null,
  limitedPreview: string,
): PlanComparisonCell {
  const standing = freeMediaPlanStanding(plan, category);
  const access = freeMediaAccess({
    planIncludes: standing === 'included',
    offer: standing === 'offer_eligible' ? offer : null,
  });
  if (access.label === 'included') return INCLUDED_CELL;
  return access.label === 'limited' ? textCell(limitedPreview) : EXCLUDED_CELL;
}

const CONTEXT_WINDOW_FORMAT = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 2,
});

function contextWindowCell(plan: BillingPlanTier, t: TFunction<'pricing'>): PlanComparisonCell {
  const tokens = getPlanContextWindowTokens(plan);
  return tokens === null
    ? EXCLUDED_CELL
    : textCell(t('compareContextTokens', { tokens: CONTEXT_WINDOW_FORMAT.format(tokens) }));
}

const MODEL_TIER_LABEL_KEYS = {
  free: 'compareModelsFree',
  basic: 'compareModelsFast',
  pro: 'compareModelsBalanced',
  max: 'compareModelsFlagship',
} as const satisfies Record<NonNullable<ReturnType<typeof getMinimumRequiredTier>>, string>;

type ModelTierFloor = keyof typeof MODEL_TIER_LABEL_KEYS;

const PLAN_ROSTER_MODEL_IDS = Array.from(
  new Set([
    ...getAllowedModelsForTier('economy'),
    ...getAllowedModelsForTier('pro_additions'),
    ...getAllowedModelsForTier('flagship_additions'),
  ]),
);

const MODEL_TIERS = (Object.keys(MODEL_TIER_LABEL_KEYS) as ModelTierFloor[])
  .map((floor) => {
    const modelIds = PLAN_ROSTER_MODEL_IDS.filter(
      (modelId) => getMinimumRequiredTier(modelId) === floor,
    );
    return {
      floor,
      modelIds,
      modelNames: modelIds
        .map((modelId) => getModelMetadataById(modelId)?.name)
        .filter((name): name is string => Boolean(name))
        .join(', '),
    };
  })
  .filter((tier) => tier.modelIds.length > 0);

export default function PricingPage() {
  const { t } = useTranslation('pricing');
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const authInitialized = useAuthStore((s) => s.initialized);
  const { data: billing, isLoading: billingLoading, refetch: refetchBilling } = useBillingData();
  const accountSubscription = useBillingStore((s) => s.subscription);
  const billingPolicyReady = useBillingStore(isBillingPolicyReady);
  /**
   * /api/upgrade returns before the subscription webhook writes plan_tier, so
   * poll a bounded number of times until the plan moves.
   */
  const settleUpgradedPlan = useCallback(async () => {
    const planBeforeUpgrade = billing?.plan;
    for (let attempt = 0; attempt < UPGRADE_SETTLE_ATTEMPTS; attempt += 1) {
      const { data } = await refetchBilling();
      if (data?.plan && data.plan !== planBeforeUpgrade) return;
      await new Promise((resolve) => setTimeout(resolve, UPGRADE_SETTLE_INTERVAL_MS));
    }
  }, [billing?.plan, refetchBilling]);

  const { localizedPricing, pricingStatus } = useLocalizedPricing();
  const freeMediaOffer = useFreeMediaOffer();
  const priceLocale = useMounted() ? undefined : SERVER_RENDER_PRICE_LOCALE;
  const [pendingPlan, setPendingPlan] = useState<CheckoutPlan | null>(null);
  const [portalPending, setPortalPending] = useState(false);
  const [upgradeConfirm, setUpgradeConfirm] = useState<UpgradeConfirmRequest | null>(null);
  const [waitlistRequest, setWaitlistRequest] = useState<UpgradeWaitlistRequest | null>(null);
  const [joinWaitlistOnOpen, setJoinWaitlistOnOpen] = useState(false);
  const [downgradePlan, setDowngradePlan] = useState<SelfServeIndividualPlanTier | null>(null);
  const [teamSeats, setTeamSeats] = useState<number>(MIN_PURCHASABLE_SEATS);
  const [teamPremiumSeatsChoice, setTeamPremiumSeatsChoice] = useState<number>(0);
  const [teamAnnualChoice, setTeamAnnualChoice] = useState<boolean | null>(null);
  const [subscribedInterval, setSubscribedInterval] = useState<BillingInterval | null>(null);

  useEffect(() => {
    const revealTeamPricing = () => {
      if (window.location.hash === '#pricing-team-title') {
        document.getElementById('pricing-team-title')?.scrollIntoView?.({ block: 'start' });
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

  const localLabel = formatPrivacyModeLabel('local');
  const byokLabel = formatPrivacyModeLabel('byok');

  const pro = BILLING_PLAN_PRICING.pro;
  const team = BILLING_PLAN_PRICING.team;

  const localizedPlans = localizedPricing?.plans;
  const proPrice = localizedPricePerMonth(localizedPlans, 'pro', 'monthly', priceLocale);
  const freePrice = localizedFreePrice(localizedPlans, priceLocale);
  const basicPrice = localizedPricePerMonth(localizedPlans, 'basic', 'monthly', priceLocale);
  const maxPrice = localizedPricePerMonth(localizedPlans, 'max', 'monthly', priceLocale);
  const max15xPrice = localizedPricePerMonth(localizedPlans, 'max_15x', 'monthly', priceLocale);
  const teamSeatPrice = localizedPricePerMonth(localizedPlans, 'team', 'monthly', priceLocale);
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

  const teamYearlyAvailable = teamYearlyCheckoutReady(localizedPlans);
  const teamAnnual =
    teamAnnualChoice ?? (hasActivePaidPlan ? subscribedInterval === 'yearly' : true);
  const teamInterval = teamBillingInterval(localizedPlans, teamAnnual);
  const teamSavingsPct = annualSavingsPct(team);
  const teamYearlySeatPricePerMonth = localizedPricePerMonth(
    localizedPlans,
    'team',
    'yearly',
    priceLocale,
  );
  const teamPremium = BILLING_PLAN_PRICING.team_premium;
  const teamSeatEntry = localizedPlans?.team[teamInterval];
  const premiumSeatEntry = localizedPlans?.team_premium?.[teamInterval];
  const premiumSeatsOffered =
    !hasActivePaidPlan &&
    (premiumSeatEntry?.currency ?? 'usd').toLowerCase() ===
      (teamSeatEntry?.currency ?? 'usd').toLowerCase();
  const teamPremiumSeats = premiumSeatsOffered ? Math.min(teamPremiumSeatsChoice, teamSeats) : 0;
  const teamStandardSeats = teamSeats - teamPremiumSeats;
  const teamYearlyTotalPrice = formatLocalizedAmount(
    localizedPlans?.team.yearly,
    team.yearlyPriceUsd,
    priceLocale,
    1,
    teamSeats,
  );
  const teamMixedTotalPrice =
    teamSeatEntry && premiumSeatEntry
      ? formatPlanAmount(
          (teamSeatEntry.amountMinor * teamStandardSeats +
            premiumSeatEntry.amountMinor * teamPremiumSeats) /
            10 ** currencyMinorUnitDigits(teamSeatEntry.currency),
          teamSeatEntry.currency,
          priceLocale,
        )
      : formatPlanAmount(
          (teamInterval === 'yearly' ? team.yearlyPriceUsd : team.monthlyPriceUsd) *
            teamStandardSeats +
            (teamInterval === 'yearly' ? teamPremium.yearlyPriceUsd : teamPremium.monthlyPriceUsd) *
              teamPremiumSeats,
          'USD',
          priceLocale,
        );
  const { status: upgradeAccess } = useUpgradeWaitlistStatus({
    enabled: Boolean(user) && !hasActivePaidPlan,
  });
  const upgradesWaitlisted =
    Boolean(user) &&
    !hasActivePaidPlan &&
    upgradeAccess !== null &&
    upgradeNeedsWaitlist(upgradeAccess);
  const planActionsReachBilling =
    Boolean(user) &&
    (hasActivePaidPlan ||
      paymentOverdue ||
      (upgradeAccess !== null && !upgradeNeedsWaitlist(upgradeAccess)));
  const waitlistSelectionDisabled =
    pendingPlan !== null || !authInitialized || (Boolean(user) && billingLoading);
  const paidPlanSelectionDisabled =
    pendingPlan !== null ||
    !authInitialized ||
    (Boolean(user) && billingLoading) ||
    (Boolean(user) && hasActivePaidPlan && !billingPolicyReady) ||
    !CHECKOUT_ENABLED ||
    (Boolean(user) && !hasActivePaidPlan && pricingStatus !== 'ready');
  const showsCheckoutAvailability =
    Boolean(user) && !hasActivePaidPlan && !paymentOverdue && !upgradesWaitlisted;

  function selectedInterval(plan: CheckoutPlan): BillingInterval {
    return isPerSeatBillingPlan(plan) ? teamInterval : 'monthly';
  }

  function isPlanCheckoutReady(plan: CheckoutPlan): boolean {
    if (!user || hasActivePaidPlan) return true;
    return planCheckoutReady(localizedPlans, plan, selectedInterval(plan));
  }

  const unavailableCheckoutPlans: CheckoutPlan[] =
    showsCheckoutAvailability && pricingStatus === 'ready'
      ? SELF_SERVE_PAID_PLAN_TIERS.filter((plan) => !isPlanCheckoutReady(plan))
      : [];

  function planRelationship(plan: CheckoutPlan): 'upgrade' | 'current' | 'lower' {
    if (!hasActivePaidPlan || !billing) return 'upgrade';

    // An owned per-seat plan still offers more seats through the upgrade path.
    if (isPerSeatBillingPlan(plan) && isPerSeatBillingPlan(billing.plan)) return 'upgrade';
    if (billing.plan === plan) return 'current';

    // Leaving a per-seat plan for an individual one would strand the other seats.
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
    const selectionDisabled = upgradesWaitlisted
      ? waitlistSelectionDisabled
      : paidPlanSelectionDisabled || !isPlanCheckoutReady(plan);
    const planLabel = BILLING_PLAN_PRICING[plan].label;
    if (upgradesWaitlisted && upgradeAccess?.joinedPlans.includes(plan)) {
      return (
        <>
          <p className="agi-tier-cta-note">{t('onPlanWaitlistNote')}</p>
          <button
            type="button"
            className="agi-tier-cta agi-tier-cta--ghost"
            aria-label={t('enterAccessCodeForPlan', { plan: planLabel })}
            disabled={selectionDisabled}
            onClick={() => void handleUpgrade(plan)}
          >
            {t('enterAccessCodeCta')}
          </button>
        </>
      );
    }
    return (
      <button
        type="button"
        className="agi-tier-cta"
        disabled={selectionDisabled}
        onClick={() => void handleUpgrade(plan, upgradesWaitlisted)}
      >
        {upgradesWaitlisted ? t('joinPlanWaitlistCta', { plan: planLabel }) : upgradeLabel}
      </button>
    );
  }

  async function handleUpgrade(plan: CheckoutPlan, joinWaitlist = false) {
    if (!user) {
      const returnTo = isPerSeatBillingPlan(plan)
        ? `/pricing?seats=${teamSeats}#pricing-team-title`
        : '/pricing';
      router.push(webEntryHref(returnTo));
      return;
    }

    const request: UpgradeWaitlistRequest = {
      plan,
      billingInterval: selectedInterval(plan),
      ...(isPerSeatBillingPlan(plan) ? { seats: teamSeats, premiumSeats: teamPremiumSeats } : {}),
    };
    if (!hasActivePaidPlan) {
      setPendingPlan(plan);
      const needsWaitlist = upgradeNeedsWaitlist(await resolveUpgradeWaitlistStatus(user.id));
      setPendingPlan(null);
      if (needsWaitlist) {
        setJoinWaitlistOnOpen(joinWaitlist);
        setWaitlistRequest(request);
        return;
      }
    }

    if (!CHECKOUT_ENABLED) {
      toast.error('Checkout is temporarily unavailable. Please try again later.');
      return;
    }

    if (!hasActivePaidPlan && !isPlanCheckoutReady(plan)) {
      toast.error(`${BILLING_PLAN_PRICING[plan].label} checkout is unavailable in your region.`);
      return;
    }

    // A mid-cycle upgrade charges the saved card at once, so it needs explicit assent first.
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

    setPendingPlan(plan);
    try {
      await startInitialCheckout(request);
    } catch (error) {
      if (error instanceof UpgradeAccessRequiredError) {
        setJoinWaitlistOnOpen(false);
        setWaitlistRequest(request);
        return;
      }
      toast.error(toUserMessage(error, 'Failed to start checkout.'));
    }
  }

  async function startInitialCheckout(request: UpgradeWaitlistRequest) {
    if (!user) throw new Error('Please sign in to upgrade.');
    setPendingPlan(request.plan);
    const toastId = toast.loading(t('redirectingToCheckout'));
    try {
      if (isBasicPlanTier(request.plan)) {
        await upgradeToBasicPlan();
      } else if (isProPlanTier(request.plan)) {
        await upgradeToProPlan();
      } else if (isMaxPlanTier(request.plan)) {
        await upgradeToMaxPlan();
      } else if (isMax15xPlanTier(request.plan)) {
        await upgradeToMax15xPlan();
      } else if (isPerSeatBillingPlan(request.plan)) {
        await upgradeToTeamPlan({
          seats: request.seats ?? MIN_PURCHASABLE_SEATS,
          ...(request.premiumSeats ? { premiumSeats: request.premiumSeats } : {}),
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

  const freeHref = user ? '/' : WEB_ENTRY_HREF;

  const usageExplainer = pricingUsageExplainer(t);
  const comingSoon = t('models:selector.comingSoon');

  const teamFeatures = teamPlanFeatures(t);
  const teamSeatTypeRows = teamSeatRows(t, localizedPlans, teamInterval, priceLocale);

  const individualCards = INDIVIDUAL_PLAN_CARDS.filter((plan) =>
    isPlanSelectableOnSurface(plan, 'web'),
  );
  const individualPrices: Record<IndividualPlanCard, string> = {
    free: freePrice,
    basic: basicPrice,
    pro: proPrice,
    max: maxPrice,
    max_15x: max15xPrice,
  };

  const comparedPlanIds = COMPARED_PLANS.filter((plan) => isPlanSelectableOnSurface(plan, 'web'));
  const priceSub = (
    plan: LocalizedPricedPlan,
    interval: BillingInterval,
    base: string = t('perMonth'),
  ) => withIncludedTax(base, localizedIncludedTax(localizedPlans, plan, interval), t);
  const perMonthPrice = (price: string, plan?: LocalizedPricedPlan) =>
    `${price}${plan ? priceSub(plan, 'monthly') : t('perMonth')}`;
  const comparedPlanPrices: Record<ComparedPlan, Pick<PlanComparisonPlan, 'price' | 'billing'>> = {
    free: { price: perMonthPrice(freePrice) },
    basic: { price: perMonthPrice(basicPrice, 'basic') },
    pro: { price: perMonthPrice(proPrice, 'pro') },
    max: { price: perMonthPrice(maxPrice, 'max') },
    max_15x: { price: perMonthPrice(max15xPrice, 'max_15x') },
    team: {
      price: `${teamInterval === 'yearly' ? teamYearlySeatPricePerMonth : teamSeatPrice} ${priceSub('team', teamInterval, t('perSeatPricingSub'))}`,
      billing: teamInterval === 'yearly' ? t('billedYearly') : t('billedMonthly'),
    },
  };
  const comparisonPlans: PlanComparisonPlan[] = comparedPlanIds.map((plan) => ({
    planId: plan,
    label: BILLING_PLAN_PRICING[plan].label,
    ...comparedPlanPrices[plan],
  }));

  const comparisonRow = (
    id: string,
    label: string,
    cell: (plan: ComparedPlan) => PlanComparisonCell,
    note?: string,
  ): PlanComparisonRow => ({
    id,
    label,
    ...(note ? { note } : {}),
    cells: Object.fromEntries(comparedPlanIds.map((plan) => [plan, cell(plan)])),
  });
  const capabilityRow = (capability: BillingPlanCapability, note?: string) =>
    comparisonRow(
      capability,
      planCapabilityLabel(capability),
      (plan) => capabilityCell(plan, capability, comingSoon),
      note,
    );
  const mediaRow = (
    capability: 'image_generation' | 'video_generation',
    category: FreeQuotaMediaCategory,
  ) =>
    comparisonRow(capability, planCapabilityLabel(capability), (plan) =>
      mediaCapabilityCell(plan, category, freeMediaOffer[category], t('compareLimitedPreview')),
    );
  const usageCell = (plan: ComparedPlan): PlanComparisonCell => {
    const lines = usageComparisonCopy(plan, t);
    if (lines.length > 0) return textCell(...lines);
    const withoutBaseline = USAGE_WITHOUT_BASELINE_KEY[plan];
    return withoutBaseline ? textCell(t(withoutBaseline)) : EXCLUDED_CELL;
  };

  const comparisonGroups: PlanComparisonGroup[] = [
    {
      id: 'usage',
      label: t('compareGroupUsage'),
      rows: [
        capabilityRow('managed_chat', pricingManagedChatSurfaceNote(t)),
        comparisonRow('managedUsage', t('compareRowManagedUsage'), usageCell),
        comparisonRow('contextWindow', t('compareRowContextWindow'), (plan) =>
          contextWindowCell(plan, t),
        ),
        comparisonRow('concurrentChats', t('compareRowConcurrentChats'), (plan) =>
          countCell(getBillingPlanProductLimits(plan)?.maxConcurrentTurns, t),
        ),
      ],
    },
    {
      id: 'models',
      label: t('compareGroupModels'),
      rows: MODEL_TIERS.map((tier) =>
        comparisonRow(
          `models-${tier.floor}`,
          t(MODEL_TIER_LABEL_KEYS[tier.floor]),
          (plan) =>
            tier.modelIds.every((modelId) => canAccessModelForSubscriptionTier(modelId, plan))
              ? INCLUDED_CELL
              : EXCLUDED_CELL,
          tier.modelNames,
        ),
      ),
    },
    {
      id: 'research',
      label: t('compareGroupResearch'),
      rows: [
        capabilityRow('deep_research'),
        capabilityRow('agi_work'),
        mediaRow('image_generation', 'image'),
        mediaRow('video_generation', 'video'),
      ],
    },
    {
      id: 'projects',
      label: t('compareGroupProjects'),
      rows: [
        comparisonRow('projects', planCapabilityLabel('projects'), (plan) =>
          limitCell(getBillingPlanProductLimits(plan)?.projects, t),
        ),
        comparisonRow('knowledgeStorage', t('compareRowKnowledgeStorage'), (plan) =>
          limitCell(getBillingPlanProductLimits(plan)?.knowledgeStorageBytes, t, (bytes) =>
            formatBytes(bytes, 0),
          ),
        ),
        comparisonRow('monthlyDownloads', t('compareRowMonthlyDownloads'), (plan) =>
          limitCell(getBillingPlanProductLimits(plan)?.monthlyDownloadBytes, t, (bytes) =>
            formatBytes(bytes, 1),
          ),
        ),
        comparisonRow('attachmentSize', t('compareRowAttachmentSize'), (plan) =>
          limitCell(getBillingPlanProductLimits(plan)?.maxAttachmentBytes, t, (bytes) =>
            formatBytes(bytes, 0),
          ),
        ),
      ],
    },
    {
      id: 'tools',
      label: t('compareGroupTools'),
      rows: [
        capabilityRow('skills'),
        capabilityRow('connectors', connectorFeatureNote()),
        comparisonRow(
          'customMcp',
          t('compareRowCustomMcp'),
          (plan) =>
            connectorLimitCell(getBillingPlanProductLimits(plan)?.customMcpServers, t, comingSoon),
          connectorFeatureNote(),
        ),
        comparisonRow('scheduledTasks', t('compareRowScheduledTasks'), (plan) =>
          countCell(getBillingPlanProductLimits(plan)?.maxScheduledTasks, t),
        ),
        comparisonRow('sandboxes', t('compareRowSandboxes'), (plan) => sandboxCell(plan, t)),
        capabilityRow('remote_control'),
        capabilityRow('managed_api'),
        capabilityRow('developer_surfaces', pricingDeveloperSurfaceNote(t)),
      ],
    },
    {
      id: 'admin',
      label: t('compareGroupAdmin'),
      rows: [
        capabilityRow('team_admin'),
        capabilityRow('enterprise_controls'),
        comparisonRow('trainingData', t('compareRowTrainsOnContent'), (plan) =>
          textCell(
            isFreeOfChargePlanTier(plan) ? FREE_PLAN_TRAINING_DATA_DISCLOSURE : t('compareNo'),
          ),
        ),
      ],
    },
  ];

  function renderRegionNotice(plan: CheckoutPlan) {
    if (!unavailableCheckoutPlans.includes(plan)) return null;
    return (
      <p role="status" className="agi-tier-cta-note">
        {checkoutUnavailableInRegionNotice(plan)}
      </p>
    );
  }

  function renderIndividualCard(plan: IndividualPlanCard, index: number) {
    const lead = planFeatureLead(plan, t);
    return (
      <Reveal key={plan} as="article" delay={index * 40} className="agi-tier">
        <h2 className="agi-tier-name">{BILLING_PLAN_PRICING[plan].label}</h2>
        <div className="agi-tier-price">
          <span className="agi-tier-price-num">{individualPrices[plan]}</span>
          <span className="agi-tier-price-sub">
            {isFreeBillingPlanTier(plan) ? t('perMonth') : priceSub(plan, 'monthly')}
          </span>
        </div>
        <p className="agi-tier-body">{planTierBody(plan, t)}</p>
        <div className="agi-tier-cta-group">
          {isFreeBillingPlanTier(plan) ? (
            <Link href={freeHref} className="agi-tier-cta agi-tier-cta--ghost">
              {t('freeCta')}
            </Link>
          ) : (
            <>
              {renderPlanAction(plan, planCtaLabel(plan, t))}
              {renderRegionNotice(plan)}
            </>
          )}
        </div>
        <ul className="agi-tier-features">
          {lead ? <li className="agi-tier-features-lead">{lead}</li> : null}
          {individualPlanFeatures(plan, t, freeMediaOffer).map((feature) => (
            <li key={feature}>
              <CheckIcon />
              {feature}
            </li>
          ))}
        </ul>
      </Reveal>
    );
  }

  return (
    <div data-design="agi" data-public-reference="pricing">
      <Header />
      <main id="main-content" tabIndex={-1} className="agi-shell">
        <section className="agi-pricing-pagehead" aria-labelledby="pricing-hero-title">
          <h1 id="pricing-hero-title" className="agi-pricing-title">
            {t('pageTitle')}
          </h1>
          {!CHECKOUT_ENABLED ? (
            <p role="status" className="agi-fl-section-lede">
              {CHECKOUT_DISABLED_NOTICE}
            </p>
          ) : null}
          {planActionsReachBilling ? (
            <div className="flex flex-col gap-2 empty:hidden">
              <ServiceNotices scope="billing" />
            </div>
          ) : null}
          {paymentOverdue ? (
            <p role="alert" className="agi-fl-section-lede">
              Your last payment didn&rsquo;t go through. Pay the open invoice or update your payment
              method in{' '}
              <Link href="/settings/billing" className="agi-ds-link">
                Billing
              </Link>{' '}
              before you change plans.
            </p>
          ) : null}
          {showsCheckoutAvailability && pricingStatus === 'loading' ? (
            <p role="status" className="agi-fl-section-lede">
              {CHECKOUT_AVAILABILITY_LOADING_NOTICE}
            </p>
          ) : null}
          {showsCheckoutAvailability && pricingStatus === 'error' ? (
            <p role="alert" className="agi-fl-section-lede">
              {CHECKOUT_AVAILABILITY_ERROR_NOTICE}
            </p>
          ) : null}
        </section>

        <section className="agi-pricing-plans" aria-labelledby="pricing-hero-title">
          <div className="agi-tier-grid agi-tier-grid--plans">
            {individualCards.map(renderIndividualCard)}
          </div>

          <Reveal as="article" className="agi-tier agi-tier--band">
            <div className="agi-tier-band-offer">
              <div className="agi-tier-head">
                <h2 id="pricing-team-title" className="agi-tier-name">
                  {team.label}
                </h2>
                {teamYearlyAvailable ? (
                  <div className="agi-tier-toggle" role="group" aria-label="Team billing cadence">
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
                      {t('annual')}
                    </button>
                  </div>
                ) : null}
              </div>
              <p className="agi-tier-body">{planTierBody('team', t)}</p>
              <ul className="agi-tier-seat-rows">
                {teamSeatTypeRows.map((row) => (
                  <li key={row.type} className="agi-tier-seat-row">
                    <h3 className="agi-tier-seat-name">{row.name}</h3>
                    <p className="agi-tier-seat-price">
                      <span className="agi-tier-seat-price-num">{row.price}</span>{' '}
                      <span className="agi-tier-price-sub">
                        {priceSub(
                          row.type === 'premium' ? 'team_premium' : 'team',
                          teamInterval,
                          t('perSeatPricingSub'),
                        )}
                      </span>
                    </p>
                    <p className="agi-tier-seat-detail">{row.description}</p>
                    {row.alternate ? (
                      <p className="agi-tier-seat-detail agi-tier-seat-alternate">
                        {row.alternate}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className="agi-tier-price-sub agi-tier-seat-billing">
                {teamInterval === 'yearly' ? t('billedYearly') : t('billedMonthly')}
                {teamYearlyAvailable && teamSavingsPct > 0 ? (
                  <>
                    {' · '}
                    <span>{t('annualSave', { pct: teamSavingsPct })}</span>
                  </>
                ) : null}
              </p>
              <div className="agi-tier-seats">
                <label className="agi-tier-seats-label" htmlFor="team-seat-count">
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
              {premiumSeatsOffered ? (
                <div className="agi-tier-seats">
                  <label className="agi-tier-seats-label" htmlFor="team-premium-seat-count">
                    {t('premiumSeatCountLabel')}
                  </label>
                  <input
                    id="team-premium-seat-count"
                    className="agi-tier-seats-input"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={teamSeats}
                    step={1}
                    value={teamPremiumSeats}
                    onChange={(event) => {
                      const parsed = Number.parseInt(event.target.value, 10);
                      setTeamPremiumSeatsChoice(
                        Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), teamSeats) : 0,
                      );
                    }}
                  />
                </div>
              ) : (
                <p className="agi-tier-seats-total">
                  {hasActivePaidPlan ? t('premiumSeatsInSettings') : t('premiumSeatsUnavailable')}
                </p>
              )}
              <p className="agi-tier-seats-total">
                {teamPremiumSeats > 0
                  ? t(teamInterval === 'yearly' ? 'seatTotalMixedAnnual' : 'seatTotalMixed', {
                      standard: teamStandardSeats,
                      premium: teamPremiumSeats,
                      total: teamMixedTotalPrice,
                    })
                  : teamInterval === 'yearly'
                    ? t('seatTotalAnnual', { seats: teamSeats, total: teamYearlyTotalPrice })
                    : t('seatTotal', { seats: teamSeats, total: teamTotalPrice })}
              </p>
              <div className="agi-tier-cta-group">
                {renderPlanAction(
                  'team',
                  isPerSeatBillingPlan(billing?.plan)
                    ? t('changeSeatsCta')
                    : planCtaLabel('team', t),
                )}
                <p className="agi-tier-cta-note">
                  {t('teamMinimumSeats', { seats: MIN_PURCHASABLE_SEATS })}
                </p>
                {renderRegionNotice('team')}
              </div>
            </div>
            <div className="agi-tier-band-includes">
              <ul className="agi-tier-features">
                <li className="agi-tier-features-lead">
                  {t('everythingInPlan', { plan: pro.label })}
                </li>
                {teamFeatures.map((feature) => (
                  <li key={feature}>
                    <CheckIcon />
                    {feature}
                  </li>
                ))}
              </ul>
              <p className="agi-tier-band-enterprise">
                <Link href="/contact-sales" className="agi-ds-link">
                  {t('enterpriseContactLine')}
                </Link>
              </p>
            </div>
          </Reveal>

          <p className="agi-fl-section-lede agi-pricing-note">{usageExplainer}</p>
          <p className="agi-fl-section-lede">
            {t('pricingFootnote')}{' '}
            <Link href="/refund-policy" className="agi-ds-link">
              {t('refundPolicyLink')}
            </Link>
          </p>
        </section>

        <section className="agi-fl-section" aria-labelledby="pricing-compare-title">
          <h2 id="pricing-compare-title" className="agi-fl-h2">
            {t('compareHeading')}
          </h2>
          <div
            className="agi-compare-scroll"
            role="region"
            aria-labelledby="pricing-compare-title"
            tabIndex={0}
          >
            <PlanComparisonTable
              labelledBy="pricing-compare-title"
              plans={comparisonPlans}
              groups={comparisonGroups}
            />
          </div>
          <p className="agi-compare-footnote">
            {t('compareLocalByokNote', {
              localLabel,
              byokLabel,
              surface: SURFACE_NAMES.cli,
              status: pricingSurfaceStatus('cli', t),
            })}
          </p>
        </section>

        <section className="agi-fl-section" aria-labelledby="pricing-faq-title">
          <h2 id="pricing-faq-title" className="agi-fl-h2">
            Have a question about a plan?
          </h2>
          <p className="agi-fl-section-lede">
            Find answers about billing, plan changes, invoices and what happens to your data.
          </p>
          <Link href="/faq" className="agi-ds-link agi-pricing-faq-link">
            Read the FAQ
          </Link>
        </section>
      </main>
      <MarketingFooter />
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
        joinOnOpen={joinWaitlistOnOpen}
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
