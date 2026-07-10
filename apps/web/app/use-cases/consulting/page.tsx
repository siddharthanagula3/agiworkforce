import { buildMetadata } from '@/lib/seo/metadata';
import { JsonLd } from '@/components/seo/JsonLd';
import { breadcrumbSchema } from '@/lib/seo/structured-data';
import Link from 'next/link';
import { Header } from '../../../components/layout/Header';
import { MarketingFooter } from '../../../components/marketing/MarketingFooter';
import { ProductFrame } from '../../../components/marketing/ProductFrame';
import { FeatureGrid, LedgerSection } from '../../../components/marketing/LandingSections';
import { FinalCta } from '../../../components/marketing/FlagshipSections';
import { LAUNCH } from '../../../lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'Consulting firms: AGI',
  description:
    'How consulting practices use AGI: research, deliverables, data analysis, and reporting at scale across multiple AI providers.',
  path: '/use-cases/consulting',
});

export default function ConsultingPage() {
  return (
    <div data-design="agi">
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Use Cases', path: '/use-cases' },
          { name: 'Consulting', path: '/use-cases/consulting' },
        ])}
      />
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-consulting-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">Use case · consulting</p>
          <h1 id="agi-consulting-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">Client work,</span>
            <span className="agi-fl-h1-line">
              <em className="agi-fl-h1-em">across providers.</em>
            </span>
          </h1>
          <p className="agi-fl-lede">
            Research, deliverables, data analysis, and client reporting. Switch providers
            mid-engagement as the work changes shape, from long-context analysis to prose drafting
            to tool-heavy automation, without losing the thread.
          </p>
          <div className="agi-fl-cta-row">
            <Link href="/contact-sales" className="agi-fl-cta agi-fl-cta--primary">
              Contact Sales
            </Link>
            <Link href="/byok" className="agi-fl-cta agi-fl-cta--ghost">
              Set Up BYOK
            </Link>
          </div>
          <ul className="agi-fl-mode-ribbon" aria-label="Trust modes">
            <li>Local · sensitive engagements</li>
            <li>BYOK · Desktop &amp; CLI</li>
            <li>Cloud · public alpha</li>
          </ul>
          <div className="agi-fl-hero-console" aria-hidden="true">
            <ProductFrame
              variant="desktop"
              title="AGI Desktop"
              badge="Local"
              className="agi-fl-hero-frame agi-fl-hero-frame--main"
            />
          </div>
        </section>

        <FeatureGrid
          eyebrow="Where it shows up"
          title="The engagement, end to end."
          items={[
            {
              meta: 'Research',
              title: 'Synthesis at depth',
              body: 'Read whole repositories of prior decks, transcripts, and primary sources, then hand synthesis to the model that handles your shape of context best.',
            },
            {
              meta: 'Deliverables',
              title: 'Drafts in your house tone',
              body: 'Draft analyses, executive summaries, and slide narratives. The conversation history travels across model switches.',
            },
            {
              meta: 'Scale',
              title: 'Reporting in pipelines',
              body: 'Run the same analysis across many client datasets through the CLI, headless, in CI-style pipelines.',
            },
          ]}
        />

        <LedgerSection
          eyebrow="What partners ask for"
          title="The posture, answered up front."
          rows={[
            {
              k: 'Provider choice',
              v: 'BYOK on Desktop and CLI. Pay providers directly at their rates.',
            },
            {
              k: 'Confidentiality',
              v: 'Local Mode for sensitive engagements; keys stored encrypted on your device.',
            },
            {
              k: 'Records',
              v: 'Resumable sessions and visible tool approvals on the developer surfaces.',
            },
            {
              k: 'Team scale',
              v: 'SSO/SCIM, retention windows, and audit export scoped on enterprise contracts.',
            },
          ]}
        />

        <FinalCta
          eyebrow={LAUNCH.publicLabel}
          title="Bring the engagement, keep the boundary."
          body="Start on Local and BYOK today, and talk to sales when the practice needs enterprise controls."
          ctas={[
            { href: '/contact-sales', label: 'Contact Sales' },
            { href: '/byok', label: 'Set Up BYOK' },
            { href: '/enterprise', label: 'See Enterprise Controls' },
          ]}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
