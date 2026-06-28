import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { LAUNCH } from '../../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'Press',
  description:
    'Press materials and contact for AGI: what we are, who runs it, and how to reach us.',
  alternates: { canonical: 'https://agiworkforce.com/press' },
};

const QUICK_FACTS: { k: string; v: string }[] = [
  { k: 'Company', v: 'AGI Automation LLC, USA' },
  { k: 'Launch status', v: LAUNCH.publicLabel },
  { k: 'Product surfaces', v: 'Desktop · Web · Mobile · CLI · Chrome ext · VS Code ext' },
  {
    k: 'Provider posture',
    v: 'Visible provider choice across Local, BYOK, and invite-gated Cloud routes',
  },
  {
    k: 'Differentiators',
    v: 'Multi-provider routing · BYOK + local · cross-provider session continuity',
  },
  {
    k: 'Pricing posture',
    v: 'Local mode is free. Managed Cloud is public alpha, open by default (metered usage). Team & Enterprise are waitlisted.',
  },
];

export default function PressPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-press-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">Press</p>
          <h1 id="agi-press-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">Paste-ready facts</span>
            <span className="agi-fl-h1-line">
              <em className="agi-fl-h1-em">for your story.</em>
            </span>
          </h1>
          <p className="agi-fl-lede">
            What AGI is and who runs it, in language a journalist or analyst can paste verbatim.{' '}
            <strong>
              For interviews, demos, or quotes, email{' '}
              <a href="mailto:contact@agiworkforce.com" style={{ color: 'var(--agi-ink)' }}>
                contact@agiworkforce.com
              </a>{' '}
              with your outlet, deadline, and the angle.
            </strong>
          </p>
          <div style={{ paddingBottom: 'clamp(48px, 7vw, 88px)' }}>
            <div className="agi-fl-cta-row">
              <a href="mailto:contact@agiworkforce.com" className="agi-fl-cta agi-fl-cta--primary">
                Email the Press Contact
              </a>
              <Link href="/about" className="agi-fl-cta agi-fl-cta--secondary">
                Read About AGI
              </Link>
            </div>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-press-paragraph-title">
          <p className="agi-fl-eyebrow">The one-paragraph version</p>
          <h2 id="agi-press-paragraph-title" className="agi-fl-h2">
            AGI, in one paragraph.
          </h2>
          <p className="agi-fl-section-lede">
            AGI is a multi-surface AI workspace for chat, code, research, files, projects,
            artifacts, tools, connectors, memory, and automation. It gives users clear Local, BYOK,
            and invite-gated Cloud routes so they can see where work runs before it leaves a device.
            AGI is built by AGI Automation LLC, an independent company based in the United States.
          </p>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-press-facts-title">
          <p className="agi-fl-eyebrow">Quick facts</p>
          <h2 id="agi-press-facts-title" className="agi-fl-h2">
            The fact sheet.
          </h2>
          <table className="agi-ledger">
            <tbody>
              {QUICK_FACTS.map((row) => (
                <tr key={row.k}>
                  <td>{row.k}</td>
                  <td>{row.v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-press-contact-title">
          <p className="agi-fl-eyebrow">Contact</p>
          <h2 id="agi-press-contact-title" className="agi-fl-h2">
            Interviews, demos, and quotes.
          </h2>
          <div className="agi-fl-cta-row">
            <a href="mailto:contact@agiworkforce.com" className="agi-fl-cta agi-fl-cta--primary">
              Email the Press Contact
            </a>
            <Link href="/about" className="agi-fl-cta agi-fl-cta--ghost">
              Read About AGI
            </Link>
            <Link href="/trust" className="agi-fl-cta agi-fl-cta--ghost">
              See the Trust Posture
            </Link>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
