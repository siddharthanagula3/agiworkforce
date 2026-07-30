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
  SELF_SERVE_PAID_PLAN_TIERS,
  type BillingPlanLimit,
  type BillingPlanTier,
  type SelfServePaidPlanTier,
} from '@agiworkforce/types';
import { useAuthStore } from '@shared/stores/authentication-store';
import {
  upgradeToBasicPlan,
  upgradeToProPlan,
  upgradeToMaxPlan,
  upgradeToMax15xPlan,
} from '@features/billing/services/stripe-payments';
import {
  UpgradeConfirmDialog,
  type UpgradeConfirmRequest,
} from '@features/billing/components/UpgradeConfirmDialog';
import { useBillingData } from '@features/billing/hooks/use-billing-queries';
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
// client flag in features/billing/pages/BillingDashboard.tsx — see the
// comment block in apps/web/.env.example. If they diverge, the CTA and the
// API will disagree about whether checkout is actually available.
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
  }),
});

type LocalizedPricingCatalog = z.infer<typeof localizedPricingCatalogSchema>;

function formatLocalizedAmount(
  entry: z.infer<typeof localizedPriceEntrySchema> | undefined,
  fallbackUsd: number,
  divisor = 1,
): string {
  if (!entry) return `$${(fallbackUsd / divisor).toFixed(2).replace(/\.00$/, '')}`;
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: entry.currency.toUpperCase(),
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(entry.amountMinor / 100 / divisor);
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
    teamControls: canUseBillingPlanCapability(plan, 'team_admin')
      ? plan === 'team'
        ? 'Sales-assisted pilot'
        : 'Yes'
      : 'No',
  };
}

export default function PricingPage() {
  const { t } = useTranslation('pricing');
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { data: billing, isLoading: billingLoading } = useBillingData();

  const [annual, setAnnual] = useState(false);
  const [localizedPricing, setLocalizedPricing] = useState<LocalizedPricingCatalog | null>(null);
  const [pricingStatus, setPricingStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [pendingPlan, setPendingPlan] = useState<CheckoutPlan | null>(null);
  const [upgradeConfirm, setUpgradeConfirm] = useState<UpgradeConfirmRequest | null>(null);

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
  const hasActivePaidPlan =
    billing != null &&
    billing.plan !== 'free' &&
    ['active', 'trialing'].includes(billing.status ?? '');
  const paidPlanSelectionDisabled =
    pendingPlan !== null ||
    (Boolean(user) && billingLoading) ||
    !CHECKOUT_ENABLED ||
    (Boolean(user) && !hasActivePaidPlan && pricingStatus !== 'ready');

  function selectedPriceEntry(plan: CheckoutPlan) {
    const interval = annual && plan === 'pro' ? 'yearly' : 'monthly';
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
    if (billing.plan === plan) return 'current';

    const currentIndex = SELF_SERVE_PAID_PLAN_TIERS.indexOf(billing.plan as SelfServePaidPlanTier);
    const targetIndex = SELF_SERVE_PAID_PLAN_TIERS.indexOf(plan);
    return currentIndex < 0 || targetIndex < currentIndex ? 'lower' : 'upgrade';
  }

  function renderPlanAction(plan: CheckoutPlan, upgradeLabel: string) {
    const relationship = planRelationship(plan);
    if (relationship === 'current') {
      return (
        <button type="button" className="agi-tier-cta" disabled>
          Current plan
        </button>
      );
    }
    if (relationship === 'lower') {
      return (
        <Link href="/billing" className="agi-tier-cta agi-tier-cta--ghost">
          Manage billing
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
      router.push('/login?redirectTo=%2Fpricing');
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
      setUpgradeConfirm({
        plan,
        billingInterval: plan === 'pro' ? (annual ? 'yearly' : 'monthly') : 'monthly',
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
      }
      toast.dismiss(toastId);
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(err instanceof Error ? err.message : t('checkoutFailed'));
    } finally {
      setPendingPlan(null);
    }
  }

  const freeHref = user ? '/chat' : '/login?redirectTo=%2Fchat';

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
      developerSurfaces: 'CLI',
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
      developerSurfaces: 'CLI',
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
      price: t('custom'),
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

        {/* ───────────────────────────── Hero ───────────────────────────── */}
        <section className="agi-page-hero" aria-labelledby="pricing-hero-title">
          <p className="agi-fl-eyebrow">{t('heroEyebrow')}</p>
          <h1 id="pricing-hero-title" className="agi-fl-h1">
            {t('pageTitle')}
          </h1>
          <p className="agi-fl-section-lede">{t('heroLedePart1', { localLabel, byokLabel })}</p>
          <p className="agi-fl-section-lede">{t('heroLedePart2')}</p>
          <div className="agi-fl-cta-row">
            <Link href="/download" className="agi-fl-cta agi-fl-cta--primary">
              {t('installCta')}
            </Link>
            <Link href="/contact-sales" className="agi-fl-cta agi-fl-cta--secondary">
              {t('talkToSalesCta')}
            </Link>
            <Link href="/chat" className="agi-fl-cta agi-fl-cta--ghost">
              {t('tryAgiCta')}
            </Link>
          </div>
          <ul className="agi-fl-mode-ribbon" aria-label={t('modeRibbonLabel')}>
            <li>{t('ribbonLocal')}</li>
            <li>{t('ribbonByok')}</li>
            <li>{t('ribbonTeam')}</li>
          </ul>
        </section>

        {/* ──────────────────── The wedge: Local + BYOK ─────────────────── */}
        <section className="agi-fl-section" aria-labelledby="pricing-wedge-title">
          <p className="agi-fl-eyebrow">{t('wedgeEyebrow')}</p>
          <h2 id="pricing-wedge-title" className="agi-fl-h2">
            {t('wedgeHeading')}
          </h2>
          <p className="agi-fl-section-lede">{t('wedgeLede')}</p>

          <div className="agi-tier-grid agi-tier-grid--compact" style={{ marginTop: 32 }}>
            <Reveal as="article" className="agi-tier agi-tier--compact">
              <h3 className="agi-tier-name">{localLabel}</h3>
              <p className="agi-tier-price">
                <span className="agi-tier-price-num">{t('free')}</span>
                <span className="agi-tier-price-sub">{t('foreverLabel')}</span>
              </p>
              <p className="agi-tier-body">{t('localTierBody')}</p>
              <ul className="agi-tier-features">
                <li>
                  <CheckIcon />
                  {t('localFeature1', { localLabel })}
                </li>
                <li>
                  <CheckIcon />
                  {t('localFeature2')}
                </li>
                <li>
                  <CheckIcon />
                  {t('localFeature3')}
                </li>
                <li>
                  <CheckIcon />
                  {t('localFeature4')}
                </li>
              </ul>
              <Link href="/download" className="agi-tier-cta agi-tier-cta--ghost">
                {t('installCta')}
              </Link>
            </Reveal>

            <Reveal as="article" delay={60} className="agi-tier agi-tier--compact">
              <h3 className="agi-tier-name">{byokLabel}</h3>
              <p className="agi-tier-price">
                <span className="agi-tier-price-num">{t('free')}</span>
                <span className="agi-tier-price-sub">{t('foreverLabel')}</span>
              </p>
              <p className="agi-tier-body">{t('byokTierBody')}</p>
              <ul className="agi-tier-features">
                <li>
                  <CheckIcon />
                  {t('byokFeature1')}
                </li>
                <li>
                  <CheckIcon />
                  {t('byokFeature2')}
                </li>
                <li>
                  <CheckIcon />
                  {t('byokFeature3')}
                </li>
                <li>
                  <CheckIcon />
                  {t('byokFeature4')}
                </li>
              </ul>
              <Link href="/download" className="agi-tier-cta agi-tier-cta--ghost">
                {t('installCta')}
              </Link>
            </Reveal>
          </div>
        </section>

        {/* ─────────────────── Team & Enterprise (centerpiece) ──────────── */}
        <section className="agi-fl-section" aria-labelledby="pricing-team-title">
          <p className="agi-fl-eyebrow">{t('teamEyebrow')}</p>
          <h2 id="pricing-team-title" className="agi-fl-h2">
            {t('teamHeading')}
          </h2>
          <p className="agi-fl-section-lede">{t('teamLede')}</p>

          <div className="agi-tier-grid agi-tier-grid--featured" style={{ marginTop: 24 }}>
            <Reveal as="article" className="agi-tier agi-tier--featured">
              <span className="agi-tier-badge">{t('teamBadge')}</span>
              <h3 className="agi-tier-name">{team.label}</h3>
              <p className="agi-tier-price">
                <span className="agi-tier-price-num">{t('custom')}</span>
                <span className="agi-tier-price-sub">{t('salesAssistedPricingSub')}</span>
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
              <div className="agi-tier-cta-group">
                <Link href="/contact-sales?plan=team" className="agi-tier-cta">
                  {t('talkToSalesCta')}
                </Link>
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
        <section className="agi-fl-section" aria-labelledby="pricing-individual-title">
          <p className="agi-fl-eyebrow">{t('individualEyebrow')}</p>
          <h2 id="pricing-individual-title" className="agi-fl-h2">
            {t('individualHeading')}
          </h2>
          <p className="agi-fl-section-lede">{t('individualLede')}</p>

          <div
            className="agi-tier-toggle"
            role="group"
            aria-label={t('billingCadenceLabel')}
            style={{ marginTop: 32 }}
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
              </ul>
              {renderPlanAction('pro', t('proCta'))}
            </Reveal>

            <Reveal as="article" delay={120} className="agi-tier">
              <h3 className="agi-tier-name">{max.label}</h3>
              <p className="agi-tier-price">
                <span className="agi-tier-price-num">{maxPrice}</span>
                <span className="agi-tier-price-sub">{t('perMonthBilledMonthly')}</span>
              </p>
              <p className="agi-tier-body">{t('maxTierBody')}</p>
              <ul className="agi-tier-features">
                <li>
                  <CheckIcon />
                  {t('maxFeature1')}
                </li>
                <li>
                  <CheckIcon />
                  {t('maxFeature2')}
                </li>
                <li>
                  <CheckIcon />
                  {t('maxFeature3')}
                </li>
              </ul>
              {renderPlanAction('max', t('maxCta'))}
            </Reveal>

            <Reveal as="article" delay={160} className="agi-tier">
              <h3 className="agi-tier-name">{max15x.label}</h3>
              <p className="agi-tier-price">
                <span className="agi-tier-price-num">{max15xPrice}</span>
                <span className="agi-tier-price-sub">{t('perMonthBilledMonthly')}</span>
              </p>
              <p className="agi-tier-body">Highest-capacity managed AI for sustained work.</p>
              <ul className="agi-tier-features">
                <li>
                  <CheckIcon />
                  15x Pro usage
                </li>
                <li>
                  <CheckIcon />
                  Everything in {max.label}
                </li>
                <li>
                  <CheckIcon />
                  Video generation
                </li>
              </ul>
              {renderPlanAction('max_15x', `Get ${max15x.label}`)}
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
          <div style={{ overflowX: 'auto', marginTop: 36 }}>
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
