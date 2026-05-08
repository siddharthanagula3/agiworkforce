import type { Metadata } from 'next';
import { Header } from '../components/layout/Header';
import { MarketingFooter } from '../components/marketing/MarketingFooter';
import { AgiChatDemo } from '../components/agi/AgiChatDemo';
import { MARKETING } from '../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'AGI Workforce: Beyond one model. Beyond one surface.',
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
    title: 'AGI Workforce: Beyond one model. Beyond one surface.',
    description:
      'Beyond one model. Beyond one surface. AGI in your hands. ' +
      `${MARKETING.providers.display} AI providers in one thread.`,
    type: 'website',
    url: 'https://agiworkforce.com',
    images: [{ url: '/app-preview.png', width: 1200, height: 630, alt: 'AGI Workforce' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AGI Workforce: Beyond one model. Beyond one surface.',
    description:
      'Beyond one model. Beyond one surface. AGI in your hands. ' +
      `${MARKETING.providers.display} providers, ${MARKETING.surfaces.display} surfaces, one workforce.`,
    images: ['/app-preview.png'],
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'AGI Workforce',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'macOS, Windows, Linux',
  featureList: [
    `${MARKETING.providers.display} AI providers in one chat thread`,
    `${MARKETING.surfaces.display} surfaces: Desktop, Web, Mobile, CLI, VS Code, Chrome`,
    'BYOK: bring your own API keys',
    'Run fully offline with Ollama or LM Studio',
    'Cross-provider session continuity: switch models mid-conversation',
    'AES-256-GCM encrypted key storage',
    'No training on your data',
  ],
};

export default function Home() {
  return (
    <div data-design="agi">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="agi-shell">
        <Header />

        <section className="agi-hero">
          <h1 className="agi-h1">
            <span className="agi-h1-line">Beyond one model.</span>
            <span className="agi-h1-line agi-h1-line--quiet">Beyond one surface.</span>
            <span className="agi-h1-line">AGI in your hands.</span>
          </h1>

          <p className="agi-lede">
            Twelve providers in one thread. Switch mid-conversation; the history follows. Bring your
            own keys, run fully offline, or use our managed cloud.{' '}
            <strong>Anthropic locks you to Claude. We don&rsquo;t.</strong>
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

        <MarketingFooter />
      </main>
    </div>
  );
}
