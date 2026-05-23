'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { BILLING_PLAN_PRICING, formatPrivacyModeLabel } from '@agiworkforce/types';
import { MARKETING_FEATURE_MATRIX, type PricingTabId } from '@/lib/marketing-constants';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

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

const PRICING_TABS: { id: PricingTabId; label: string }[] = [
  { id: 'individual', label: 'Individual' },
  { id: 'team', label: 'Team' },
  { id: 'api', label: 'API' },
];

export default function PricingPage() {
  const { t } = useTranslation('pricing');
  const [annual, setAnnual] = useState(false);
  const [activeTab, setActiveTab] = useState<PricingTabId>('individual');

  const localLabel = formatPrivacyModeLabel('local');
  const byokLabel = formatPrivacyModeLabel('byok');
  const managedLabel = formatPrivacyModeLabel('managed');
  const hobbyMonthly = BILLING_PLAN_PRICING.hobby.monthlyPriceUsd;
  const hobbyYearly = BILLING_PLAN_PRICING.hobby.yearlyPriceUsd;
  const hobbyAnnualPerMonth = hobbyYearly / 12;
  const hobbyPrice = annual ? `$${hobbyAnnualPerMonth.toFixed(2)}` : `$${hobbyMonthly}`;
  const hobbySub = annual ? t('perMonthBilledAnnually') : t('perMonthBilledMonthly');
  const hobbySavingsPct = Math.round((1 - hobbyAnnualPerMonth / hobbyMonthly) * 100);

  const comparisonRows = MARKETING_FEATURE_MATRIX[activeTab];

  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-page-hero">
          <h1 className="agi-page-h1">{t('pageTitle')}</h1>
          <p className="agi-page-lede">
            {t('pageLedePart1', { localLabel, byokLabel })}{' '}
            {t('pageLedePart2', {
              managedLabel: managedLabel.toLowerCase(),
              hobbyMonthly,
              hobbyAnnualPerMonth: hobbyAnnualPerMonth.toFixed(2),
            })}{' '}
            <strong>{t('pageLedePart3')}</strong>
          </p>
        </section>

        <section className="agi-section">
          {/* Plan audience tabs */}
          <div
            role="tablist"
            aria-label={t('planTabsLabel')}
            style={{
              display: 'inline-flex',
              gap: 0,
              border: '1px solid var(--agi-rule)',
              borderRadius: 8,
              padding: 4,
              marginBottom: 32,
            }}
          >
            {PRICING_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '7px 20px',
                  borderRadius: 5,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 500,
                  fontFamily: 'inherit',
                  transition:
                    'background var(--agi-dur-fast) var(--agi-ease-out), color var(--agi-dur-fast) var(--agi-ease-out)',
                  background: activeTab === tab.id ? 'var(--agi-ink)' : 'transparent',
                  color: activeTab === tab.id ? 'var(--agi-bg)' : 'var(--agi-ink-2)',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Billing cadence toggle — only relevant for individual/team */}
          {activeTab !== 'api' && (
            <div className="agi-tier-toggle" role="tablist" aria-label={t('billingCadenceLabel')}>
              <button
                type="button"
                role="tab"
                aria-selected={!annual}
                onClick={() => setAnnual(false)}
                className={
                  annual ? 'agi-tier-toggle-btn' : 'agi-tier-toggle-btn agi-tier-toggle-btn--active'
                }
              >
                {t('monthly')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={annual}
                onClick={() => setAnnual(true)}
                className={
                  annual ? 'agi-tier-toggle-btn agi-tier-toggle-btn--active' : 'agi-tier-toggle-btn'
                }
              >
                {t('annual')}{' '}
                <span className="agi-tier-toggle-save">
                  {t('annualSave', { pct: hobbySavingsPct })}
                </span>
              </button>
            </div>
          )}

          {/* Individual tab: tier cards */}
          {activeTab === 'individual' && (
            <div className="agi-tier-grid">
              <article className="agi-tier">
                <h2 className="agi-tier-name">{localLabel}</h2>
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
              </article>

              <article className="agi-tier">
                <h2 className="agi-tier-name">{byokLabel}</h2>
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
              </article>

              <article className="agi-tier">
                <h2 className="agi-tier-name">{t('hobby')}</h2>
                <p className="agi-tier-price">
                  <span className="agi-tier-price-num">{hobbyPrice}</span>
                  <span className="agi-tier-price-sub">{hobbySub}</span>
                </p>
                <p className="agi-tier-body">{t('hobbyTierBody')}</p>
                <ul className="agi-tier-features">
                  <li>
                    <CheckIcon />
                    {t('hobbyFeature1')}
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
                  <Link href="/login" className="agi-tier-cta">
                    {t('subscribeCta')}
                  </Link>
                  <p className="agi-tier-cta-note">{t('noCommitment')}</p>
                </div>
              </article>
            </div>
          )}

          {/* Team tab: waitlisted tier cards */}
          {activeTab === 'team' && (
            <div className="agi-tier-grid">
              {(['pro', 'pro_plus', 'max'] as const).map((planId) => {
                const plan = BILLING_PLAN_PRICING[planId];
                const monthlyPrice = plan.monthlyPriceUsd;
                const yearlyPerMonth = plan.yearlyPriceUsd / 12;
                const displayPrice = annual
                  ? `$${yearlyPerMonth.toFixed(2)}`
                  : `$${monthlyPrice.toFixed(2)}`;
                const sub = annual ? t('perMonthBilledAnnually') : t('perMonthBilledMonthly');

                return (
                  <article key={planId} className="agi-tier">
                    <h2 className="agi-tier-name">{plan.label}</h2>
                    <p className="agi-tier-price">
                      <span className="agi-tier-price-num">{displayPrice}</span>
                      <span className="agi-tier-price-sub">{sub}</span>
                    </p>
                    <p className="agi-tier-body">
                      {t(`${planId}TierBody`, { defaultValue: t('waitlistTierBody') })}
                    </p>
                    <div className="agi-tier-cta-group">
                      <Link href="/pricing#waitlist" className="agi-tier-cta">
                        {t('joinWaitlistCta')}
                      </Link>
                      <p className="agi-tier-cta-note">{t('waitlistNote')}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* API / Enterprise tab */}
          {activeTab === 'api' && (
            <div
              style={{
                maxWidth: 560,
                margin: '0 auto',
                padding: '48px 0',
                textAlign: 'center',
              }}
            >
              <p
                style={{
                  fontSize: 12,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--agi-ink-quiet)',
                  marginBottom: 16,
                  fontFamily: 'var(--agi-font-mono)',
                }}
              >
                {t('enterpriseEyebrow')}
              </p>
              <h2
                style={{
                  fontSize: 36,
                  fontWeight: 700,
                  letterSpacing: '-0.03em',
                  color: 'var(--agi-ink)',
                  marginBottom: 16,
                }}
              >
                {t('enterpriseHeading')}
              </h2>
              <p
                style={{
                  fontSize: 15,
                  color: 'var(--agi-ink-2)',
                  lineHeight: 1.6,
                  marginBottom: 32,
                }}
              >
                {t('enterpriseBody')}
              </p>
              <Link
                href="/contact-sales"
                className="agi-cta-primary"
                style={{ textDecoration: 'none' }}
              >
                {t('contactSalesCta')}
              </Link>
            </div>
          )}
        </section>

        {/* W1-05: Plan comparison table */}
        <section
          className="agi-section"
          style={{ borderTop: '1px solid var(--agi-rule)', paddingTop: 48 }}
        >
          <h2 className="agi-section-h2" style={{ marginBottom: 8 }}>
            {t('compareHeading')}
          </h2>
          <p
            style={{
              fontSize: 14,
              color: 'var(--agi-ink-2)',
              marginBottom: 32,
            }}
          >
            {t('compareSubheading')}
          </p>
          <div style={{ overflowX: 'auto' }}>
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
                      }}
                    >
                      {row.label}
                      {row.waitlist && (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 10,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: 'var(--agi-rule)',
                            color: 'var(--agi-bg)',
                            fontWeight: 500,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            fontFamily: 'var(--agi-font-mono)',
                          }}
                        >
                          {t('waitlistBadge')}
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
