import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Ledger,
  MarketingFooter,
  Prose,
} from '@/features/marketing/components/system';
import {
  BYOK_SURFACES,
  CLI_AVAILABILITY_NOTE,
  CLI_LOCAL_RUNTIMES,
  MARKETING,
  SURFACE_STATUS,
} from '@/lib/marketing-constants';
import { byokProviderLabels } from '@/app/byok/byok-providers';

const BYOK_PROVIDER_LIST = new Intl.ListFormat('en', { type: 'disjunction' }).format(
  byokProviderLabels(),
);

export const metadata = buildMetadata({
  title: 'Integrations: MCP plugins, the browser bridge, and BYOK',
  description: `How AGI connects to other tools: MCP plugins, the native messaging bridge, and BYOK provider keys in the CLI. ${BYOK_SURFACES.availability}`,
  path: '/integrations',
});

const PATTERNS = [
  {
    meta: 'Tools',
    title: 'MCP plugins',
    body: 'The CLI can mount stdio, SSE, and streamable HTTP Model Context Protocol servers. Connectors on the hosted surfaces are coming soon.',
  },
  {
    meta: 'Bridge',
    title: 'Native messaging bridge',
    body: `The Chrome side panel can pair with Desktop on localhost:8787 for selections, captures, and queued messages. Panel chat remains Managed Cloud. Chrome is ${SURFACE_STATUS.chrome.toLowerCase()}, not on the Chrome Web Store yet.`,
  },
  {
    meta: 'Keys',
    title: 'Provider BYOK',
    body: `Bring keys for ${BYOK_PROVIDER_LIST} in the CLI, or use an OpenAI-compatible endpoint. ${BYOK_SURFACES.availability}`,
  },
] as const;

const HERO_CTAS = [
  {
    href: '/connectors/mcp-directory',
    label: 'Browse the connector directory',
    variant: 'primary' as const,
  },
  { href: '/providers', label: 'See providers', variant: 'secondary' as const },
] as const;

export default function IntegrationsPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <section className="agi-lp-hero" aria-labelledby="agi-integrations-title">
          <div className="agi-ds-container agi-lp-hero-grid">
            <div className="agi-lp-hero-copy">
              <Eyebrow>Integrations</Eyebrow>
              <h1 className="sr-only" id="agi-integrations-title">
                Plug AGI <em className="agi-ds-accent">into your stack.</em>
              </h1>
              <ButtonRow>
                {HERO_CTAS.map(({ href, label, variant }) => (
                  <Button key={href} href={href} variant={variant}>
                    {label}
                  </Button>
                ))}
              </ButtonRow>
            </div>
            <div className="agi-lp-hero-stage">
              <div className="agi-lp-console" aria-label="What is built">
                <div className="agi-lp-console-bar">
                  <span>Integrations &middot; what is built</span>
                </div>
                <div className="agi-lp-console-body">
                  <Ledger
                    caption="Integration inventory preview"
                    rows={[
                      {
                        label: 'Providers',
                        value: `${MARKETING.providers.display} providers. BYOK is in the CLI. ${BYOK_SURFACES.availability}`,
                      },
                      {
                        label: 'Local runtimes',
                        value: `${CLI_LOCAL_RUNTIMES.label} in the CLI`,
                      },
                      { label: 'MCP transports', value: 'stdio, SSE, streamable HTTP' },
                    ]}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby="agi-integrations-patterns-title">
          <div className="agi-ds-container">
            <div className="agi-lp-heading">
              <Eyebrow>The three patterns</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-integrations-patterns-title">
                How the pieces connect.
              </h2>
              <Prose>Every connection runs behind explicit, visible permissions.</Prose>
            </div>
            <div className="agi-ds-grid-2">
              {PATTERNS.map((item) => (
                <div className="agi-ds-card" style={{ padding: '1.5rem' }} key={item.title}>
                  <Eyebrow>{item.meta}</Eyebrow>
                  <h3 className="agi-ds-h3">{item.title}</h3>
                  <Prose size="sm">{item.body}</Prose>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby="agi-integrations-wired-title">
          <div className="agi-ds-container">
            <div className="agi-lp-heading">
              <Eyebrow>What&rsquo;s built, and what is released</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-integrations-wired-title">
                The honest inventory.
              </h2>
            </div>
            <Ledger
              caption="Integration inventory"
              rows={[
                {
                  label: 'Providers',
                  value: `${MARKETING.providers.display} providers across cloud APIs and local runtimes. BYOK is part of the CLI. ${BYOK_SURFACES.availability} Pay providers directly.`,
                },
                {
                  label: 'Local runtimes',
                  value: `${CLI_LOCAL_RUNTIMES.label} in the CLI. Free, offline-capable after setup, no account required. Desktop is managed-cloud only.`,
                },
                {
                  label: 'MCP transports',
                  value: 'stdio, SSE, and streamable HTTP are all supported.',
                },
                {
                  label: 'Native messaging',
                  value: `Chrome MV3 extension to Desktop on localhost:8787. Extension availability tracks the Desktop release. Chrome is ${SURFACE_STATUS.chrome.toLowerCase()}: not on the Chrome Web Store yet.`,
                },
                {
                  label: 'Editor',
                  value:
                    'VS Code extension with the @agi chat participant. Developer preview. Not yet listed on the marketplace.',
                },
              ]}
            />
          </div>
        </section>

        <section className="agi-lp-close" aria-labelledby="agi-integrations-close-title">
          <div className="agi-ds-container">
            <div className="agi-lp-close-inner">
              <h2 className="agi-ds-h2" id="agi-integrations-close-title">
                Connect one tool, <em className="agi-ds-accent">then the next.</em>
              </h2>
              <Prose size="lg">
                Start in the CLI with a provider key or local runtime, add MCP plugins as the work
                demands, and keep every permission visible. {CLI_AVAILABILITY_NOTE}
              </Prose>
              <ButtonRow>
                <Button href="/providers">See providers</Button>
                <Button href="/api-docs" variant="secondary">
                  Read API docs
                </Button>
              </ButtonRow>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
