'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AgiTopBar } from '../AgiTopBar';
import { AgiFooter } from '../AgiFooter';

/*
 * Pricing — three shipping tiers as cards, waitlist tiers as a footnote line.
 * Hobby is the only tier with annual discount (50% off → $5/mo billed yearly).
 * Per the locked policy, no version numbers, no test counts, no model IDs.
 */

export default function RedesignPreviewPricingPage() {
  const [annual, setAnnual] = useState(false);
  const hobbyPrice = annual ? '$5' : '$10';
  const hobbySub = annual ? 'per month, billed annually' : 'per month, billed monthly';

  return (
    <main className="pv-shell">
      <AgiTopBar />

      <section className="pv-page-hero">
        <h1 className="pv-page-h1">Simple pricing.</h1>
        <p className="pv-page-lede">
          Local and BYOK are free forever. Hobby is the only paid tier shipping today — managed
          cloud at $10/mo, or $5/mo if you pay annually.{' '}
          <strong>Pro, Pro+, and Max are on the waitlist</strong> until our security audit closes.
        </p>
      </section>

      <section className="pv-section">
        <div className="pv-tier-toggle" role="tablist" aria-label="Billing cadence">
          <button
            type="button"
            role="tab"
            aria-selected={!annual}
            onClick={() => setAnnual(false)}
            className={
              annual ? 'pv-tier-toggle-btn' : 'pv-tier-toggle-btn pv-tier-toggle-btn--active'
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
              annual ? 'pv-tier-toggle-btn pv-tier-toggle-btn--active' : 'pv-tier-toggle-btn'
            }
          >
            Annual <span className="pv-tier-toggle-save">save 50% on Hobby</span>
          </button>
        </div>

        <div className="pv-tier-grid">
          <article className="pv-tier">
            <h2 className="pv-tier-name">Local</h2>
            <p className="pv-tier-price">
              <span className="pv-tier-price-num">Free</span>
              <span className="pv-tier-price-sub">forever</span>
            </p>
            <p className="pv-tier-body">
              Run Ollama or LM Studio offline on your laptop. No keys, no quotas, no internet.
            </p>
            <ul className="pv-tier-features">
              <li>Local LLMs only — fully offline</li>
              <li>SQLite storage on disk</li>
              <li>No telemetry, no auth</li>
              <li>Desktop app only</li>
            </ul>
            <Link href="/download" className="pv-tier-cta pv-tier-cta--ghost">
              Install
            </Link>
          </article>

          <article className="pv-tier">
            <h2 className="pv-tier-name">BYOK</h2>
            <p className="pv-tier-price">
              <span className="pv-tier-price-num">Free</span>
              <span className="pv-tier-price-sub">forever</span>
            </p>
            <p className="pv-tier-body">
              Bring your own keys to any cloud provider. Pay them directly. We add zero markup.
            </p>
            <ul className="pv-tier-features">
              <li>10+ providers supported</li>
              <li>AES-256-GCM encryption at rest</li>
              <li>Optional cloud sync via Supabase</li>
              <li>Available on every surface</li>
            </ul>
            <Link href="/download" className="pv-tier-cta pv-tier-cta--ghost">
              Install
            </Link>
          </article>

          <article className="pv-tier">
            <h2 className="pv-tier-name">Hobby</h2>
            <p className="pv-tier-price">
              <span className="pv-tier-price-num">{hobbyPrice}</span>
              <span className="pv-tier-price-sub">{hobbySub}</span>
            </p>
            <p className="pv-tier-body">
              Managed cloud, basic models. We handle the keys; you just chat.
            </p>
            <ul className="pv-tier-features">
              <li>Auto-routing across our managed pool</li>
              <li>Cross-device sync included</li>
              <li>Email support, 48h response</li>
              <li>Limited daily credits</li>
            </ul>
            <Link href="/login" className="pv-tier-cta">
              Subscribe
            </Link>
          </article>
        </div>

        <p className="pv-tier-note">
          <span>
            <strong style={{ color: 'var(--pv-ink)' }}>Pro</strong> $29.99/mo &nbsp;·&nbsp;{' '}
            <strong style={{ color: 'var(--pv-ink)' }}>Pro+</strong> $49.99/mo &nbsp;·&nbsp;{' '}
            <strong style={{ color: 'var(--pv-ink)' }}>Max</strong> $299.99/mo — all on the waitlist
            until the security audit closes.
          </span>
          <Link href="/contact-sales">Enterprise — contact sales →</Link>
        </p>
      </section>

      <AgiFooter />
    </main>
  );
}
