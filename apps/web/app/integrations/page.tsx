import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Ledger,
  Prose,
  Section,
  Stack,
} from '@/features/marketing/components/system';
import { FactGrid, PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { DESKTOP_LOCAL_RUNTIMES, MARKETING } from '@/lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'Integrations: MCP plugins, the browser bridge, and BYOK',
  description:
    'How AGI connects to other tools: MCP plugins, the native messaging bridge, and BYOK provider keys on Desktop, CLI, and VS Code.',
  path: '/integrations',
});

export default function IntegrationsPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-integrations-title"
          eyebrow="Integrations"
          title="Plug AGI into your stack."
          lede="Three patterns connect AGI to the tools you already use: MCP plugins for the agent, the native messaging bridge between Chrome and Desktop, and BYOK provider keys on Desktop, CLI, and VS Code. Every connection runs behind explicit, visible permissions."
          ctas={[
            { href: '/apps', label: 'Browse apps and connectors' },
            { href: '/providers', label: 'See providers', variant: 'secondary' },
          ]}
        />

        <Section id="patterns" labelledBy="agi-integrations-patterns-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>The three patterns</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-integrations-patterns-title">
                How the pieces connect.
              </h2>
            </div>
            <FactGrid
              items={[
                {
                  meta: 'Tools',
                  title: 'MCP plugins',
                  body: 'Mount Model Context Protocol servers and scope their access. stdio, SSE, and streamable HTTP transports are all supported.',
                },
                {
                  meta: 'Bridge',
                  title: 'Native messaging bridge',
                  body: 'The Chrome side panel pairs with Desktop on localhost:8787. The browser captures intent. Desktop runs the model and the tool calls.',
                },
                {
                  meta: 'Keys',
                  title: 'Provider BYOK',
                  body: 'Bring keys for Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Qwen, Moonshot, or Zhipu on Desktop, CLI, and VS Code. Or any OpenAI-compatible endpoint.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="whats-wired" labelledBy="agi-integrations-wired-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>What&rsquo;s wired today</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-integrations-wired-title">
                The honest inventory.
              </h2>
            </div>
            <Ledger
              caption="Integration inventory"
              rows={[
                {
                  label: 'Providers',
                  value: `${MARKETING.providers.display} providers across cloud APIs and local runtimes. BYOK on Desktop, CLI, and VS Code. Pay providers directly.`,
                },
                {
                  label: 'Local runtimes',
                  value: `${DESKTOP_LOCAL_RUNTIMES.label} on Desktop. Free, offline-capable after setup, no account required. CLI runtime support is documented separately.`,
                },
                {
                  label: 'MCP transports',
                  value: 'stdio, SSE, and streamable HTTP are all supported.',
                },
                {
                  label: 'Native messaging',
                  value:
                    'Chrome MV3 extension to Desktop on localhost:8787. Extension availability tracks the Desktop release.',
                },
                {
                  label: 'Editor',
                  value:
                    'VS Code extension with the @agi chat participant. Developer preview. Not yet listed on the marketplace.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="integrations-close" labelledBy="agi-integrations-close-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-integrations-close-title">
              Connect one tool, then the next.
            </h2>
            <Prose>
              Start with a provider key or a local runtime, add MCP plugins as the work demands, and
              keep every permission visible.
            </Prose>
            <ButtonRow>
              <Button href="/providers">See providers</Button>
              <Button href="/api-docs" variant="secondary">
                Read API docs
              </Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
