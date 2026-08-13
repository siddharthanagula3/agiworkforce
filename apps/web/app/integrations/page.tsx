import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { ProductFrame } from '@/features/marketing/components/ProductFrame';
import { CapabilityGrid, FinalCta } from '@/features/marketing/components/FlagshipSections';
import { LedgerSection } from '@/features/marketing/components/LandingSections';
import { DESKTOP_LOCAL_RUNTIMES, LAUNCH, MARKETING } from '../../lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'Integrations',
  description:
    'How AGI connects to other tools: MCP plugins, the native messaging bridge, and BYOK provider keys on Desktop, CLI, and VS Code.',
  path: '/integrations',
});

export default function IntegrationsPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-integrations-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">Integrations</p>
          <h1 id="agi-integrations-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">Plug AGI into</span>{' '}
            <span className="agi-fl-h1-line">
              <em className="agi-fl-h1-em">your stack.</em>
            </span>
          </h1>
          <p className="agi-fl-lede">
            Three patterns connect AGI to the tools you already use: MCP plugins for the agent, the
            native messaging bridge between Chrome and Desktop, and BYOK provider keys on Desktop,
            CLI, and VS Code. Every connection runs behind explicit, visible permissions.
          </p>
          <div className="agi-fl-cta-row">
            <Link href="/apps" className="agi-fl-cta agi-fl-cta--primary">
              Browse Apps &amp; Connectors
            </Link>
            <Link href="/providers" className="agi-fl-cta agi-fl-cta--ghost">
              See Providers
            </Link>
          </div>
          <div className="agi-fl-hero-console" aria-hidden="true">
            <ProductFrame
              variant="browser"
              title="AGI · side panel"
              badge="scoped"
              className="agi-fl-hero-frame agi-fl-hero-frame--main"
            />
          </div>
        </section>

        <CapabilityGrid
          eyebrow="The three patterns"
          title="How the pieces connect."
          items={[
            {
              meta: 'Tools',
              title: 'MCP plugins',
              body: 'Mount Model Context Protocol servers and scope their access. stdio, SSE, and streamable HTTP transports are all supported.',
              href: '/features/plugins',
            },
            {
              meta: 'Bridge',
              title: 'Native messaging bridge',
              body: 'The Chrome side panel pairs with Desktop on localhost:8787. The browser captures intent. Desktop runs the model and the tool calls.',
              href: '/chrome-extension',
            },
            {
              meta: 'Keys',
              title: 'Provider BYOK',
              body: 'Bring keys for Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Qwen, Moonshot, or Zhipu on Desktop, CLI, and VS Code. Or any OpenAI-compatible endpoint.',
              href: '/byok',
            },
          ]}
        />

        <LedgerSection
          eyebrow="What's wired today"
          title="The honest inventory."
          rows={[
            {
              k: 'Providers',
              v: `${MARKETING.providers.display} providers across cloud APIs and local runtimes. BYOK on Desktop, CLI, and VS Code. Pay providers directly.`,
            },
            {
              k: 'Local runtimes',
              v: `${DESKTOP_LOCAL_RUNTIMES.label} on Desktop. Free, offline-capable after setup, no account required. CLI runtime support is documented separately.`,
            },
            {
              k: 'MCP transports',
              v: 'stdio, SSE, and streamable HTTP are all supported.',
            },
            {
              k: 'Native messaging',
              v: 'Chrome MV3 extension ↔ Desktop on localhost:8787. Extension availability tracks the Desktop release.',
            },
            {
              k: 'Editor',
              v: 'VS Code extension with the @agi chat participant. Developer preview. Not yet listed on the marketplace.',
            },
          ]}
        />

        <FinalCta
          eyebrow={LAUNCH.publicLabel}
          title="Connect one tool, then the next."
          body="Start with a provider key or a local runtime, add MCP plugins as the work demands, and keep every permission visible."
          ctas={[
            { href: '/providers', label: 'See Providers' },
            { href: '/api-docs', label: 'Read API Docs' },
          ]}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
