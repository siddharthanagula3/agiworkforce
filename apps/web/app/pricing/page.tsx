'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  BILLING_PLAN_PRICING,
  formatPrivacyModeLabel,
  isPlanSelectableOnSurface,
  type BillingPlanTier,
} from '@agiworkforce/types';
import { useAuthStore } from '@shared/stores/authentication-store';
import {
  upgradeToBasicPlan,
  upgradeToProPlan,
  upgradeToMaxPlan,
  upgradeToTeamPlan,
} from '@features/billing/services/stripe-payments';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Reveal } from '@/features/marketing/components/Reveal';
import { WaitlistTrigger } from '@/features/marketing/components/WaitlistModal';
import { WaitlistForm } from '../byok/WaitlistForm';

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

type Currency = 'usd' | 'inr';
type CheckoutPlan = 'basic' | 'pro' | 'max' | 'team';

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
  bestFor: string;
  highlighted?: boolean;
}

export default function PricingPage() {
  const { t } = useTranslation('pricing');
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [annual, setAnnual] = useState(false);
  const [currency, setCurrency] = useState<Currency>('usd');
  const [pendingPlan, setPendingPlan] = useState<CheckoutPlan | null>(null);

  // Best-effort locale detection for India (₹399/mo Basic), with a manual
  // toggle so any user can override. No geo-IP dependency by design.
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      const lang = typeof navigator !== 'undefined' ? navigator.language || '' : '';
      if (tz === 'Asia/Kolkata' || tz === 'Asia/Calcutta' || lang.toLowerCase().endsWith('-in')) {
        setCurrency('inr');
      }
    } catch {
      // Intl/navigator unavailable (SSR or unsupported env) - stay on USD default.
    }
  }, []);

  const localLabel = formatPrivacyModeLabel('local');
  const byokLabel = formatPrivacyModeLabel('byok');

  const pro = BILLING_PLAN_PRICING.pro;
  const max = BILLING_PLAN_PRICING.max;
  const basic = BILLING_PLAN_PRICING.basic;
  const team = BILLING_PLAN_PRICING.team;

  const proSavingsPct = annualSavingsPct(pro);
  const teamSavingsPct = annualSavingsPct(team);

  const proPrice =
    annual && proSavingsPct > 0
      ? (pro.yearlyPriceUsd / 12).toFixed(2)
      : pro.monthlyPriceUsd.toFixed(2);
  const teamPrice =
    annual && teamSavingsPct > 0
      ? (team.yearlyPriceUsd / 12).toFixed(2)
      : team.monthlyPriceUsd.toFixed(2);
  const basicPrice =
    currency === 'inr' && basic.monthlyPriceInr
      ? `₹${basic.monthlyPriceInr}`
      : `$${basic.monthlyPriceUsd}`;

  async function handleUpgrade(plan: CheckoutPlan) {
    if (!user) {
      router.push('/login?redirectTo=%2Fpricing');
      return;
    }

    if (!CHECKOUT_ENABLED) {
      window.location.href = '/pricing#waitlist';
      return;
    }

    setPendingPlan(plan);
    const toastId = toast.loading(t('redirectingToCheckout'));
    try {
      const userId = user.id;
      const userEmail = user.email || '';
      if (plan === 'basic') {
        await upgradeToBasicPlan({ userId, userEmail, currency });
      } else if (plan === 'pro') {
        await upgradeToProPlan({ userId, userEmail, billingPeriod: annual ? 'yearly' : 'monthly' });
      } else if (plan === 'max') {
        await upgradeToMaxPlan({ userId, userEmail });
      } else if (plan === 'team') {
        await upgradeToTeamPlan({
          userId,
          userEmail,
          billingPeriod: annual ? 'yearly' : 'monthly',
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

  const freeHref = user ? '/chat' : '/login?redirectTo=%2Fchat';

  const compareRows: CompareRow[] = [
    {
      planId: 'local-only',
      label: localLabel,
      price: t('free'),
      billingInterval: t('foreverLabel'),
      usageCapacity: t('compareLocalUsage'),
      bestFor: t('compareLocalBestFor'),
    },
    {
      planId: 'byok',
      label: byokLabel,
      price: t('free'),
      billingInterval: t('foreverLabel'),
      usageCapacity: t('compareByokUsage'),
      bestFor: t('compareByokBestFor'),
    },
    {
      planId: 'free',
      label: BILLING_PLAN_PRICING.free.label,
      price: t('free'),
      billingInterval: t('foreverLabel'),
      usageCapacity: t('compareFreeUsage'),
      bestFor: t('compareFreeBestFor'),
    },
    {
      planId: 'basic',
      label: basic.label,
      price: `$${basic.monthlyPriceUsd}/mo (₹${basic.monthlyPriceInr}/mo ${t('inIndia')})`,
      billingInterval: t('monthly'),
      usageCapacity: t('compareBasicUsage'),
      bestFor: t('compareBasicBestFor'),
    },
    {
      planId: 'pro',
      label: pro.label,
      price: `$${pro.monthlyPriceUsd}/mo`,
      billingInterval: t('compareProInterval', { yearly: (pro.yearlyPriceUsd / 12).toFixed(2) }),
      usageCapacity: t('compareProUsage'),
      bestFor: t('compareProBestFor'),
    },
    {
      planId: 'max',
      label: max.label,
      price: `$${max.monthlyPriceUsd}/mo`,
      billingInterval: t('monthlyOnly'),
      usageCapacity: t('compareMaxUsage'),
      bestFor: t('compareMaxBestFor'),
    },
    {
      planId: 'team',
      label: team.label,
      price: `$${team.monthlyPriceUsd}/seat/mo`,
      billingInterval: t('compareTeamInterval', { yearly: (team.yearlyPriceUsd / 12).toFixed(2) }),
      usageCapacity: t('compareTeamUsage'),
      bestFor: t('compareTeamBestFor'),
      highlighted: true,
    },
    {
      planId: 'enterprise',
      label: BILLING_PLAN_PRICING.enterprise.label,
      price: t('custom'),
      billingInterval: t('annualContract'),
      usageCapacity: t('compareEnterpriseUsage'),
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
                {t('annualSave', { pct: teamSavingsPct })}
              </span>
            </button>
          </div>

          <div className="agi-tier-grid agi-tier-grid--featured" style={{ marginTop: 24 }}>
            <Reveal as="article" className="agi-tier agi-tier--featured">
              <span className="agi-tier-badge">{t('teamBadge')}</span>
              <h3 className="agi-tier-name">{team.label}</h3>
              <p className="agi-tier-price">
                <span className="agi-tier-price-num">${teamPrice}</span>
                <span className="agi-tier-price-sub">
                  {t('perSeatPerMonth')}
                  {annual && teamSavingsPct > 0 ? (
                    <>
                      {' · '}
                      <span className="agi-tier-toggle-save">
                        {t('annualSave', { pct: teamSavingsPct })}
                      </span>
                    </>
                  ) : null}
                </span>
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
                <button
                  type="button"
                  className="agi-tier-cta"
                  disabled={pendingPlan === 'team'}
                  onClick={() => void handleUpgrade('team')}
                >
                  {t('teamCta')}
                </button>
                <WaitlistTrigger
                  label={t('talkToSalesCta')}
                  source="billing"
                  className="agi-tier-cta agi-tier-cta--ghost"
                />
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
            aria-label={t('currencyLabel')}
            style={{ marginTop: 32 }}
          >
            <button
              type="button"
              aria-pressed={currency === 'usd'}
              onClick={() => setCurrency('usd')}
              className={
                currency === 'usd'
                  ? 'agi-tier-toggle-btn agi-tier-toggle-btn--active'
                  : 'agi-tier-toggle-btn'
              }
            >
              USD
            </button>
            <button
              type="button"
              aria-pressed={currency === 'inr'}
              onClick={() => setCurrency('inr')}
              className={
                currency === 'inr'
                  ? 'agi-tier-toggle-btn agi-tier-toggle-btn--active'
                  : 'agi-tier-toggle-btn'
              }
            >
              INR ({t('inIndia')})
            </button>
          </div>

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

            {/* Basic is mobile-only (founder decision, 2026-07) — hidden from the
                web plan-selection list; existing Basic subscribers still see it
                as their current plan in billing. */}
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
                <button
                  type="button"
                  className="agi-tier-cta"
                  disabled={pendingPlan === 'basic'}
                  onClick={() => void handleUpgrade('basic')}
                >
                  {t('basicCta')}
                </button>
              </Reveal>
            )}

            <Reveal as="article" delay={80} className="agi-tier">
              <h3 className="agi-tier-name">{pro.label}</h3>
              <p className="agi-tier-price">
                <span className="agi-tier-price-num">${proPrice}</span>
                <span className="agi-tier-price-sub">
                  {annual && proSavingsPct > 0
                    ? t('perMonthBilledAnnually')
                    : t('perMonthBilledMonthly')}
                  {currency === 'inr' ? ' · USD only' : ''}
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
              <button
                type="button"
                className="agi-tier-cta"
                disabled={pendingPlan === 'pro'}
                onClick={() => void handleUpgrade('pro')}
              >
                {t('proCta')}
              </button>
            </Reveal>

            <Reveal as="article" delay={120} className="agi-tier">
              <h3 className="agi-tier-name">{max.label}</h3>
              <p className="agi-tier-price">
                <span className="agi-tier-price-num">${max.monthlyPriceUsd}</span>
                <span className="agi-tier-price-sub">
                  {t('perMonthBilledMonthly')}
                  {currency === 'inr' ? ' · USD only' : ''}
                </span>
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
              <button
                type="button"
                className="agi-tier-cta"
                disabled={pendingPlan === 'max'}
                onClick={() => void handleUpgrade('max')}
              >
                {t('maxCta')}
              </button>
            </Reveal>
          </div>
        </section>

        {/* ──────────── Early access (anchor target for the checkout gate) ─ */}
        <section
          id="waitlist"
          className="agi-fl-section"
          aria-labelledby="pricing-waitlist-title"
          style={{ scrollMarginTop: 96 }}
        >
          <p className="agi-fl-eyebrow">{t('waitlistEyebrow')}</p>
          <h2 id="pricing-waitlist-title" className="agi-fl-h2">
            {t('waitlistHeading')}
          </h2>
          <p className="agi-fl-section-lede">{t('waitlistBody')}</p>
          <div style={{ marginTop: 28, maxWidth: 560 }}>
            <WaitlistForm source="billing" ctaLabel={t('requestHostedAccessCta')} />
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
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13,
                color: 'var(--agi-ink)',
              }}
            >
              <thead>
                <tr>
                  {['plan', 'price', 'billingInterval', 'usageCapacity', 'bestFor'].map((col) => (
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
                      {t(`compareCol${col.charAt(0).toUpperCase()}${col.slice(1)}`)}
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
    </div>
  );
}
