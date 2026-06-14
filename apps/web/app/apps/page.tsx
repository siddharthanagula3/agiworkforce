import type { Metadata } from 'next';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { LedgerSection } from '../../components/marketing/LandingSections';
import {
  CapabilityGrid,
  FinalCta,
  FlagshipHero,
} from '../../components/marketing/FlagshipSections';
import { LAUNCH } from '../../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'AGI Apps & Connectors | MCP servers, OAuth connectors, tool permissions',
  description:
    'Connect AGI to your tools three ways: MCP servers, an OAuth connector directory with honest availability labels, and a Chrome-to-Desktop native bridge. Every tool call behind explicit permissions.',
  alternates: { canonical: 'https://agiworkforce.com/apps' },
};

export default function AppsPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <FlagshipHero
          eyebrow="AGI · apps & connectors"
          titleLines={['Your tools,', 'connected on', 'your terms.']}
          em="your terms."
          lede="AGI reaches your tools three ways: MCP servers that run as local processes, an OAuth connector directory with honest availability labels, and a native-messaging bridge that pairs Chrome with Desktop. Every tool sits behind an explicit permission. The provider label stays visible before anything runs."
          ctas={[
            { href: '/connectors', label: 'Browse Connectors' },
            { href: '/download', label: 'Download AGI Desktop' },
            { href: '/integrations', label: 'Read Integration Docs' },
          ]}
          modeRibbon={['Local · on-device', 'BYOK · your keys', 'Cloud · by invite']}
        />

        <CapabilityGrid
          eyebrow="Ways to connect"
          title="Three connection paths, one permission model."
          items={[
            {
              meta: 'MCP',
              title: 'MCP servers',
              body: 'Run local MCP servers as stdio processes on Desktop and CLI. Desktop also accepts remote HTTP/SSE server configs with your own tokens.',
              href: '/connectors/mcp-directory',
            },
            {
              meta: 'Directory',
              title: 'Connector directory',
              body: 'Gmail, Slack, GitHub, Notion, Linear, and more. Each labeled Ready, Request access, or Planned, so you always know what works today.',
              href: '/connectors',
            },
            {
              meta: 'Browser',
              title: 'Chrome-to-Desktop bridge',
              body: 'The Chrome side panel hands real work to Desktop over a paired native-messaging bridge. Page context moves only on request.',
              href: '/chrome-extension',
            },
            {
              meta: 'Keys',
              title: 'BYOK providers',
              body: 'Bring your own provider keys on Desktop and CLI. Keys stay encrypted on your machine, and traffic goes directly to your provider.',
              href: '/byok',
            },
            {
              meta: 'Plugins',
              title: 'CLI plugins',
              body: 'Plugins bundle commands, skills, and MCP servers for the agi CLI. stdio servers today.',
              href: '/cli',
            },
            {
              meta: 'Control',
              title: 'Tool permissions',
              body: 'Set every connector tool to Always allow, Needs approval, or Blocked. Review what a tool wants to do before it runs.',
              href: '/connectors',
            },
          ]}
        />

        <LedgerSection
          eyebrow="Product rule"
          title="Apps respect mode boundaries."
          rows={[
            {
              k: 'Local apps',
              v: 'Operate through the local Desktop host and never silently upload local files or screenshots to BYOK or Cloud.',
            },
            {
              k: 'BYOK apps',
              v: 'Use your selected provider key only after you see the provider label and approve the relevant context.',
            },
            {
              k: 'Cloud apps',
              v: 'Remain invite-only for managed-compute workflows while metering, abuse, retention, and deletion controls are proven.',
            },
            {
              k: 'Custom MCP',
              v: 'Added explicitly, with tool discovery and per-tool permission rules: Always allow, Needs approval, or Blocked.',
            },
          ]}
        />

        <FinalCta
          eyebrow={LAUNCH.publicLabel}
          title="Bring your tools into the conversation."
          body="Browse the connector directory, wire up your own MCP servers, and keep every tool call behind a permission you set. The route stays visible at every step."
          ctas={[
            { href: '/connectors', label: 'Browse Connectors' },
            { href: '/download', label: 'Download AGI Desktop' },
            { href: '/integrations', label: 'Read Integration Docs' },
          ]}
          stamp={`Public launch · ${LAUNCH.date}`}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
