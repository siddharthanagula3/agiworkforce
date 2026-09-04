import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Ledger,
  Prose,
  Section,
  Stack,
  SurfaceStatus,
} from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { LinkGrid } from '@/features/marketing/components/pages/features/shared';

export const metadata = buildMetadata({
  title: 'Documentation: reference for every surface',
  description:
    'Reference for every AGI surface: CLI, Desktop, Mobile, Web, Chrome, and VS Code extension.',
  path: '/docs',
});

const HERO_TRANSCRIPT_LABEL = 'The commands both shipped surfaces start from';

const HERO_TRANSCRIPT = [
  { kind: 'dim', text: '# one account across cli and web' },
  { kind: 'cmd', text: 'agi login' },
  { kind: 'dim', text: '# local: models on this machine' },
  { kind: 'cmd', text: 'agi models scan' },
  { kind: 'cmd', text: 'agi --provider ollama --model <model>' },
] as const;

const LIVE_SURFACES = [
  {
    name: 'AGI CLI',
    detail:
      'Rust-native agent for coding sessions, diffs, reviews, sandboxed execution, and hooks in your terminal.',
    action: { label: 'CLI reference', href: '/cli' },
  },
  {
    name: 'AGI Web',
    detail:
      'Hosted chat with projects, artifacts, cited research, and account management. Works in any browser.',
    action: { label: 'Get started on the web', href: '/get-started' },
  },
] as const;

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
          lede="AGI is a multi-surface AI workspace: one account across CLI and Web today, three routing modes (Local, BYOK, and Cloud), and a consistent API for tools, memory, and connectors."
          ctas={[]}
          visual={
            <pre
              className="agi-lp-terminal"
              aria-label={HERO_TRANSCRIPT_LABEL}
              style={{ alignSelf: 'start' }}
            >
              {HERO_TRANSCRIPT.map((line) => (
                <span className="agi-lp-terminal-line" data-kind={line.kind} key={line.text}>
                  {line.text}
                </span>
              ))}
            </pre>
          }
        />

        <Section id="surfaces" labelledBy="agi-docs-surfaces-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-docs-surfaces-title">
              Surfaces with a published release.
            </h2>
            <div className="agi-ds-grid-2">
              {LIVE_SURFACES.map((surface) => (
                <SurfaceStatus
                  state="live"
                  name={surface.name}
                  detail={surface.detail}
                  action={surface.action}
                  key={surface.name}
                />
              ))}
            </div>
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
