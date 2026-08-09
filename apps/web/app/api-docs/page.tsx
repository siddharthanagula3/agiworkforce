import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';

export const metadata = buildMetadata({
  title: 'API docs',
  description:
    'API reference for the AGI gateway. OpenAI-compatible endpoints, BYOK across providers.',
  path: '/api-docs',
});

export default function ApiDocsPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">API docs.</h1>
          <p className="agi-page-lede">
            OpenAI-compatible endpoints. Bring your own key, route to any of the wired providers,
            stream tokens back.{' '}
            <strong>The gateway is the same engine the apps use; the API just exposes it.</strong>
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Quick start</p>
          <div className="agi-terminal">
            <div className="agi-terminal-bar">curl example</div>
            <pre className="agi-terminal-pre">
              <span className="agi-terminal-prompt">$ </span>curl
              https://agiworkforce.com/api/llm/v1/chat/completions {'\\'}
              {'\n'}
              {'    '}-H &quot;Authorization: Bearer $YOUR_KEY&quot; {'\\'}
              {'\n'}
              {'    '}-H &quot;Content-Type: application/json&quot; {'\\'}
              {'\n'}
              {'    '}-d &apos;{'{'} &quot;model&quot;: &quot;auto&quot;, &quot;messages&quot;: [
              {'{'}&quot;role&quot;:&quot;user&quot;,&quot;content&quot;:&quot;hello&quot;{'}'}]{' '}
              {'}'}&apos;
            </pre>
          </div>
          <p className="agi-page-lede" style={{ marginTop: 16, marginBottom: 0 }}>
            Two credentials reach this API and they are not interchangeable. An AGI API key (
            <code>sk_live_…</code>, issued under Settings → API Keys) authenticates the model
            catalog, audio transcriptions, and the credit balance. Chat completions and embeddings
            take a session bearer token. Every operation in the bundle below names the credential it
            accepts.
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Reference</p>
          <p className="agi-page-lede" style={{ marginTop: 0, marginBottom: 24 }}>
            The OpenAPI 3 bundle is published. It describes every endpoint that ships and the
            credential each one takes. There is no Postman collection and no client SDK — call the
            REST endpoints directly.
          </p>
          <div className="agi-cta-row">
            <a href="/openapi.json" className="agi-cta-primary">
              OpenAPI bundle
            </a>
            <Link href="/docs/byok-env" className="agi-cta-ghost">
              BYOK setup
            </Link>
            <Link href="/waitlist" className="agi-cta-ghost">
              SSO &amp; org-seat early access →
            </Link>
          </div>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
