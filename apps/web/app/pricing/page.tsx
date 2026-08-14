'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  BILLING_PLAN_PRICING,
  canUseBillingPlanCapability,
  formatPrivacyModeLabel,
  getBillingPlanProductLimits,
  isPlanSelectableOnSurface,
  isPerSeatBillingPlan,
  MAX_PURCHASABLE_SEATS,
  MIN_PURCHASABLE_SEATS,
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
import { useBillingStore } from '@shared/stores/web-auth-store';
import { isBillingPolicyReady } from '@shared/stores/billing-policy';
import {
  billingOwnerPlanActionLabel,
  billingOwnerPlanChangeMessage,
} from '@features/billing/lib/subscription-owner-presentation';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Reveal } from '@/features/marketing/components/Reveal';

// Paid-plan checkout (2026-07-04): open by default, matching the
// managed-compute public-alpha decision (2026-06-27, lib/managed-compute-gate.ts).
// The env var is retained ONLY as an incident-response kill-switch: set
// NEXT_PUBLIC_CHECKOUT_ENABLED=0 (or 'false'/'off') to re-gate.
//
// NEXT_PUBLIC_CHECKOUT_ENABLED MUST be kept equal to the server-side
// STRIPE_CHECKOUT_ENABLED flag (app/api/checkout/route.ts) and to the same
// server-side checkout flag — see apps/web/.env.example. If they diverge, the
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
  projects: string;
  customMcp: string;
  skillsConnectors: string;
  agiWork: string;
  imageGeneration: string;
  videoGeneration: string;
  apiAccess: string;
  developerSurfaces: string;
  teamControls: string;
  bestFor: string;
  highlighted?: boolean;
}

function formatLimit(limit: BillingPlanLimit, singular: string, plural: string): string {
  if (limit === 'unlimited') return 'Unlimited';
  if (limit === 'custom') return 'Custom';
  return `${limit} ${limit === 1 ? singular : plural}`;
}

function managedPlanCapabilities(plan: BillingPlanTier) {
  const limits = getBillingPlanProductLimits(plan);
  return {
    projects: limits ? formatLimit(limits.projects, 'project', 'projects') : '—',
    customMcp: limits ? formatLimit(limits.customMcpServers, 'custom MCP', 'custom MCP') : '—',
    skillsConnectors: canUseBillingPlanCapability(plan, 'skills_connectors') ? 'Yes' : 'No',
    agiWork: canUseBillingPlanCapability(plan, 'agi_work') ? 'Yes' : 'No',
    imageGeneration: canUseBillingPlanCapability(plan, 'image_generation') ? 'Yes' : 'No',
    videoGeneration: canUseBillingPlanCapability(plan, 'video_generation') ? 'Yes' : 'No',
    apiAccess: canUseBillingPlanCapability(plan, 'managed_api') ? 'Yes' : 'No',
    developerSurfaces: canUseBillingPlanCapability(plan, 'developer_surfaces')
      ? 'CLI, Chrome & VS Code'
      : 'No managed access',
    teamControls: canUseBillingPlanCapability(plan, 'team_admin') ? 'Yes' : 'No',
  };
}

export default function PricingPage() {
  const { t } = useTranslation('pricing');
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const authInitialized = useAuthStore((s) => s.initialized);
  const { data: billing, isLoading: billingLoading } = useBillingData();
  const accountSubscription = useBillingStore((s) => s.subscription);
  const billingPolicyReady = useBillingStore(isBillingPolicyReady);

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
  const teamYearlySeatPrice = formatLocalizedAmount(
    localizedPlans?.team.yearly,
    team.yearlyPriceUsd,
  );
  const teamYearlyTotalPrice = formatLocalizedAmount(
    localizedPlans?.team.yearly,
    team.yearlyPriceUsd,
    1,
    teamSeats,
  );
  const hasActivePaidPlan =
    billing != null &&
    billing.plan !== 'free' &&
    ['active', 'trialing'].includes(billing.status ?? '');
  const paidPlanSelectionDisabled =
    pendingPlan !== null ||
    !authInitialized ||
    (Boolean(user) && billingLoading) ||
    (Boolean(user) && hasActivePaidPlan && !billingPolicyReady) ||
    !CHECKOUT_ENABLED ||
    (Boolean(user) && !hasActivePaidPlan && pricingStatus !== 'ready');

  function selectedPriceEntry(plan: CheckoutPlan) {
    const interval: BillingInterval =
      plan === 'pro' ? (annual ? 'yearly' : 'monthly') : plan === 'team' ? teamInterval : 'monthly';
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
    if (plan === 'team' && billing.plan === 'team') return 'upgrade';
    if (billing.plan === plan) return 'current';

    // Moving OFF a per-seat organization plan onto an individual plan is not an
    // upgrade in any direction — it would convert an org subscription into a
    // personal one and strand the other seats. Route it through billing.
    if (billing.plan === 'team') return 'lower';

    // Team has no rank on the individual ladder, but it IS reachable from any
    // individual plan: the upgrade route accepts pro/basic/max -> team.
    if (plan === 'team') return 'upgrade';

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
      toast.error(error instanceof Error ? error.message : 'Could not open the billing portal.');
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
    const relationship = planRelationship(plan);
    if (relationship === 'current') {
      return (
        <button type="button" className="agi-tier-cta" disabled>
          Current plan
        </button>
      );
    }
    if (relationship === 'lower') {
      // Opens the Stripe Customer Portal, which is the only surface that can
      // actually perform a downgrade. This used to be `<Link href="/billing">`,
      // and that closed a loop with no exit: /billing redirects to
      // /settings/billing, which opens the Billing settings modal — the exact
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
      const returnTo =
        plan === 'team' ? `/pricing?seats=${teamSeats}#pricing-team-title` : '/pricing';
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
    // screen — confirm the exact prorated amount first via UpgradeConfirmDialog
    // instead of charging silently.
    if (hasActivePaidPlan) {
      if (!billingPolicyReady) {
        toast.error('Billing details are still loading. Please try again in a moment.');
        return;
      }
      if (accountSubscription?.subscription_source !== 'stripe') {
        toast.error(billingOwnerPlanChangeMessage(accountSubscription?.subscription_source));
        return;
      }
      setUpgradeConfirm({
        plan,
        billingInterval:
          plan === 'pro'
            ? annual
              ? 'yearly'
              : 'monthly'
            : plan === 'team'
              ? teamInterval
              : 'monthly',
        ...(isPerSeatBillingPlan(plan) ? { seats: teamSeats } : {}),
      });
      return;
    }

    setPendingPlan(plan);
    const toastId = toast.loading(t('redirectingToCheckout'));
    try {
      const userId = user.id;
      const userEmail = user.email || '';
      if (plan === 'basic') {
        await upgradeToBasicPlan({ userId, userEmail });
      } else if (plan === 'pro') {
        await upgradeToProPlan({ userId, userEmail, billingPeriod: annual ? 'yearly' : 'monthly' });
      } else if (plan === 'max') {
        await upgradeToMaxPlan({ userId, userEmail });
      } else if (plan === 'max_15x') {
        await upgradeToMax15xPlan({ userId, userEmail });
      } else if (plan === 'team') {
        await upgradeToTeamPlan({
          seats: teamSeats,
          ...(teamInterval === 'yearly' ? { billingPeriod: 'yearly' } : {}),
        });
      }
      toast.dismiss(toastId);
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(err instanceof Error ? err.message : t('checkoutFailed'));
    } finally {
      setPendingPlan(null);
    }
  }

  const freeHref = user ? '/' : '/login?redirectTo=%2F';

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
      usageCapacity: '15x Pro usage',
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

  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        {/* ───────────────────────────── Hero ─────────────────────────────
            A pricing page is a place to compare prices. Both comparables give it
            a title and one orienting line — chatgpt.com/pricing is "Pricing" over
            "See pricing for our individual, business, and enterprise plans" —
            and let the cards carry the argument. The positioning prose, the
            three CTAs and the mode ribbon that used to live here said nothing a
            visitor came to this page for; the trust-mode story is told on `/`,
            `/local` and `/byok`, where it is the actual subject. */}
        {/* `.agi-page-hero` carries a bottom rule to divide a hero from the
            section beneath it. Here the audience tabs are the hero's own
            controls, so that rule drew a line between the title and the thing
            it introduces. Dropped, with the padding pulled in to match. */}
        <section
          className="agi-page-hero"
          aria-labelledby="pricing-hero-title"
          style={{ borderBottom: 'none', paddingTop: 48, paddingBottom: 24 }}
        >
          <h1 id="pricing-hero-title" className="agi-fl-h1">
            {t('pageTitle')}
          </h1>
          <p className="agi-fl-section-lede">{t('heroLede')}</p>
        </section>

        {/* ──────────────── Audience + billing-cadence controls ─────────────
            Both toggles are the same kind of thing — "which prices am I
            looking at" — so they share a row. The cadence one only appears
            for individual plans; Team carries its own cadence next to its
            seat count, because seats and cadence are bought together. */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 12,
            marginBottom: 32,
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

          {audience === 'individual' ? (
            <div
              className="agi-tier-toggle"
              role="group"
              aria-label={t('billingCadenceLabel')}
              style={{ marginBottom: 0 }}
            >
              <button
                type="button"
                aria-pressed={!annual}
                onClick={() => setAnnual(false)}
                className={
                  annual ? 'agi-tier-toggle-btn' : 'agi-tier-toggle-btn agi-tier-toggle-btn--active'
                }
              >
                {t('monthly')}
              </button>
              <button
                type="button"
                aria-pressed={annual}
                onClick={() => setAnnual(true)}
                className={
                  annual ? 'agi-tier-toggle-btn agi-tier-toggle-btn--active' : 'agi-tier-toggle-btn'
                }
              >
                {t('annual')}{' '}
                <span className="agi-tier-toggle-save">
                  {t('annualSave', { pct: proSavingsPct })}
                </span>
              </button>
            </div>
          ) : null}
        </div>

        {/* ─────────────────── Team & Enterprise (centerpiece) ──────────── */}
        <section
          className="agi-fl-section"
          aria-label={t('audienceBusiness')}
          hidden={audience !== 'business'}
          style={{ paddingTop: 0 }}
        >
          <div className="agi-tier-grid agi-tier-grid--featured" style={{ marginTop: 24 }}>
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
                  style={{ marginBottom: 16 }}
                >
                  <button
                    type="button"
                    aria-pressed={!teamAnnual}
                    onClick={() => setTeamAnnual(false)}
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
                    onClick={() => setTeamAnnual(true)}
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
                  {teamInterval === 'yearly' ? teamYearlyTotalPrice : teamTotalPrice}
                </span>
                <span className="agi-tier-price-sub">
                  {teamInterval === 'yearly'
                    ? t('seatCadenceAnnual', { count: teamSeats })
                    : t('seatCadenceMonthly', { count: teamSeats })}
                </span>
              </p>
              <p className="agi-tier-seats-total" style={{ marginTop: -8, marginBottom: 16 }}>
                {teamInterval === 'yearly'
                  ? t('perSeatPriceAnnual', { price: teamYearlySeatPrice })
                  : t('perSeatPrice', { price: teamSeatPrice })}
              </p>
              <p className="agi-tier-body">{t('teamTierBody')}</p>
              <ul className="agi-tier-features">
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
              </ul>
              {/* `.agi-tier-seats` is `display: block` with no gap, so the label
                  and the number input sat flush and read as one word, "Seats1". */}
              <div
                className="agi-tier-seats"
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
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
                    // Clamp here as well as server-side: the number input still
                    // lets a keyboard user type 0 or a huge value, and the total
                    // shown must never disagree with what checkout will charge.
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
              <div className="agi-tier-cta-group">
                {renderPlanAction(
                  'team',
                  billing?.plan === 'team' ? t('changeSeatsCta') : t('teamCta'),
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
              <p className="agi-tier-body">{t('enterpriseBody')}</p>
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
                  {t('enterpriseFeature3')}
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

        {/* ──────────────────── Individual cloud on-ramp ────────────────── */}
        <section
          className="agi-fl-section"
          aria-label={t('audienceIndividual')}
          hidden={audience !== 'individual'}
          style={{ paddingTop: 0 }}
        >
          {/* The audience tab above already says which plans these are; a second
              headline and two lines of prose only delayed the prices. The name
              moves to aria-label so the section keeps an accessible name. */}

          {user && !hasActivePaidPlan && pricingStatus === 'loading' ? (
            <p role="status" className="agi-fl-section-lede" style={{ marginTop: 16 }}>
              Loading checkout availability…
            </p>
          ) : null}
          {user && !hasActivePaidPlan && pricingStatus === 'error' ? (
            <p role="alert" className="agi-fl-section-lede" style={{ marginTop: 16 }}>
              Checkout availability could not be verified. Refresh this page to try again.
            </p>
          ) : null}
          {unavailableCheckoutPlans.map((plan) => (
            <p key={plan} role="status" className="agi-fl-section-lede" style={{ marginTop: 8 }}>
              {BILLING_PLAN_PRICING[plan].label} checkout is not available in your region yet.
            </p>
          ))}

          <div className="agi-tier-grid agi-tier-grid--four" style={{ marginTop: 24 }}>
            <Reveal as="article" className="agi-tier">
              <h3 className="agi-tier-name">{BILLING_PLAN_PRICING.free.label}</h3>
              <p className="agi-tier-price">
                <span className="agi-tier-price-num">{t('free')}</span>
                <span className="agi-tier-price-sub">{t('foreverLabel')}</span>
              </p>
              <p className="agi-tier-body">{t('freeTierBody')}</p>
              <ul className="agi-tier-features">
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
                {/* Local and BYOK are $0 trust modes, not plans anyone buys.
                    They were two more zero-price cards a visitor had to read
                    past before reaching a price; as a line here they stay
                    visible without spending a column. /local and /byok carry
                    the full story. */}
                <li>
                  <CheckIcon />
                  {t('freeLocalByok')}
                </li>
              </ul>
              <Link href={freeHref} className="agi-tier-cta agi-tier-cta--ghost">
                {t('freeCta')}
              </Link>
            </Reveal>

            {/* Basic is available across the customer app surfaces. */}
            {isPlanSelectableOnSurface('basic', 'web') && (
              <Reveal as="article" delay={40} className="agi-tier">
                <h3 className="agi-tier-name">{basic.label}</h3>
                <p className="agi-tier-price">
                  <span className="agi-tier-price-num">{basicPrice}</span>
                  <span className="agi-tier-price-sub">{t('perMonthBilledMonthly')}</span>
                </p>
                <p className="agi-tier-body">{t('basicTierBody')}</p>
                <ul className="agi-tier-features">
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
                {renderPlanAction('basic', t('basicCta'))}
              </Reveal>
            )}

            <Reveal as="article" delay={80} className="agi-tier">
              <h3 className="agi-tier-name">{pro.label}</h3>
              <p className="agi-tier-price">
                <span className="agi-tier-price-num">{proPrice}</span>
                <span className="agi-tier-price-sub">
                  {annual && proSavingsPct > 0
                    ? t('perMonthBilledAnnually')
                    : t('perMonthBilledMonthly')}
                </span>
              </p>
              <p className="agi-tier-body">{t('proTierBody')}</p>
              <ul className="agi-tier-features">
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
              {renderPlanAction('pro', t('proCta'))}
            </Reveal>

            {/* Max 5x and Max 15x share one card. They are the same plan at two
                capacities, and splitting them pushed the individual grid to five
                cards inside a four-card layout. The selector keeps both buyable
                without spending a column on each. */}
            <Reveal as="article" delay={120} className="agi-tier">
              {/* Name and capacity selector share one row. The selector used to
                  sit on its own line below, which read as a second control
                  rather than as part of the plan's identity — and every label
                  said "Max": the heading, and both buttons. The family name
                  carries "Max" once and the buttons carry only the multiplier
                  they switch, so the row states the plan and its two capacities
                  without repeating itself. The full catalog label still appears
                  on the CTA, which is where the exact product name matters. */}
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
                <li>
                  <CheckIcon />
                  {maxVariant === 'max' ? t('maxFeature1') : t('max15xFeature1')}
                </li>
                <li>
                  <CheckIcon />
                  {maxVariant === 'max' ? t('maxFeature2') : t('max15xFeature2')}
                </li>
                <li>
                  <CheckIcon />
                  {maxVariant === 'max' ? t('maxFeature3') : t('max15xFeature3')}
                </li>
                <li>
                  <CheckIcon />
                  {maxVariant === 'max' ? t('maxFeature4') : t('max15xFeature4')}
                </li>
                <li>
                  <CheckIcon />
                  {maxVariant === 'max' ? t('maxFeature5') : t('max15xFeature5')}
                </li>
                <li>
                  <CheckIcon />
                  {maxVariant === 'max' ? t('maxFeature6') : t('max15xFeature6')}
                </li>
              </ul>
              {maxVariant === 'max'
                ? renderPlanAction('max', t('maxCta'))
                : renderPlanAction('max_15x', t('max15xCta'))}
            </Reveal>
          </div>
        </section>

        {/* ───────────────────────── Plan comparison ────────────────────── */}
        <section className="agi-fl-section" aria-labelledby="pricing-compare-title">
          <p className="agi-fl-eyebrow">{t('compareEyebrow')}</p>
          <h2 id="pricing-compare-title" className="agi-fl-h2">
            {t('compareHeading')}
          </h2>
          <p className="agi-fl-section-lede">{t('compareSubheading')}</p>
          <div
            aria-label="Scrollable plan comparison"
            role="region"
            tabIndex={0}
            style={{ overflowX: 'auto', marginTop: 36 }}
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
                  {[
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
                    ['bestFor', 'Best for'],
                  ].map(([col, label]) => (
                    <th
                      key={col}
                      style={{
                        textAlign: 'left',
                        padding: '10px 16px',
                        borderBottom: '1px solid var(--agi-rule-strong)',
                        color: 'var(--agi-ink-quiet)',
                        fontSize: 11,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        fontFamily: 'var(--agi-font-mono)',
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {compareRows
                  .filter((row) => isPlanSelectableOnSurface(row.planId, 'web'))
                  .map((row, i) => (
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
                          padding: '14px 16px',
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
                          padding: '14px 16px',
                          borderBottom: '1px solid var(--agi-rule)',
                          color: 'var(--agi-ink)',
                        }}
                      >
                        {row.price}
                      </td>
                      <td
                        style={{
                          padding: '14px 16px',
                          borderBottom: '1px solid var(--agi-rule)',
                          color: 'var(--agi-ink-2)',
                        }}
                      >
                        {row.billingInterval}
                      </td>
                      <td
                        style={{
                          padding: '14px 16px',
                          borderBottom: '1px solid var(--agi-rule)',
                          color: 'var(--agi-ink-2)',
                        }}
                      >
                        {row.usageCapacity}
                      </td>
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
                      ].map((value, index) => (
                        <td
                          key={`${row.planId}-capability-${index}`}
                          style={{
                            padding: '14px 16px',
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
                          padding: '14px 16px',
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
        </section>

        <MarketingFooter />
      </main>
      <UpgradeConfirmDialog
        request={upgradeConfirm}
        onCancel={() => setUpgradeConfirm(null)}
        onConfirmed={() => {
          setUpgradeConfirm(null);
          toast.success('Your plan has been upgraded.');
        }}
      />
    </div>
  );
}
