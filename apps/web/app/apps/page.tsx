import type { Metadata } from 'next';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import {
  CampaignHero,
  FeatureGrid,
  LaunchCta,
  LedgerSection,
  RouteMap,
} from '../../components/marketing/LandingSections';
import { LAUNCH } from '../../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'AGI Apps and Connectors - MCP tools across Local, BYOK, and Cloud',
  description:
    'Connect AGI to files, browsers, GitHub, Gmail, Slack, Linear, databases, desktop tools, and custom MCP servers with explicit permissions.',
  alternates: { canonical: 'https://agiworkforce.com/apps' },
};

export default function AppsPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <CampaignHero
          eyebrow={`${LAUNCH.publicLabel} · Apps + connectors`}
          title="Connect the tools people already use."
          lede="OpenAI calls them Apps. Anthropic calls them connectors and desktop extensions. AGI supports the same product category with a sharper boundary: local extensions for your machine, remote connectors for SaaS tools, and MCP for custom systems."
          primaryCta={{ href: '/connectors', label: 'Browse connectors' }}
          secondaryCta={{ href: '/integrations', label: 'Integration docs' }}
          chips={['MCP', 'OAuth apps', 'Desktop extensions', 'Tool permissions']}
          panelTitle="Tool access"
          panelRows={[
            { k: 'Local', v: 'Filesystem, desktop apps, browser, and local MCP servers' },
            { k: 'Remote', v: 'OAuth SaaS connectors and app-directory services' },
            { k: 'Custom', v: 'User-defined MCP servers with explicit tool scope' },
            { k: 'Control', v: 'Always allow, ask first, block, or custom rules' },
          ]}
        />

        <FeatureGrid
          eyebrow="Connector classes"
          title="Do not make users choose between chat and work."
          items={[
            {
              meta: 'Cloud apps',
              title: 'Work apps',
              body: 'Gmail, Google Drive, Slack, Notion, Linear, GitHub, Jira, and other services become available only when the user connects and enables them.',
            },
            {
              meta: 'Desktop',
              title: 'Local extensions',
              body: 'Filesystem, Apple Notes, Excel, browser, and computer-use extensions run through the desktop host for local workflows.',
            },
            {
              meta: 'MCP',
              title: 'Custom servers',
              body: 'Teams can bring internal tools through MCP rather than waiting for AGI to build every integration first.',
            },
            {
              meta: 'Permissions',
              title: 'Read, write, and destructive actions are different',
              body: 'Tool approval should show what the model wants to do, which provider is in use, and whether the action changes external state.',
            },
            {
              meta: 'Discovery',
              title: 'Relevant apps surface inside the composer',
              body: 'The plus menu and slash menu should expose files, apps, connectors, skills, web search, research, and styles without splitting chat surfaces.',
            },
            {
              meta: 'Governance',
              title: 'Workspace owners can restrict actions',
              body: 'Team and enterprise plans need org-wide app policy so users get power without bypassing review.',
            },
          ]}
        />

        <LedgerSection
          eyebrow="Product rule"
          title="Apps must respect mode boundaries."
          rows={[
            {
              k: 'Local apps',
              v: 'Operate through the local desktop host and should not silently upload local files or screenshots to BYOK or Cloud.',
            },
            {
              k: 'BYOK apps',
              v: 'Use the selected provider key only after the user sees the provider label and approves the relevant context.',
            },
            {
              k: 'Cloud apps',
              v: 'Remain invite-only for managed compute workflows until metering, abuse, retention, and deletion controls are proven.',
            },
            {
              k: 'Custom MCP',
              v: 'Needs handshake, tool list preview, permission rules, logs, and disconnect controls.',
            },
          ]}
        />

        <RouteMap
          eyebrow="Related pages"
          title="Apps connect the rest of the product."
          routes={[
            {
              meta: 'Directory',
              title: 'Connectors',
              body: 'The product directory and management surface.',
              href: '/connectors',
            },
            {
              meta: 'Docs',
              title: 'Integrations',
              body: 'Implementation and setup guidance.',
              href: '/integrations',
            },
            {
              meta: 'Desktop',
              title: 'Cowork',
              body: 'Computer-use and local extension workflows.',
              href: '/cowork',
            },
            {
              meta: 'Teams',
              title: 'Team policy',
              body: 'Workspace controls for connected services.',
              href: '/teams',
            },
          ]}
        />

        <LaunchCta
          title="Apps should appear where the work happens: inside one chat."
          body="The marketing promise is not a separate app store. It is a single AGI composer where files, apps, connectors, models, artifacts, research, and code can be selected without making the user roam."
          primary={{ href: '/download', label: LAUNCH.ctaLabel }}
          secondary={{ href: '/connectors', label: 'Browse connectors' }}
        />
        <MarketingFooter />
      </main>
    </div>
  );
}
