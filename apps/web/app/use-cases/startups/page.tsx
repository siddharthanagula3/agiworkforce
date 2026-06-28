import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../../components/layout/Header';
import { MarketingFooter } from '../../../components/marketing/MarketingFooter';
import { ProductFrame } from '../../../components/marketing/ProductFrame';
import { FeatureGrid, LedgerSection } from '../../../components/marketing/LandingSections';
import { FinalCta } from '../../../components/marketing/FlagshipSections';
import {
  LAUNCH,
  MARKETING,
  MARKETING_FEATURE_MATRIX,
  POSITIONING,
} from '../../../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'Startups: AGI',
  description:
    'How startups use AGI: ship product faster with multi-provider AI, BYOK on Desktop and CLI, and a CLI that fits CI.',
  alternates: { canonical: 'https://agiworkforce.com/use-cases/startups' },
};

const PLAN_ROWS = MARKETING_FEATURE_MATRIX.individual.map((plan) => ({
  k: plan.label,
  v: `${plan.price} · ${plan.billingInterval}. ${plan.bestFor}.`,
}));

export default function StartupsPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-startups-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">Use case · startups</p>
          <h1 id="agi-startups-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">Ship faster.</span>
            <span className="agi-fl-h1-line">
              <em className="agi-fl-h1-em">Spend deliberately.</em>
            </span>
          </h1>
          <p className="agi-fl-lede">
            Use the CLI in CI, the Desktop app for hard problems, and the Chrome side panel for
            inbox and docs. One product, one chat history, with provider spend you control through
            your own keys on Desktop and CLI.
          </p>
          <div className="agi-fl-cta-row">
            <Link href="/download" className="agi-fl-cta agi-fl-cta--primary">
              Download AGI
            </Link>
            <Link href="/pricing" className="agi-fl-cta agi-fl-cta--ghost">
              See Pricing
            </Link>
          </div>
          <ul className="agi-fl-mode-ribbon" aria-label="Trust modes">
            <li>Local · free forever</li>
            <li>BYOK · provider rates</li>
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
          eyebrow="Why startups pick this shape"
          title="Three reasons this fits a small team."
          items={[
            {
              meta: 'Routing',
              title: 'No lock-in',
              body: 'Provider preferences change quarterly. Switch without losing your conversation history or rebuilding your tool integrations.',
            },
            {
              meta: 'Automation',
              title: 'Real CI',
              body: 'agi exec works as a Unix tool. Pipe a task in, get structured output back, in GitHub Actions or anywhere a shell runs.',
            },
            {
              meta: 'Cost',
              title: 'Cheap experiments',
              body: 'Local mode is free. BYOK pays providers at their public rates. Managed compute is opt-in (public alpha), never the default.',
            },
          ]}
        />

        <LedgerSection
          eyebrow="What you actually get"
          title="The posture, in one table."
          rows={[
            ...PLAN_ROWS,
            {
              k: 'Surfaces',
              v: `${MARKETING.surfaces.count} surfaces: Desktop, Web, Mobile, CLI, Chrome extension, VS Code extension.`,
            },
            {
              k: 'Providers',
              v: `${MARKETING.providers.display} providers wired in, plus any OpenAI-compatible endpoint.`,
            },
            { k: 'Privacy', v: POSITIONING.trustBoundary },
          ]}
        />

        <FinalCta
          eyebrow={LAUNCH.publicLabel}
          title="Start free, route deliberately."
          body="Install AGI, run Local and BYOK from day one, and turn on public-alpha managed cloud whenever you want hosted compute."
          ctas={[
            { href: '/download', label: 'Download AGI' },
            { href: '/pricing', label: 'See Pricing' },
            { label: 'Team & Enterprise access', waitlist: true },
          ]}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
