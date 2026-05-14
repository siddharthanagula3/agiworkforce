'use client';

import { useState } from 'react';
import Link from 'next/link';
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
  const [annual, setAnnual] = useState(false);
  const hobbyPrice = annual ? '$5' : '$10';
  const hobbySub = annual ? 'per month, billed annually' : 'per month, billed monthly';

  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Simple pricing.</h1>
          <p className="agi-page-lede">
            Local and BYOK are free forever. Hobby is the only paid tier shipping today - managed
            cloud at $10/mo, or $5/mo if you pay annually.{' '}
            <strong>Pro, Pro+, and Max are on the waitlist</strong> until our security audit closes.
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
              Monthly
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
              Annual <span className="agi-tier-toggle-save">save 50% on Hobby</span>
            </button>
          </div>

          <div className="agi-tier-grid">
            <article className="agi-tier">
              <h2 className="agi-tier-name">Local</h2>
              <p className="agi-tier-price">
                <span className="agi-tier-price-num">Free</span>
                <span className="agi-tier-price-sub">forever</span>
              </p>
              <p className="agi-tier-body">
                Run Ollama or LM Studio offline on your laptop. No keys, no quotas, no internet.
              </p>
              <ul className="agi-tier-features">
                <li>
                  <CheckIcon />
                  Local LLMs only - fully offline
                </li>
                <li>
                  <CheckIcon />
                  SQLite storage on disk
                </li>
                <li>
                  <CheckIcon />
                  No telemetry, no auth
                </li>
                <li>
                  <CheckIcon />
                  Desktop app only
                </li>
              </ul>
              <Link href="/download" className="agi-tier-cta agi-tier-cta--ghost">
                Install
              </Link>
            </article>

            <article className="agi-tier">
              <h2 className="agi-tier-name">BYOK</h2>
              <p className="agi-tier-price">
                <span className="agi-tier-price-num">Free</span>
                <span className="agi-tier-price-sub">forever</span>
              </p>
              <p className="agi-tier-body">
                Bring your own keys to any cloud provider. Pay them directly. We add zero markup.
              </p>
              <ul className="agi-tier-features">
                <li>
                  <CheckIcon />
                  10+ providers supported
                </li>
                <li>
                  <CheckIcon />
                  AES-256-GCM encryption at rest
                </li>
                <li>
                  <CheckIcon />
                  Optional cloud sync via Supabase
                </li>
                <li>
                  <CheckIcon />
                  Available on every surface
                </li>
              </ul>
              <Link href="/download" className="agi-tier-cta agi-tier-cta--ghost">
                Install
              </Link>
            </article>

            <article className="agi-tier">
              <h2 className="agi-tier-name">Hobby</h2>
              <p className="agi-tier-price">
                <span className="agi-tier-price-num">{hobbyPrice}</span>
                <span className="agi-tier-price-sub">{hobbySub}</span>
              </p>
              <p className="agi-tier-body">
                Managed cloud, basic models. We handle the keys; you just chat.
              </p>
              <ul className="agi-tier-features">
                <li>
                  <CheckIcon />
                  Auto-routing across our managed pool
                </li>
                <li>
                  <CheckIcon />
                  Cross-device sync included
                </li>
                <li>
                  <CheckIcon />
                  Email support, 48h response
                </li>
                <li>
                  <CheckIcon />
                  Limited daily credits
                </li>
              </ul>
              <div className="agi-tier-cta-group">
                <Link href="/login" className="agi-tier-cta">
                  Subscribe
                </Link>
                <p className="agi-tier-cta-note">No commitment. Cancel anytime.</p>
              </div>
            </article>
          </div>

          <p className="agi-tier-note">
            <span>
              <strong style={{ color: 'var(--agi-ink)' }}>Pro</strong> $29.99/mo &nbsp;·&nbsp;{' '}
              <strong style={{ color: 'var(--agi-ink)' }}>Pro+</strong> $49.99/mo &nbsp;·&nbsp;{' '}
              <strong style={{ color: 'var(--agi-ink)' }}>Max</strong> $299.99/mo - all on the
              waitlist until the security audit closes.
            </span>
            <Link href="/contact-sales">Enterprise - contact sales</Link>
          </p>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
