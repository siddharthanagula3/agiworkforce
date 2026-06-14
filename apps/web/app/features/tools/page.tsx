import type { Metadata } from 'next';
import { Header } from '../../../components/layout/Header';
import { MarketingFooter } from '../../../components/marketing/MarketingFooter';
import { LedgerSection } from '../../../components/marketing/LandingSections';
import { CapabilityGrid, DevBand, FinalCta } from '../../../components/marketing/FlagshipSections';
import { LAUNCH } from '../../../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'AGI Tools & Connectors | MCP Servers, OAuth Apps & Tool Permissions',
  description:
    'How tools work inside the AGI workspace: MCP servers, OAuth connectors, web search, and a permission model where every tool call is reviewed before it runs.',
  alternates: { canonical: 'https://agiworkforce.com/features/tools' },
};

export default function FeaturesToolsPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-page-hero">
          <p className="agi-section-eyebrow">Features · Tools &amp; Connectors</p>
          <h1 className="agi-page-h1">Tools that ask before they act.</h1>
          <p className="agi-page-lede">
            The workspace is designed around tools that do real work: MCP servers, OAuth connectors,
            and web search. One rule everywhere. A tool runs only with a permission you set, and the
            route stays visible before anything leaves your device.
          </p>
        </section>

        <CapabilityGrid
          eyebrow="The tool surface"
          title="What the workspace can reach."
          items={[
            {
              meta: 'MCP',
              title: 'MCP servers',
              body: 'Run local MCP servers as stdio processes on Desktop and CLI. Desktop also accepts remote HTTP/SSE servers with your own tokens.',
              href: '/connectors/mcp-directory',
            },
            {
              meta: 'OAuth',
              title: 'Connector directory',
              body: 'OAuth and API-key connectors with honest availability labels: Ready, Request access, or Planned. You always know what works today.',
              href: '/connectors',
            },
            {
              meta: 'Control',
              title: 'Per-tool permissions',
              body: 'Set every connector tool to Always allow, Needs approval, or Blocked. Each tool carries its own setting.',
              href: '/apps',
            },
            {
              meta: 'Review',
              title: 'Approvals before actions',
              body: 'See what a tool wants to do before it does it. External writes are designed to confirm before they run.',
              href: '/desktop',
            },
            {
              meta: 'Search',
              title: 'Web search',
              body: 'Search the web from chat on AGI Web, and feed sources into cited deep-research reports.',
              href: '/features/deep-research',
            },
            {
              meta: 'Browser',
              title: 'Chrome-to-Desktop bridge',
              body: 'The Chrome side panel hands real work to Desktop over a paired native-messaging bridge. Page context moves only on request.',
              href: '/chrome-extension',
            },
          ]}
        />

        <LedgerSection
          eyebrow="Permission model"
          title="One rule, applied everywhere."
          rows={[
            {
              k: 'Discovery',
              v: 'Connecting a server lists its tools. Nothing runs at discovery. Tools wait for a permission you set.',
            },
            {
              k: 'Permission',
              v: 'Each tool carries its own setting: Always allow, Needs approval, or Blocked.',
            },
            {
              k: 'Approval',
              v: 'When a tool needs approval, you review the request before it runs, in the Desktop app or the CLI overlay.',
            },
            {
              k: 'Boundary',
              v: 'Local, BYOK, and AGI Cloud stay separate. Tool calls never silently cross from one mode to another.',
            },
          ]}
        />

        <DevBand
          eyebrow="In the terminal"
          title="Approvals where developers live."
          body="The agi CLI runs tools inside a sandbox with explicit approvals, connects MCP servers over stdio, SSE, or Streamable HTTP with optional OAuth, and can expose itself to any MCP client with agi mcp-server."
          ctas={[
            { href: '/cli', label: 'See the CLI' },
            { href: '/agi-code', label: 'Explore AGI Code' },
          ]}
        />

        <FinalCta
          eyebrow={LAUNCH.publicLabel}
          title="Bring your tools into the conversation."
          body="Browse the connector directory, wire up your own MCP servers, and keep every tool call behind a permission you set."
          ctas={[
            { href: '/connectors', label: 'Browse Connectors' },
            { href: '/download', label: 'Download AGI' },
          ]}
          stamp={`Public launch · ${LAUNCH.date}`}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
