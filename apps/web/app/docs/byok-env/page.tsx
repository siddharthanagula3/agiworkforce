import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '../../../components/layout/Header';
import { MarketingFooter } from '../../../components/marketing/MarketingFooter';
import { BYOK_PROVIDERS } from '@/lib/byok-providers';

export const metadata = buildMetadata({
  title: 'Env-based BYOK in v1',
  description:
    'How to configure provider API keys via environment variables in AGI v1. Self-hosted .env.local setup and desktop OS keychain reference.',
  path: '/docs/byok-env',
});

export default function ByokEnvDocsPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-page-hero">
          <nav aria-label="Breadcrumb" style={{ marginBottom: 16 }}>
            <Link
              href="/docs"
              style={{ fontSize: 13, color: 'var(--text-3)', textDecoration: 'none' }}
            >
              Docs
            </Link>
            <span style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 6px' }}>/</span>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Env-based BYOK</span>
          </nav>
          <h1 className="agi-page-h1">Env-based BYOK in v1</h1>
          <p className="agi-page-lede">
            AGI v1 supports bring-your-own-key via environment variables. Set the provider key in
            your environment and AGI picks it up automatically. No UI form required.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Quick start (self-hosted / web)</p>
          <div className="agi-callout">
            <h2 className="agi-callout-h">1. Create or edit .env.local</h2>
            <p className="agi-callout-p">
              In the root of your self-hosted deployment (or{' '}
              <code style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>apps/web/</code> for local
              dev), create or edit{' '}
              <code style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>.env.local</code> and add
              the keys for the providers you want to use.
            </p>
          </div>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Supported providers and env vars</p>
          <p style={{ fontSize: 14, color: 'var(--text-2)', margin: '0 0 16px' }}>
            Set any combination below. Only providers with a key present will be active.
          </p>
          <table className="agi-ledger">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Provider</th>
                <th style={{ textAlign: 'left' }}>Environment variable</th>
                <th style={{ textAlign: 'left' }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {BYOK_PROVIDERS.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>{p.label}</td>
                  <td>
                    <code style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{p.envVar}</code>
                  </td>
                  <td style={{ color: 'var(--text-3)', fontSize: 13 }}>
                    {p.pendingAdapter ? 'Planned adapter' : 'Active in v1'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Example .env.local</p>
          <pre
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 13,
              background: 'var(--bg-elev)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '16px 20px',
              overflowX: 'auto',
              color: 'var(--text-2)',
              lineHeight: 1.7,
            }}
          >
            {`# .env.local - never commit this file
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AIza...

# Add any others you want active
# DEEPSEEK_API_KEY=...
# PERPLEXITY_API_KEY=pplx-...`}
          </pre>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Desktop (OS keychain)</p>
          <div className="agi-callout">
            <h2 className="agi-callout-h">Desktop reads from OS keychain</h2>
            <p className="agi-callout-p">
              On macOS the desktop app reads keys from Keychain Access under the service name{' '}
              <code style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>agiworkforce</code>. On
              Windows it uses Credential Manager. On Linux it uses the Secret Service API
              (libsecret). Keys stored there take precedence over{' '}
              <code style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>PROVIDER_API_KEY</code>{' '}
              environment variables.
            </p>
          </div>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Private-beta key entry</p>
          <p style={{ fontSize: 14, color: 'var(--text-2)', margin: '0 0 16px' }}>
            UI key entry, OS-keychain write, and revoke-all are private-beta flows. Until those
            routes are public, env vars are the supported path.
          </p>
          <Link
            href="/waitlist"
            style={{ fontSize: 14, color: 'var(--agi-amber)', textDecoration: 'underline' }}
          >
            Join Team &amp; Enterprise early access &rarr;
          </Link>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
