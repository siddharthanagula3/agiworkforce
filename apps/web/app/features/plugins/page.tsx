import Link from 'next/link';
import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { LedgerSection } from '@/features/marketing/components/LandingSections';
import { CapabilityGrid, FinalCta } from '@/features/marketing/components/FlagshipSections';
import { ProductFrame } from '@/features/marketing/components/ProductFrame';
import type { TerminalLine } from '@/features/marketing/components/DeviceMockups';
import { loadPluginCatalog } from '@/features/plugins/server/registry-source';
import { pluginAvailabilityClaim } from '@/features/plugins/availability';
import { LAUNCH, SURFACE_STATUS } from '../../../lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'AGI Plugins | Bundle Commands, Skills, Hooks & MCP Servers',
  description:
    'AGI plugins bundle slash commands, skills, agents, hooks, and MCP server wiring into one install. Browse the hosted catalogue to see which packs are installable today.',
  path: '/features/plugins',
});

export const dynamic = 'force-dynamic';

const INSTALL_SESSION: readonly TerminalLine[] = [
  { kind: 'cmd', text: 'agi plugin install ~/src/ship-pack' },
  {
    kind: 'out',
    text: 'Refusing install: pass --integrity sha256:<hex> (or --unsafe-no-integrity)',
  },
  { kind: 'cmd', text: 'agi plugin install ~/src/ship-pack --integrity sha256:8f2c1d…' },
  { kind: 'ok', text: 'Installed to ~/.agiworkforce/plugins/ship-pack (agi manifest)' },
  { kind: 'cmd', text: 'agi plugin list' },
  { kind: 'out', text: '  ship-pack [agi] [enabled] ~/.agiworkforce/plugins/ship-pack' },
  { kind: 'out', text: '  review [claude] [enabled] ~/.agiworkforce/plugins/review' },
];

export default async function FeaturesPluginsPage() {
  const catalog = await loadPluginCatalog();
  const availability = pluginAvailabilityClaim(catalog);

  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-fl-plugins-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">Features · Plugins</p>
          <h1 id="agi-fl-plugins-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">A plugin ships code</span>{' '}
            <span className="agi-fl-h1-line">
              that <em className="agi-fl-h1-em">runs as you.</em>
            </span>
          </h1>
          <p className="agi-fl-lede">
            A plugin&rsquo;s slash commands, subagent definitions, and skill folders are markdown
            that spawns nothing. Its hooks are shell commands and its MCP servers are connections
            opened on load, which is why agi plugin install refuses to do anything until you pin a
            SHA-256 of the tree you actually read. <strong>{availability}</strong>
          </p>
          <div className="agi-fl-cta-row">
            <Link href="/plugins" className="agi-fl-cta agi-fl-cta--primary">
              Browse the catalogue
            </Link>
            <Link href="/cli" className="agi-fl-cta agi-fl-cta--secondary">
              See the CLI
            </Link>
          </div>
          <ul className="agi-fl-mode-ribbon" aria-label="Plugin install guarantees">
            <li>Install · SHA-256 gate</li>
            <li>Manifests · five layouts</li>
            <li>Hooks · home directory only</li>
          </ul>

          <div className="agi-fl-hero-console">
            <ProductFrame
              variant="terminal"
              title="agi · zsh"
              badge="plugin install"
              className="agi-fl-hero-frame--main"
              session={INSTALL_SESSION}
            />
          </div>
        </section>

        <CapabilityGrid
          eyebrow="Inside the folder"
          title="Some of what a plugin carries is inert, and some of it executes."
          items={[
            {
              meta: 'Markdown',
              title: 'Commands, agents, skills',
              body: 'The manifest points at markdown files. Slash commands wait until you invoke them; declared skill folders join the skill list as soon as the plugin loads.',
              href: '/skills',
            },
            {
              meta: 'Shell',
              title: 'Lifecycle hooks',
              body: 'A plugin can declare hooks that fire on session events, and a hook is a shell command. They merge in only from plugins that live in your home directory.',
              href: '/agi-code',
            },
            {
              meta: 'Processes',
              title: 'MCP servers',
              body: 'A declared server connects over stdio by default, which spawns a child process. A manifest can name sse or http with a url instead, and a transport the CLI does not recognize is skipped with a note.',
              href: '/connectors/mcp-directory',
            },
          ]}
        />

        <LedgerSection
          eyebrow="Supply chain"
          title="An install is treated as a supply-chain event."
          rows={[
            {
              k: 'Source',
              v: 'A plugin arrives from a local folder or a shallow git clone, and lands under ~/.agiworkforce/plugins/ with a name that has to pass validation first.',
            },
            {
              k: 'Integrity',
              v: 'After the copy, the CLI hashes every file in the tree with SHA-256 and compares it to the --integrity value you passed. A mismatch deletes the tree and reports both hashes. Skipping the check requires --unsafe-no-integrity, which prints a warning on every install.',
            },
            {
              k: 'Manifest',
              v: 'A tree with no recognized manifest is deleted after the copy, and the error names all five paths that were probed.',
            },
            {
              k: 'Paths',
              v: 'Manifest entries must be plain relative paths. Absolute paths, dot and parent segments, and anything that resolves outside the plugin folder are rejected on load and named on stderr.',
            },
            {
              k: 'Hooks',
              v: 'Hooks are merged only from ~/.agiworkforce/plugins/. A plugin sitting in a repository you cloned has its hooks blocked and the block reported, so a clone cannot start running shell commands on your tool calls.',
            },
          ]}
        />

        <FinalCta
          eyebrow="Before you install"
          title="Read the folder before you trust it."
          body={`Once a plugin is loaded, what its tools may actually do is governed by the same per-tool permissions as every other tool in the workspace. Every command above is in the agi binary source today; public CLI downloads are ${SURFACE_STATUS.cli.toLowerCase()}.`}
          ctas={[
            { href: '/download', label: LAUNCH.ctaLabel },
            { href: '/features/tools', label: 'How tool permissions work' },
          ]}
          stamp={LAUNCH.publicLabel}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
