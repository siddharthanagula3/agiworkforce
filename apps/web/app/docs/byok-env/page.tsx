import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { BYOK_PROVIDERS } from '@/lib/byok-providers';

export const metadata = buildMetadata({
  title: 'Provider-key configuration',
  description:
    'Configure provider credentials for a self-hosted AGI deployment, Desktop, CLI, or VS Code without crossing trust boundaries.',
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
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Provider keys</span>
          </nav>
          <h1 className="agi-page-h1">Provider-key configuration</h1>
          <p className="agi-page-lede">
            Self-hosted AGI deployments read operator-managed provider keys from environment
            variables. Desktop, CLI, and VS Code each provide a local credential flow for
            user-managed BYOK. Hosted Web and Mobile do not expose BYOK key entry.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Quick start (self-hosted operator)</p>
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
              border: '1px solid hsl(var(--border))',
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
          <p className="agi-section-eyebrow">Desktop (encrypted local storage)</p>
          <div className="agi-callout">
            <h2 className="agi-callout-h">Desktop writes to its encrypted local vault</h2>
            <p className="agi-callout-p">
              Tauri Desktop encrypts provider keys in local application storage and activates the
              selected direct-provider route without sending the key to AGI managed cloud. The CLI
              uses the operating system keyring; VS Code uses SecretStorage. These stores are
              surface-local and do not sync provider keys between apps.
            </p>
          </div>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Desktop key entry</p>
          <p style={{ fontSize: 14, color: 'var(--text-2)', margin: '0 0 16px' }}>
            Desktop can add provider keys during onboarding or in Settings → Models &amp; Keys. The
            native runtime writes them to secure local storage; self-hosted Web deployments continue
            to use environment variables. BYOK is not configured in AGI’s hosted Web or Mobile apps.
          </p>
          <Link
            href="/byok"
            style={{ fontSize: 14, color: 'var(--agi-amber)', textDecoration: 'underline' }}
          >
            Compare supported BYOK surfaces &rarr;
          </Link>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
