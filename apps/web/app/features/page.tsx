import type { Metadata } from 'next';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { CapabilityGrid, FinalCta } from '../../components/marketing/FlagshipSections';

export const metadata: Metadata = {
  title: 'AGI Features | Chat, Artifacts, Projects, Tools, Memory & Research',
  description:
    'Everything inside the AGI workspace: chat, artifacts, projects, tools and connectors, memory, deep research, agents, plugins, and skills. Across six surfaces and three trust modes.',
  alternates: { canonical: 'https://agiworkforce.com/features' },
};

export default function FeaturesHubPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-page-hero">
          <p className="agi-section-eyebrow">Features</p>
          <h1 className="agi-page-h1">Everything in the workspace.</h1>
          <p className="agi-page-lede">
            AGI is an application suite: conversation is the front door, and projects, artifacts,
            tools, memory, and research live behind it. On every surface, in every trust mode.
          </p>
        </section>

        <CapabilityGrid
          eyebrow="Core"
          title="The daily loop."
          items={[
            {
              meta: 'Chat',
              title: 'AI Chat',
              body: 'A fast, familiar conversation surface across every mode and surface.',
              href: '/features/ai-chat',
            },
            {
              meta: 'Artifacts',
              title: 'Artifacts',
              body: 'Documents, code, and visual outputs with previews, versions, and sharing.',
              href: '/features/artifacts',
            },
            {
              meta: 'Projects',
              title: 'Projects',
              body: 'Group chats, files, and instructions by topic.',
              href: '/features/projects',
            },
            {
              meta: 'Memory',
              title: 'Memory',
              body: 'Saved preferences and memory you can see, edit, and control.',
              href: '/features/memory',
            },
            {
              meta: 'Research',
              title: 'Deep Research',
              body: 'Cited reports across the web, your files, and connected tools.',
              href: '/features/deep-research',
            },
            {
              meta: 'Agents',
              title: 'Agents',
              body: 'Delegated, tool-using work with explicit permissions and approvals.',
              href: '/features/agents',
            },
          ]}
        />

        <CapabilityGrid
          eyebrow="Extend"
          title="Make it yours."
          items={[
            {
              meta: 'Tools',
              title: 'Tools & Connectors',
              body: 'MCP servers, OAuth apps, and explicit tool permissions for real work.',
              href: '/features/tools',
            },
            {
              meta: 'Plugins',
              title: 'Plugins',
              body: 'Bundled skills and connector wiring, previewed before the marketplace opens.',
              href: '/features/plugins',
            },
            {
              meta: 'Skills',
              title: 'Skills',
              body: 'A directory of prompts and agent skills to start from.',
              href: '/skills',
            },
          ]}
        />

        <FinalCta
          eyebrow="Start now"
          title="See it all in one chat."
          body="Try AGI Web in the browser, or install the apps for Local and BYOK work."
          ctas={[
            { href: '/login?redirectTo=%2Fchat', label: 'Try AGI Web' },
            { href: '/download', label: 'Download AGI' },
          ]}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
