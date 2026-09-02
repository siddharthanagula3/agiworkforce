import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { ProductFrame } from '@/features/marketing/components/ProductFrame';
import { FeatureGrid, LedgerSection } from '@/features/marketing/components/LandingSections';
import { FinalCta } from '@/features/marketing/components/FlagshipSections';

export const metadata = buildMetadata({
  title: 'Sales teams: AGI',
  description:
    'How revenue teams use AGI: research, outreach drafts, deal-room briefings, and pipeline triage with provider choice and visible routing.',
  path: '/use-cases/sales-teams',
});

export default function SalesTeamsPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-sales-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">Use case · sales teams</p>
          <h1 id="agi-sales-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">Know the account.</span>{' '}
            <span className="agi-fl-h1-line">
              <em className="agi-fl-h1-em">Own the context.</em>
            </span>
          </h1>
          <p className="agi-fl-lede">
            Research, outreach drafts, deal-room briefings, and pipeline triage. Provider choice
            through your own keys on Desktop, CLI, and VS Code, with a visible label on every route
            your account context takes.
          </p>
          <div className="agi-fl-cta-row">
            <Link href="/download" className="agi-fl-cta agi-fl-cta--primary">
              Get AGI Desktop
            </Link>
            <Link href="/byok" className="agi-fl-cta agi-fl-cta--ghost">
              Set up BYOK
            </Link>
          </div>
          <ul className="agi-fl-mode-ribbon" aria-label="Trust modes">
            <li>Local · sensitive deals</li>
            <li>BYOK · your budget</li>
            <li>Cloud · hosted by us</li>
          </ul>
          <div className="agi-fl-hero-console" aria-hidden="true">
            <ProductFrame
              variant="web"
              title="agiworkforce.com/chat"
              badge="Web"
              className="agi-fl-hero-frame agi-fl-hero-frame--main"
            />
          </div>
        </section>

        <FeatureGrid
          eyebrow="Where it shows up"
          title="From first touch to signed."
          items={[
            {
              meta: 'Research',
              title: 'Account research',
              body: 'Pull the public record on a target: filings, releases, hiring, news. Bundle it into a brief and switch providers as the question changes.',
            },
            {
              meta: 'Outreach',
              title: 'Drafts in your tone',
              body: "Draft messages in your team's voice. The model sees your prior outreach as context only when you've given it permission to.",
            },
            {
              meta: 'Deals',
              title: 'Deal-room prep',
              body: 'Cross-provider continuity matters here: long-context work for the data room, prose for the narrative summary, all in one thread.',
            },
          ]}
        />

        <LedgerSection
          eyebrow="Posture for revenue teams"
          title="The boundaries, stated plainly."
          rows={[
            {
              k: 'Confidentiality',
              v: 'Local Mode for sensitive deals; keys stay encrypted on your device.',
            },
            {
              k: 'BYOK',
              v: 'Pay providers directly on Desktop, CLI, and VS Code. Use your existing API budget.',
            },
            {
              k: 'Tools',
              v: 'Connect CRM and email through MCP connectors, behind explicit tool approvals.',
            },
            {
              k: 'Visibility',
              v: 'Provider labels and tool approvals stay visible on every route.',
            },
          ]}
        />

        <FinalCta
          eyebrow="Start now"
          title="Brief better, route deliberately."
          body="Bring your own keys on Desktop, CLI, and VS Code, and keep account context under your control while the team works."
          ctas={[
            { href: '/download', label: 'Get AGI Desktop' },
            { href: '/byok', label: 'Set up BYOK' },
            { href: '/apps', label: 'Browse apps & connectors' },
          ]}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
