import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'API docs | AGI Workforce',
  description:
    'API reference for the AGI Workforce gateway. OpenAI-compatible endpoints, BYOK across providers.',
  alternates: { canonical: 'https://agiworkforce.com/api-docs' },
};

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
              <span className="agi-terminal-prompt">$</span>curl
              https://agiworkforce.com/api/llm/v1/chat/completions \{'\n'}
              {'    '}-H &quot;Authorization: Bearer $YOUR_KEY&quot; \{'\n'}
              {'    '}-H &quot;Content-Type: application/json&quot; \{'\n'}
              {'    '}-d &apos;{'{'} &quot;model&quot;: &quot;auto&quot;, &quot;messages&quot;: [
              {'{'}&quot;role&quot;:&quot;user&quot;,&quot;content&quot;:&quot;hello&quot;{'}'}]{' '}
              {'}'}&apos;
            </pre>
          </div>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Reference</p>
          <p className="agi-page-lede" style={{ marginTop: 0, marginBottom: 24 }}>
            Full OpenAPI spec, Postman collection, and SDK examples are on GitHub.
          </p>
          <div className="agi-cta-row">
            <a
              href="https://github.com/siddharthanagula3/agiworkforce/tree/main/docs/api"
              target="_blank"
              rel="noopener noreferrer"
              className="agi-cta-primary"
            >
              View on GitHub
            </a>
            <Link href="/byok" className="agi-cta-ghost">
              How BYOK works →
            </Link>
          </div>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
