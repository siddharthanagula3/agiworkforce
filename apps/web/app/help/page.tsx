import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Help | AGI Workforce',
  description: 'Quick links into the parts of the product most people ask about.',
  alternates: { canonical: 'https://agiworkforce.com/help' },
};

const QUICK: { href: string; label: string; body: string }[] = [
  { href: '/download', label: 'Install', body: 'Homebrew, cargo, curl. macOS, Linux, Windows.' },
  {
    href: '/byok',
    label: 'Add an API key',
    body: 'Bring your own key for any provider. Encrypted on device.',
  },
  {
    href: '/local',
    label: 'Run offline',
    body: 'Ollama or LM Studio. No keys, no quotas, no internet.',
  },
  {
    href: '/providers',
    label: 'Switch models',
    body: 'Twelve providers in one thread. Switch mid-conversation.',
  },
  {
    href: '/cli',
    label: 'Use the CLI',
    body: 'Pure Rust, headless mode for CI, replayable sessions.',
  },
  {
    href: '/pricing',
    label: 'See pricing',
    body: 'Local + BYOK free forever. Hobby $10/mo or $5/mo annual.',
  },
];

export default function HelpPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Help.</h1>
          <p className="agi-page-lede">
            The fastest way to get unstuck.{' '}
            <strong>
              For anything below the surface, email{' '}
              <a href="mailto:contact@agiworkforce.com" style={{ color: 'var(--agi-ink)' }}>
                contact@agiworkforce.com
              </a>
            </strong>{' '}
            — a real human reads it.
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Common asks</p>
          <ul className="agi-reasons">
            {QUICK.map((q) => (
              <li className="agi-reason" key={q.href}>
                <h3 className="agi-reason-h">{q.label}</h3>
                <p className="agi-reason-p">{q.body}</p>
                <Link href={q.href} className="agi-cta-ghost" style={{ marginTop: 4 }}>
                  Open →
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">More</p>
          <div className="agi-cta-row">
            <Link href="/faq" className="agi-cta-primary">
              Read the FAQ
            </Link>
            <Link href="/support" className="agi-cta-ghost">
              Support →
            </Link>
            <a href="mailto:contact@agiworkforce.com" className="agi-cta-ghost">
              Email us →
            </a>
          </div>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
