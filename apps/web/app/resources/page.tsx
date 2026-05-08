import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Resources | AGI Workforce',
  description: 'Pointers into the parts of AGI Workforce most often asked about.',
  alternates: { canonical: 'https://agiworkforce.com/resources' },
};

const SECTIONS: { href: string; label: string; body: string }[] = [
  { href: '/docs', label: 'Documentation', body: 'Reference material for every surface.' },
  { href: '/api-docs', label: 'API reference', body: 'OpenAI-compatible gateway endpoints.' },
  { href: '/changelog', label: 'Changelog', body: 'A dated archive of what shipped.' },
  { href: '/security', label: 'Security', body: 'How keys, data, and tools are protected.' },
  { href: '/byok', label: 'BYOK posture', body: 'Bring your own keys, pay providers directly.' },
  {
    href: '/compare',
    label: 'Comparative reviews',
    body: 'Honest reads on Claude, ChatGPT, Gemini, Perplexity.',
  },
];

export default function ResourcesPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Resources.</h1>
          <p className="agi-page-lede">
            Pointers into the parts of AGI Workforce most often asked about.{' '}
            <strong>Everything below is a real page with real content</strong> — nothing here is a
            placeholder.
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Index</p>
          <ul className="agi-reasons">
            {SECTIONS.map((s) => (
              <li className="agi-reason" key={s.href}>
                <h3 className="agi-reason-h">{s.label}</h3>
                <p className="agi-reason-p">{s.body}</p>
                <Link href={s.href} className="agi-cta-ghost" style={{ marginTop: 4 }}>
                  Open →
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
