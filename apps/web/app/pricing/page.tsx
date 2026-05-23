'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { BILLING_PLAN_PRICING, formatPrivacyModeLabel } from '@agiworkforce/types';
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

export default function PricingPage() {
  const { t } = useTranslation('pricing');
  const [annual, setAnnual] = useState(false);
  const localLabel = formatPrivacyModeLabel('local');
  const byokLabel = formatPrivacyModeLabel('byok');
  const managedLabel = formatPrivacyModeLabel('managed');
  const hobbyMonthly = BILLING_PLAN_PRICING.hobby.monthlyPriceUsd;
  const hobbyYearly = BILLING_PLAN_PRICING.hobby.yearlyPriceUsd;
  const hobbyAnnualPerMonth = hobbyYearly / 12;
  const hobbyPrice = annual ? `$${hobbyAnnualPerMonth.toFixed(2)}` : `$${hobbyMonthly}`;
  const hobbySub = annual ? t('perMonthBilledAnnually') : t('perMonthBilledMonthly');
  const proMonthly = BILLING_PLAN_PRICING.pro.monthlyPriceUsd;
  const proPlusMonthly = BILLING_PLAN_PRICING.pro_plus.monthlyPriceUsd;
  const maxMonthly = BILLING_PLAN_PRICING.max.monthlyPriceUsd;
  const hobbySavingsPct = Math.round((1 - hobbyAnnualPerMonth / hobbyMonthly) * 100);

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
          <div className="agi-tier-toggle" role="tablist" aria-label="Billing cadence">
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

          <p className="agi-tier-note">
            <span>
              <strong style={{ color: 'var(--agi-ink)' }}>Pro</strong> ${proMonthly}/mo
              &nbsp;·&nbsp; <strong style={{ color: 'var(--agi-ink)' }}>Pro+</strong> $
              {proPlusMonthly}/mo &nbsp;·&nbsp;{' '}
              <strong style={{ color: 'var(--agi-ink)' }}>Max</strong> ${maxMonthly}/mo -{' '}
              {t('waitlistNote')}
            </span>
            <Link href="/contact-sales">{t('enterpriseCta')}</Link>
          </p>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
