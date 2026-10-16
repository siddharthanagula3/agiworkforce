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
  CONNECTORS_COMING_SOON_DETAIL,
  CONNECTORS_COMING_SOON_MESSAGE,
  connectorsReleased,
} from '@agiworkforce/types';
import { byokProviderLabels } from '@/app/byok/byok-providers';
import {
  BYOK_SURFACES,
  CLI_AVAILABILITY_NOTE,
  CLI_LOCAL_RUNTIMES,
  SURFACE_STATUS,
} from '@/lib/marketing-constants';

const BYOK_PROVIDER_LIST = new Intl.ListFormat('en', { type: 'conjunction' }).format(
  byokProviderLabels(),
);

const CONNECTORS_RELEASED = connectorsReleased();
const CONNECTORS_NOTE = CONNECTORS_RELEASED ? '' : ` ${CONNECTORS_COMING_SOON_MESSAGE}`;

const BRIDGE_SURFACE_STATES = `Chrome is ${SURFACE_STATUS.chrome.toLowerCase()} and Desktop is ${SURFACE_STATUS.desktop.toLowerCase()}.`;

export const metadata = buildMetadata({
  title: 'Integrations: MCP plugins, the browser bridge, and BYOK',
  description: `What AGI is built to connect to: MCP servers and provider keys in the CLI, the Chrome bridge to Desktop, and connected apps. ${BYOK_SURFACES.availability} ${BRIDGE_SURFACE_STATES}${CONNECTORS_NOTE}`,
  path: '/integrations',
});

const PATTERNS = [
  {
    meta: 'Tools',
    title: 'MCP plugins',
    body: `The CLI can mount stdio, SSE, and streamable HTTP Model Context Protocol servers. ${CLI_AVAILABILITY_NOTE}${CONNECTORS_NOTE}`,
  },
  {
    meta: 'Bridge',
    title: 'Native messaging bridge',
    body: `The Chrome side panel can pair with Desktop on localhost:8787 for selections, captures, and queued messages. Panel chat remains Managed Cloud. ${BRIDGE_SURFACE_STATES}`,
  },
  {
    meta: 'Keys',
    title: 'Provider BYOK',
    body: `The CLI takes a key for ${BYOK_PROVIDER_LIST}, or an OpenAI-compatible endpoint you configure. ${BYOK_SURFACES.availability}`,
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
                How AGI plugs <em className="agi-ds-accent">into your stack.</em>
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
                        value: `Your own provider keys, in the CLI. ${BYOK_SURFACES.availability}`,
                      },
                      {
                        label: 'Local runtimes',
                        value: `${CLI_LOCAL_RUNTIMES.label} in the CLI`,
                      },
                      { label: 'MCP transports', value: 'stdio, SSE, streamable HTTP in the CLI' },
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
                What connects today.
              </h2>
            </div>
            <Ledger
              caption="Integration inventory"
              rows={[
                {
                  label: 'Providers',
                  value: `The CLI takes a key for its built-in providers and for OpenAI-compatible endpoints you configure, and each provider bills you directly. ${BYOK_SURFACES.availability}`,
                },
                {
                  label: 'Local runtimes',
                  value: `${CLI_LOCAL_RUNTIMES.label} in the CLI. Free, offline-capable after setup, no account required. Desktop is managed-cloud only. ${CLI_AVAILABILITY_NOTE}`,
                },
                {
                  label: 'MCP transports',
                  value: `stdio, SSE, and streamable HTTP, mounted from the CLI. ${CLI_AVAILABILITY_NOTE}`,
                },
                {
                  label: 'Native messaging',
                  value: `Chrome MV3 extension to Desktop on localhost:8787. ${BRIDGE_SURFACE_STATES}`,
                },
                {
                  label: 'Editor',
                  value: `VS Code extension with the @agi chat participant. VS Code is ${SURFACE_STATUS.vscode.toLowerCase()}.`,
                },
                ...(CONNECTORS_RELEASED
                  ? []
                  : [{ label: 'Connected apps', value: CONNECTORS_COMING_SOON_DETAIL }]),
              ]}
            />
          </div>
        </section>

        <section className="agi-lp-close" aria-labelledby="agi-integrations-close-title">
          <div className="agi-ds-container">
            <div className="agi-lp-close-inner">
              <h2 className="agi-ds-h2" id="agi-integrations-close-title">
                One connection at a time, <em className="agi-ds-accent">each one visible.</em>
              </h2>
              <Prose size="lg">
                The CLI starts from a provider key or a local runtime, and MCP servers are added as
                the work demands, with every permission visible. {CLI_AVAILABILITY_NOTE}
                {CONNECTORS_NOTE}
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
