import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Ledger, Prose, Section, Stack } from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { LinkGrid } from '@/features/marketing/components/pages/features/shared';

export const metadata = buildMetadata({
  title: 'Documentation: reference for every surface',
  description:
    'Reference for every AGI surface: CLI, Desktop, Mobile, Web, Chrome, and VS Code extension.',
  path: '/docs',
});

const LIVE_SURFACES = [
  {
    meta: 'Terminal',
    title: 'AGI CLI',
    href: '/cli',
    body: 'Rust-native agent for coding sessions, diffs, reviews, sandboxed execution, and hooks in your terminal.',
  },
  {
    meta: 'Browser',
    title: 'AGI Web',
    href: '/get-started',
    body: 'Hosted chat with projects, artifacts, cited research, and account management. Works in any browser.',
  },
];

const REFERENCE_LINKS = [
  {
    meta: 'Reference',
    title: 'API reference',
    href: '/api-docs',
    body: 'OpenAI-compatible gateway endpoints for building on AGI infrastructure.',
  },
  {
    meta: 'Catalog',
    title: 'Providers & models',
    href: '/providers',
    body: 'Cloud APIs, local runtimes, and custom endpoints. Bring your own keys or run fully offline.',
  },
  {
    meta: 'Connect',
    title: 'MCP & integrations',
    href: '/integrations',
    body: 'Model Context Protocol plugins, the Desktop bridge, BYOK key management, and custom connectors.',
  },
  {
    meta: 'Keys',
    title: 'BYOK mode',
    href: '/byok',
    body: 'Add a provider key on Desktop or CLI and route work directly. AGI never sees your API keys.',
  },
];

const NOT_YET_SHIPPED: { label: string; value: string }[] = [
  {
    label: 'AGI Desktop',
    value:
      'A Linux x86_64 build exists as a release artifact and is pending its signature check. Windows has no installer and no announced date.',
  },
  {
    label: 'AGI Mobile',
    value:
      'No listing on the App Store or Google Play. The on-device runtimes are built and running.',
  },
  {
    label: 'AGI for Chrome',
    value: 'No listing on the Chrome Web Store. The extension is already built.',
  },
  {
    label: 'AGI in VS Code',
    value:
      'Distributed only as an unpublished VSIX to preview users. Nothing installs from the Marketplace yet.',
  },
];

export default function DocsPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-docs-title"
          eyebrow="Get started"
          title="Welcome to AGI."
          lede="AGI is a multi-surface AI workspace: one account across six surfaces, three routing modes (Local, BYOK, and Cloud), and a consistent API for tools, memory, and connectors."
          ctas={[]}
        />

        <Section id="surfaces" labelledBy="agi-docs-surfaces-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-docs-surfaces-title">
              Surfaces with a published release.
            </h2>
            <LinkGrid items={LIVE_SURFACES} />
          </Stack>
        </Section>

        <Section id="not-shipped" labelledBy="agi-docs-not-shipped-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-docs-not-shipped-title">
                Built, not yet released.
              </h2>
              <Prose>Each line names exactly what it is waiting on.</Prose>
            </div>
            <Ledger caption="Not yet shipped" rows={NOT_YET_SHIPPED} />
          </Stack>
        </Section>

        <Section id="reference" labelledBy="agi-docs-reference-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-docs-reference-title">
              APIs, providers, and integrations.
            </h2>
            <LinkGrid items={REFERENCE_LINKS} />
          </Stack>
        </Section>
      </main>
      <MarketingFooter condensed />
    </div>
  );
}
