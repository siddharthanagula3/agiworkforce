import type { Metadata } from 'next';
import { Header } from '../../../components/layout/Header';
import { MarketingFooter } from '../../../components/marketing/MarketingFooter';
import { LedgerSection } from '../../../components/marketing/LandingSections';
import { CapabilityGrid, DevBand, FinalCta } from '../../../components/marketing/FlagshipSections';
import { LAUNCH } from '../../../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'AGI Plugins | Bundle Commands, Skills, Hooks & MCP Servers',
  description:
    'AGI plugins bundle slash commands, skills, agents, hooks, and MCP server wiring into one install. Previewed on the agi CLI today, ahead of a marketplace.',
  alternates: { canonical: 'https://agiworkforce.com/features/plugins' },
};

export default function FeaturesPluginsPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-page-hero">
          <p className="agi-section-eyebrow">Features · Plugins</p>
          <h1 className="agi-page-h1">One install, a whole workflow.</h1>
          <p className="agi-page-lede">
            A plugin bundles slash commands, skills, agents, hooks, and MCP server wiring into one
            folder you can install from a local path or a Git repository. Previewed on the agi CLI
            today, before the marketplace opens.
          </p>
        </section>

        <CapabilityGrid
          eyebrow="What's inside"
          title="Everything a workflow needs, in one bundle."
          items={[
            {
              meta: 'Commands',
              title: 'Slash commands',
              body: 'Custom slash commands are plain markdown files. A plugin ships them alongside everything else.',
              href: '/cli',
            },
            {
              meta: 'Skills',
              title: 'Skills',
              body: 'Skill folders the agent discovers automatically; /skills lists everything a plugin brought in.',
              href: '/skills',
            },
            {
              meta: 'Agents',
              title: 'Agent definitions',
              body: 'Subagent definitions travel with the plugin, so a workflow can ship its own specialists.',
              href: '/cli',
            },
            {
              meta: 'Hooks',
              title: 'Lifecycle hooks',
              body: 'Hooks fire across the session lifecycle. Hooks declared by plugins are tracked with their trust status.',
              href: '/agi-code',
            },
            {
              meta: 'MCP',
              title: 'MCP server wiring',
              body: 'Plugins declare MCP server configs. stdio servers today, wired in when the plugin loads.',
              href: '/connectors/mcp-directory',
            },
            {
              meta: 'Control',
              title: 'Same permission model',
              body: 'Tools a plugin brings in sit behind the same per-tool permissions as everything else: allow, ask, or block.',
              href: '/apps',
            },
          ]}
        />

        <LedgerSection
          eyebrow="Trust"
          title="Installs you can inspect."
          rows={[
            {
              k: 'Source',
              v: 'Install from a local folder or a Git repository into your own AGI home directory. No opaque registry between you and the code.',
            },
            {
              k: 'Integrity',
              v: 'Installs carry a pinned SHA-256 checksum, or an explicit skip that you choose. Never a silent default.',
            },
            {
              k: 'Validation',
              v: 'Plugin names and file paths are validated on load, so a plugin cannot reach outside its own folder.',
            },
            {
              k: 'Compatibility',
              v: 'Plugin discovery recognizes five manifest layouts, including formats used by other agent CLIs.',
            },
          ]}
        />

        <DevBand
          eyebrow="Preview"
          title="Live on the CLI first."
          body="Plugins are previewed on the agi CLI today: agi plugin manages installs, /skills lists what was discovered, and bundled MCP servers run as stdio processes behind the same explicit approvals as every other tool."
          ctas={[
            { href: '/cli', label: 'See the CLI' },
            { href: '/skills', label: 'Browse Skills' },
          ]}
        />

        <FinalCta
          eyebrow={LAUNCH.publicLabel}
          title="Build the workspace you want."
          body="Start from the skills directory, wire your own tools, and package the workflow as a plugin when it earns a name."
          ctas={[
            { href: '/skills', label: 'Browse Skills' },
            { href: '/download', label: 'Get notified' },
          ]}
          stamp={`Public launch · ${LAUNCH.date}`}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
