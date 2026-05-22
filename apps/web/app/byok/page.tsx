import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { WaitlistForm } from './WaitlistForm';

export const metadata: Metadata = {
  title: 'Bring Your Own API Keys (BYOK) | AGI',
  description:
    'Use your own Anthropic, OpenAI, Mistral, Groq, OpenRouter and more API keys directly in AGI Workforce. Pay providers directly. No middleman markup. UI key entry launching in Cloud Managed private beta.',
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
            Use your own Anthropic, OpenAI, Mistral, Groq, OpenRouter and more API keys directly in
            AGI Workforce. Pay providers directly. No middleman markup.
          </p>

          {/* Status badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 100,
                background: 'color-mix(in srgb, var(--amber, #c8892a) 15%, transparent)',
                border: '1px solid color-mix(in srgb, var(--amber, #c8892a) 40%, transparent)',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--amber, #c8892a)',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--amber, #c8892a)',
                  display: 'inline-block',
                }}
              />
              Coming soon (Cloud Managed beta)
            </span>
          </div>
        </section>

        {/* Main CTA */}
        <section className="agi-section">
          <p className="agi-section-eyebrow">Join the waitlist</p>
          <h2
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 22,
              fontWeight: 500,
              color: 'var(--text-1)',
              margin: '0 0 12px',
            }}
          >
            Be first when Cloud Managed private beta opens
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-2)', margin: '0 0 20px', maxWidth: 560 }}>
            UI key entry, OS-keychain storage, and revoke-all are launching in Cloud Managed private
            beta. Enter your email and we will notify you the moment it opens.
          </p>
          <WaitlistForm source="byok" ctaLabel="Join Cloud Managed waitlist" />
        </section>

        {/* v1 env-based BYOK explanation */}
        <section className="agi-section">
          <p className="agi-section-eyebrow">v1 env-based BYOK</p>
          <div className="agi-callout">
            <h2 className="agi-callout-h">Already available today</h2>
            <p className="agi-callout-p">
              v1 supports env-based BYOK keys. Self-hosted users set keys in{' '}
              <code style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>.env.local</code>; desktop
              users set them via the OS keychain. UI key entry is launching in Cloud Managed private
              beta.
            </p>
          </div>
          <div style={{ marginTop: 16 }}>
            <Link
              href="/docs/byok-env"
              style={{ fontSize: 14, color: 'var(--amber, #c8892a)', textDecoration: 'underline' }}
            >
              How to use env-based BYOK in v1 &rarr;
            </Link>
          </div>
        </section>

        {/* What is included when it ships */}
        <section className="agi-section">
          <p className="agi-section-eyebrow">What ships in Cloud Managed beta</p>
          <ol className="agi-steps">
            <li className="agi-step">
              <span className="agi-step-n">01 / Paste your key via UI</span>
              <h3 className="agi-step-h">Paste your key via UI</h3>
              <p className="agi-step-body">
                Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Mistral, Groq, OpenRouter and
                more. Paste once; we never ask again.
              </p>
            </li>
            <li className="agi-step">
              <span className="agi-step-n">02 / OS-keychain storage</span>
              <h3 className="agi-step-h">OS-keychain storage</h3>
              <p className="agi-step-body">
                Keys are stored in the OS keychain, not in our database. Desktop syncs via encrypted
                vault; web uses local keyring.
              </p>
            </li>
            <li className="agi-step">
              <span className="agi-step-n">03 / Pay providers directly</span>
              <h3 className="agi-step-h">Pay providers directly</h3>
              <p className="agi-step-body">
                Your usage is billed by the provider, not by us. Zero markup. Whatever Anthropic or
                OpenAI charge, that is what you pay.
              </p>
            </li>
          </ol>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
