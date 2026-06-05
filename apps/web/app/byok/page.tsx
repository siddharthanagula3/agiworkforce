import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { LAUNCH, POSITIONING } from '../../lib/marketing-constants';
import { WaitlistForm } from './WaitlistForm';

export const metadata: Metadata = {
  title: 'Bring Your Own API Keys (BYOK)',
  description: `Use your own Anthropic, OpenAI, Google, OpenRouter and more API keys in AGI desktop and developer surfaces. ${POSITIONING.wedge} ${LAUNCH.publicLabel}.`,
  alternates: { canonical: 'https://agiworkforce.com/byok' },
};

export default function ByokPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-page-hero">
          <p className="agi-section-eyebrow" style={{ marginBottom: 12 }}>
            Bring Your Own API Keys
          </p>
          <h1 className="agi-page-h1">Your keys. Your providers. No markup.</h1>
          <p className="agi-page-lede">
            Bring Anthropic, OpenAI, Google, OpenRouter, Groq, Mistral, xAI, DeepSeek, Perplexity,
            and compatible endpoints into AGI desktop and developer workflows. Pay providers
            directly.
            <strong> AGI does not mark up your BYOK usage.</strong>
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 100,
                background: 'color-mix(in srgb, var(--agi-amber) 15%, transparent)',
                border: '1px solid color-mix(in srgb, var(--agi-amber) 40%, transparent)',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--agi-amber)',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--agi-amber)',
                  display: 'inline-block',
                }}
              />
              {LAUNCH.publicLabel}
            </span>
          </div>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Free BYOK launch</p>
          <h2
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 22,
              fontWeight: 500,
              color: 'var(--text-1)',
              margin: '0 0 12px',
            }}
          >
            Use frontier models without AGI paying the token bill
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-2)', margin: '0 0 20px', maxWidth: 560 }}>
            BYOK is the fastest path to Claude and ChatGPT-style capability at launch: users keep
            provider ownership, AGI becomes the product shell on desktop and developer surfaces, and
            Cloud remains invite-only for users who want AGI-managed compute later.
          </p>
          <div className="agi-cta-row">
            <Link href="/waitlist" className="agi-cta-primary">
              {LAUNCH.ctaLabel}
            </Link>
            <Link href="/providers" className="agi-cta-ghost">
              See supported providers &rarr;
            </Link>
          </div>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">How keys are handled</p>
          <div className="agi-callout">
            <h2 className="agi-callout-h">{POSITIONING.trustBoundary}</h2>
            <p className="agi-callout-p">
              Desktop and developer surfaces store provider keys through the operating system
              keychain or local developer configuration. Web remains account and managed-cloud
              waitlist, not public BYOK chat. Mobile v1 does not accept provider keys. The active
              provider label stays visible wherever BYOK is available.
            </p>
          </div>
          <div style={{ marginTop: 16 }}>
            <Link
              href="/docs/byok-env"
              style={{ fontSize: 14, color: 'var(--agi-amber)', textDecoration: 'underline' }}
            >
              How to use env-based BYOK in v1 &rarr;
            </Link>
          </div>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">What ships on {LAUNCH.shortDate}</p>
          <ol className="agi-steps">
            <li className="agi-step">
              <span className="agi-step-n">01 / Add a provider</span>
              <h3 className="agi-step-h">Add a provider once</h3>
              <p className="agi-step-body">
                Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Mistral, Groq, OpenRouter and
                compatible endpoints on the BYOK-enabled desktop and developer surfaces. Start with
                one key and add more as your workflow grows.
              </p>
            </li>
            <li className="agi-step">
              <span className="agi-step-n">02 / Switch models mid-thread</span>
              <h3 className="agi-step-h">Change models without changing apps</h3>
              <p className="agi-step-body">
                Route BYOK-enabled work to Claude, GPT, Gemini, or local/open-compatible providers,
                with clear provider labels and no silent Local-to-BYOK handoff.
              </p>
            </li>
            <li className="agi-step">
              <span className="agi-step-n">03 / Pay providers directly</span>
              <h3 className="agi-step-h">Pay providers directly</h3>
              <p className="agi-step-body">
                Your usage is billed by the provider, not by AGI. Free Local and free BYOK let users
                try AGI without forcing AGI to subsidize every token.
              </p>
            </li>
          </ol>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Cloud invite</p>
          <div className="agi-callout">
            <h2 className="agi-callout-h">Want AGI-managed compute?</h2>
            <p className="agi-callout-p" style={{ marginBottom: 24 }}>
              Join the Cloud invite list. Cloud is for synced chats, hosted tools, and managed
              compute after Local and BYOK prove demand.
            </p>
            <WaitlistForm source="byok" ctaLabel="Request Cloud invite →" />
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
