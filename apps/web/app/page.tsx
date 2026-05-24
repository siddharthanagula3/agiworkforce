import type { Metadata } from 'next';
import { Header } from '../components/layout/Header';
import { MarketingFooter } from '../components/marketing/MarketingFooter';
import { AgiChatDemo } from '../components/agi/AgiChatDemo';
import { MARKETING } from '../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'AGI: Beyond one model. Beyond one surface.',
  description:
    'Beyond one model. Beyond one surface. AGI in your hands. ' +
    `${MARKETING.providers.display} AI providers in one thread, ` +
    'across desktop, web, mobile, CLI, VS Code, and Chrome. BYOK or run fully offline with Ollama and LM Studio.',
  keywords: [
    'AI agent',
    'AI automation',
    'desktop AI app',
    'privacy-first AI',
    'local AI',
    'BYOK AI',
    'offline AI',
    'multi-provider AI',
    'Tauri desktop app',
    'Ollama',
    'LM Studio',
    'OpenAI',
    'Anthropic',
    'Gemini',
    'data privacy',
  ],
  openGraph: {
    title: 'AGI: Beyond one model. Beyond one surface.',
    description:
      'Beyond one model. Beyond one surface. AGI in your hands. ' +
      `${MARKETING.providers.display} AI providers in one thread.`,
    type: 'website',
    url: 'https://agiworkforce.com',
    images: [{ url: '/app-preview.png', width: 1200, height: 630, alt: 'AGI' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AGI: Beyond one model. Beyond one surface.',
    description:
      'Beyond one model. Beyond one surface. AGI in your hands. ' +
      `${MARKETING.providers.display} providers, ${MARKETING.surfaces.display} surfaces, one workforce.`,
    images: ['/app-preview.png'],
  },
};

export default function Home() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-hero">
          <h1 className="agi-h1">
            <span className="agi-h1-line">Beyond one model.</span>
            <span className="agi-h1-line agi-h1-line--quiet">Beyond one surface.</span>
            <span className="agi-h1-line">AGI in your hands.</span>
          </h1>

          <p className="agi-lede">
            {MARKETING.providers.display} providers in one thread. Switch mid-conversation; the
            history follows. Bring your own keys, run fully offline, or join the managed-cloud
            waitlist. <strong>One platform. Every model. Your choice.</strong>
          </p>

          <div className="agi-cta-row">
            <a href="/download" className="agi-cta-primary">
              Install
            </a>
            <a href="/providers" className="agi-cta-ghost">
              Try the demo →
            </a>
          </div>
        </section>

        <section className="agi-demo">
          <AgiChatDemo />
        </section>

        {/* Mobile launch announcement banner */}
        <section className="agi-section" style={{ paddingTop: 0 }}>
          <div
            className="agi-callout"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 20,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--agi-amber)',
                  margin: '0 0 8px',
                }}
              >
                Mobile-first MVP
              </p>
              <h2 className="agi-callout-h" style={{ marginBottom: 6 }}>
                AGI Mobile is coming.
              </h2>
              <p className="agi-callout-p">
                Local-first and BYOK-first AI for iOS and Android, with managed compute waitlisted.
              </p>
            </div>
            <a
              href="/mobile"
              className="agi-cta-primary"
              style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
            >
              Learn more &rarr;
            </a>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
