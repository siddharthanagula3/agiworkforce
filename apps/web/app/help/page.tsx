import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { CapabilityGrid } from '@/features/marketing/components/FlagshipSections';
import { MARKETING } from '../../lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'Help',
  description: 'Quick links into the parts of the product most people ask about.',
  path: '/help',
});

export default function HelpPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-help-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">Help</p>
          <h1 id="agi-help-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">Get unstuck,</span>{' '}
            <span className="agi-fl-h1-line">
              <em className="agi-fl-h1-em">fast.</em>
            </span>
          </h1>
          <p className="agi-fl-lede">
            The six things people ask about most, each one link away. For anything else, email
            contact@agiworkforce.com. A real human reads it.
          </p>
          <div style={{ paddingBottom: 'clamp(48px, 7vw, 88px)' }}>
            <ul className="agi-fl-mode-ribbon" aria-label="Trust modes">
              <li>Local · on-device</li>
              <li>BYOK · your keys</li>
              <li>Cloud · public alpha</li>
            </ul>
          </div>
        </section>

        <CapabilityGrid
          eyebrow="Common asks"
          title="Start with the page that answers it."
          items={[
            {
              meta: 'Install',
              title: 'Get the apps',
              body: 'Desktop installer routes for macOS, Windows, and Linux open as release assets become available. The CLI page carries the current agi install guide.',
              href: '/download',
            },
            {
              meta: 'BYOK',
              title: 'Add your API key',
              body: 'Bring your own provider keys on Desktop and CLI, encrypted at rest on your machine.',
              href: '/byok',
            },
            {
              meta: 'Local',
              title: 'Run offline',
              body: 'Ollama or LM Studio on your own hardware. No keys, no quotas, no internet.',
              href: '/local',
            },
            {
              meta: 'Models',
              title: 'Switch models',
              body: `${MARKETING.models.display} models across ${MARKETING.providers.display} providers, switchable mid-conversation.`,
              href: '/providers',
            },
            {
              meta: 'Terminal',
              title: 'Use the CLI',
              body: 'A Rust-native developer agent: resumable sessions, sandboxed execution, offline-capable.',
              href: '/cli',
            },
            {
              meta: 'Plans',
              title: 'See pricing',
              body: 'Local and BYOK are free. Managed cloud is public alpha, open by default (metered). Current details live on the pricing page.',
              href: '/pricing',
            },
          ]}
        />

        <section className="agi-fl-section" aria-labelledby="agi-help-more-title">
          <p className="agi-fl-eyebrow">More</p>
          <h2 id="agi-help-more-title" className="agi-fl-h2">
            Still stuck? Ask a human.
          </h2>
          <p className="agi-fl-section-lede">
            The FAQ covers the why, support covers the what-now, and the inbox covers everything
            else.
          </p>
          <div className="agi-fl-cta-row">
            <Link href="/faq" className="agi-fl-cta agi-fl-cta--primary">
              Read the FAQ
            </Link>
            <Link href="/support" className="agi-fl-cta agi-fl-cta--secondary">
              Get Support
            </Link>
            <a href="mailto:contact@agiworkforce.com" className="agi-fl-cta agi-fl-cta--ghost">
              Email Us
            </a>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
