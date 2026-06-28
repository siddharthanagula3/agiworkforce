import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../../components/layout/Header';
import { MarketingFooter } from '../../../components/marketing/MarketingFooter';
import { ProductFrame } from '../../../components/marketing/ProductFrame';
import { FeatureGrid, LedgerSection } from '../../../components/marketing/LandingSections';
import { FinalCta } from '../../../components/marketing/FlagshipSections';
import { LAUNCH } from '../../../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'IT service providers: AGI',
  description:
    'How MSPs and IT shops use AGI: triage, runbooks, and scripted operations with sandboxed execution, explicit approvals, and multi-provider routing.',
  alternates: { canonical: 'https://agiworkforce.com/use-cases/it-providers' },
};

export default function ItProvidersPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-itproviders-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">Use case · IT service providers</p>
          <h1 id="agi-itproviders-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">Runbooks that</span>
            <span className="agi-fl-h1-line">
              <em className="agi-fl-h1-em">actually run.</em>
            </span>
          </h1>
          <p className="agi-fl-lede">
            Triage, runbooks, and scripted operations with a real CLI. Sandboxed execution, explicit
            approvals, and provider routing that sends routine work to inexpensive models and saves
            the flagship calls for the hard cases.
          </p>
          <div className="agi-fl-cta-row">
            <Link href="/contact-sales" className="agi-fl-cta agi-fl-cta--primary">
              Contact Sales
            </Link>
            <Link href="/cli" className="agi-fl-cta agi-fl-cta--ghost">
              See the CLI
            </Link>
          </div>
          <ul className="agi-fl-mode-ribbon" aria-label="Trust modes">
            <li>Local · client privacy</li>
            <li>BYOK · enforceable</li>
            <li>Cloud · public alpha</li>
          </ul>
          <div className="agi-fl-hero-console" aria-hidden="true">
            <ProductFrame
              variant="terminal"
              title="agi · zsh"
              badge="sandboxed"
              className="agi-fl-hero-frame agi-fl-hero-frame--main"
            />
          </div>
        </section>

        <FeatureGrid
          eyebrow="Where it shows up"
          title="Ticket in, resolution out."
          items={[
            {
              meta: 'Triage',
              title: 'Classify and summarize',
              body: 'Read tickets, classify, summarize prior context, and propose next steps. Branch into deeper investigation only when the cheap path does not suffice.',
            },
            {
              meta: 'Runbooks',
              title: 'Encode and execute',
              body: 'Encode runbooks as MCP tools. The agent runs them sandboxed by default: macOS Seatbelt, Linux bwrap. Behind explicit approvals.',
            },
            {
              meta: 'Operations',
              title: 'CI-style workflows',
              body: 'agi exec in headless mode for scripted incident workflows: pipe a ticket in, get a structured response back.',
            },
          ]}
        />

        <LedgerSection
          eyebrow="Posture"
          title="Built for someone else's environment."
          rows={[
            {
              k: 'Sandboxed tools',
              v: 'File writes, shell, and network run sandboxed by default.',
            },
            {
              k: 'Provider routing',
              v: 'Inexpensive models for triage, flagship models for the hard cases. All in one thread.',
            },
            {
              k: 'Records',
              v: 'Resumable sessions and visible tool approvals for after-action review.',
            },
            {
              k: 'BYOK enforcement',
              v: 'Require BYOK org-wide on enterprise contracts. Zero managed-cloud spend unless you opt in.',
            },
          ]}
        />

        <FinalCta
          eyebrow={LAUNCH.publicLabel}
          title="Put the agent on the bench."
          body="Start with the CLI on Local and BYOK, and talk to sales when client contracts need enterprise controls."
          ctas={[
            { href: '/contact-sales', label: 'Contact Sales' },
            { href: '/cli', label: 'See the CLI' },
            { href: '/enterprise', label: 'See Enterprise Controls' },
          ]}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
