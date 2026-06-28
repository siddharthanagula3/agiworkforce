'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { BILLING_PLAN_PRICING, formatPrivacyModeLabel } from '@agiworkforce/types';
import { MARKETING_FEATURE_MATRIX, type PricingTabId } from '@/lib/marketing-constants';
import { FREE_TRIAL_PROMPT_LIMIT } from '@/lib/free-trial-config';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { Reveal } from '../../components/marketing/Reveal';
import { WaitlistTrigger } from '../../components/marketing/WaitlistModal';
import { WaitlistForm } from '../byok/WaitlistForm';

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

const PRICING_TABS: { id: PricingTabId; labelKey: string }[] = [
  { id: 'individual', labelKey: 'tabIndividual' },
  { id: 'team', labelKey: 'tabTeam' },
  { id: 'api', labelKey: 'tabApi' },
];

/**
 * Higher-capacity hosted plans shown on the Team tab. Managed cloud itself is
 * public-alpha-open (free hobby web access needs no waitlist); these paid tiers
 * add capacity and roll out via early access while STRIPE_CHECKOUT_ENABLED and
 * billing controls are proven (see app/api/checkout/route.ts).
 */
const TEAM_PLAN_IDS = ['pro', 'max'] as const;

/**
 * Annual savings vs monthly billing for one plan, from the canonical
 * billing catalog. Per-plan on purpose: Hobby's annual discount differs
 * from Pro/Max, so a single Hobby-derived badge overstated Pro/Max savings.
 */
function annualSavingsPct(plan: { monthlyPriceUsd: number; yearlyPriceUsd: number }): number {
  // A plan with no annual price (yearlyPriceUsd <= 0, e.g. Max is monthly-only)
  // is NOT offered annually — return 0 so it never renders a bogus "save 100%".
  if (plan.monthlyPriceUsd <= 0 || plan.yearlyPriceUsd <= 0) return 0;
  return Math.round((1 - plan.yearlyPriceUsd / 12 / plan.monthlyPriceUsd) * 100);
}

const TEAM_MAX_SAVINGS_PCT = Math.max(
  ...TEAM_PLAN_IDS.map((id) => annualSavingsPct(BILLING_PLAN_PRICING[id])),
);

export default function PricingPage() {
  const { t } = useTranslation('pricing');
  const [annual, setAnnual] = useState(false);
  const [activeTab, setActiveTab] = useState<PricingTabId>('individual');

  const localLabel = formatPrivacyModeLabel('local');
  const byokLabel = formatPrivacyModeLabel('byok');

  const comparisonRows = MARKETING_FEATURE_MATRIX[activeTab];

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
          <p className="agi-fl-section-lede">
            {t('pageLedePart1', { localLabel, byokLabel })} {t('pageLedePart2')}{' '}
            <strong>{t('pageLedePart3')}</strong>
          </p>
          <div className="agi-fl-cta-row">
            <Link href="/download" className="agi-fl-cta agi-fl-cta--primary">
              {t('installCta')}
            </Link>
            <Link href="/chat" className="agi-fl-cta agi-fl-cta--secondary">
              {t('tryAgiCta')}
            </Link>
            <WaitlistTrigger
              label={t('joinCloudWaitlistCta')}
              source="billing"
              className="agi-fl-cta agi-fl-cta--ghost"
            />
          </div>
          <ul className="agi-fl-mode-ribbon" aria-label={t('modeRibbonLabel')}>
            <li>{t('ribbonLocal')}</li>
            <li>{t('ribbonByok')}</li>
            <li>{t('ribbonCloud')}</li>
          </ul>
        </section>

        {/* ───────────────────────────── Plans ──────────────────────────── */}
        <section className="agi-fl-section" aria-labelledby="pricing-plans-title">
          <p className="agi-fl-eyebrow">{t('plansEyebrow')}</p>
          <h2 id="pricing-plans-title" className="agi-fl-h2">
            {t('plansHeading')}
          </h2>
          <p className="agi-fl-section-lede">{t('plansLede')}</p>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              alignItems: 'center',
              marginTop: 40,
            }}
          >
            <div className="agi-tier-toggle" role="group" aria-label={t('planTabsLabel')}>
              {PRICING_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={
                    activeTab === tab.id
                      ? 'agi-tier-toggle-btn agi-tier-toggle-btn--active'
                      : 'agi-tier-toggle-btn'
                  }
                >
                  {t(tab.labelKey)}
                </button>
              ))}
            </div>

            {/* Billing cadence toggle for hosted team tiers. */}
            {activeTab === 'team' && (
              <div className="agi-tier-toggle" role="group" aria-label={t('billingCadenceLabel')}>
                <button
                  type="button"
                  aria-pressed={!annual}
                  onClick={() => setAnnual(false)}
                  className={
                    annual
                      ? 'agi-tier-toggle-btn'
                      : 'agi-tier-toggle-btn agi-tier-toggle-btn--active'
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
                      ? 'agi-tier-toggle-btn agi-tier-toggle-btn--active'
                      : 'agi-tier-toggle-btn'
                  }
                >
                  {t('annual')}{' '}
                  <span className="agi-tier-toggle-save">
                    {t('annualSaveUpTo', { pct: TEAM_MAX_SAVINGS_PCT })}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Individual tab: Local + BYOK free forever, Hobby web trial */}
          {activeTab === 'individual' && (
            <div className="agi-tier-grid">
              <Reveal as="article" className="agi-tier">
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

              <Reveal as="article" delay={60} className="agi-tier">
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

              <Reveal as="article" delay={120} className="agi-tier">
                <h3 className="agi-tier-name">{t('hobby')}</h3>
                <p className="agi-tier-price">
                  <span className="agi-tier-price-num">{t('free')}</span>
                  <span className="agi-tier-price-sub">
                    {t('webTrialSub', { cap: FREE_TRIAL_PROMPT_LIMIT })}
                  </span>
                </p>
                <p className="agi-tier-body">{t('hobbyTierBody')}</p>
                <ul className="agi-tier-features">
                  <li>
                    <CheckIcon />
                    {t('hobbyFeature1', { cap: FREE_TRIAL_PROMPT_LIMIT })}
                  </li>
                  <li>
                    <CheckIcon />
                    {t('hobbyFeature2')}
                  </li>
                  <li>
                    <CheckIcon />
                    {t('hobbyFeature3')}
                  </li>
                  <li>
                    <CheckIcon />
                    {t('hobbyFeature4')}
                  </li>
                </ul>
                <div className="agi-tier-cta-group">
                  <Link href="/chat" className="agi-tier-cta">
                    {t('tryAgiCta')}
                  </Link>
                  <p className="agi-tier-cta-note">{t('managedWaitlistNote')}</p>
                </div>
              </Reveal>
            </div>
          )}

          {/* Team tab: higher-capacity hosted tiers, rolling out via early access */}
          {activeTab === 'team' && (
            <div className="agi-tier-grid">
              {TEAM_PLAN_IDS.map((planId, i) => {
                const plan = BILLING_PLAN_PRICING[planId];
                const planSavingsPct = annualSavingsPct(plan);
                // Plans with no annual price fall back to their monthly price even
                // when Annual is toggled, instead of rendering "$0.00 / save 100%".
                const annualOffered = plan.yearlyPriceUsd > 0;
                const displayPrice =
                  annual && annualOffered
                    ? `$${(plan.yearlyPriceUsd / 12).toFixed(2)}`
                    : `$${plan.monthlyPriceUsd.toFixed(2)}`;
                const sub =
                  annual && annualOffered
                    ? t('perMonthBilledAnnually')
                    : t('perMonthBilledMonthly');

                return (
                  <Reveal as="article" key={planId} delay={i * 60} className="agi-tier">
                    <h3 className="agi-tier-name">
                      {plan.label} <span className="agi-chip">{t('waitlistChip')}</span>
                    </h3>
                    <p className="agi-tier-price">
                      <span className="agi-tier-price-num">{displayPrice}</span>
                      <span className="agi-tier-price-sub">
                        {sub}
                        {annual && planSavingsPct > 0 ? (
                          <>
                            {' · '}
                            <span className="agi-tier-toggle-save">
                              {t('annualSave', { pct: planSavingsPct })}
                            </span>
                          </>
                        ) : null}
                      </span>
                    </p>
                    <p className="agi-tier-body">
                      {t(`${planId}TierBody`, { defaultValue: t('waitlistTierBody') })}
                    </p>
                    <div className="agi-tier-cta-group">
                      <WaitlistTrigger
                        label={t('joinPlanWaitlistCta', { plan: plan.label })}
                        source="billing"
                        className="agi-fl-cta agi-fl-cta--primary"
                      />
                      <p className="agi-tier-cta-note">{t('waitlistNote')}</p>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          )}

          {/* API tab: Enterprise, contact sales */}
          {activeTab === 'api' && (
            <Reveal className="agi-tier" as="div">
              <p className="agi-fl-eyebrow">{t('enterpriseEyebrow')}</p>
              <h3 className="agi-fl-h2">{t('enterpriseHeading')}</h3>
              <p className="agi-fl-section-lede">{t('enterpriseBody')}</p>
              <div className="agi-fl-cta-row">
                <Link href="/contact-sales" className="agi-fl-cta agi-fl-cta--primary">
                  {t('contactSalesCta')}
                </Link>
              </div>
            </Reveal>
          )}
        </section>

        {/* ──────────── Higher-capacity plans early access (anchor target) ──────────── */}
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
                {comparisonRows.map((row, i) => (
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
                      {row.waitlist && (
                        <span className="agi-chip" style={{ marginLeft: 8 }}>
                          {t('waitlistChip')}
                        </span>
                      )}
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
