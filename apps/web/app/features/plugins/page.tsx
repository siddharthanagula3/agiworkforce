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
import { loadPluginCatalog } from '@/features/plugins/server/registry-source';
import { pluginAvailabilityClaim } from '@/features/plugins/availability';
import { SURFACE_STATUS } from '@/lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'Plugins: bundle commands, skills, hooks, and MCP servers',
  description:
    'AGI plugins bundle slash commands, skills, agents, hooks, and MCP server wiring into one install. Browse the hosted catalogue to see which packs are installable today.',
  path: '/features/plugins',
});

export const dynamic = 'force-dynamic';

const IDS = {
  hero: 'agi-features-plugins-title',
  folder: 'agi-features-plugins-folder-title',
  supply: 'agi-features-plugins-supply-title',
  close: 'agi-features-plugins-close-title',
} as const;

const INSTALL_TRANSCRIPT = [
  { kind: 'cmd', text: 'agi plugin install github-automation --integrity <sha256>' },
  { kind: 'out', text: 'Cloning plugin tree...' },
  { kind: 'out', text: 'Hashing tree with SHA-256... matches --integrity' },
  { kind: 'out', text: 'Installed to ~/.agiworkforce/plugins/github-automation' },
  { kind: 'cmd', text: 'agi plugin install unverified-pack' },
  { kind: 'dim', text: 'error: --integrity required' },
  { kind: 'dim', text: '  pass --unsafe-no-integrity to skip and print a warning' },
] as const;

const FOLDER_CONTENTS = [
  {
    meta: 'Markdown',
    title: 'Commands, agents, skills',
    body: 'The manifest points at markdown files. Slash commands wait until you invoke them; declared skill folders join the skill list as soon as the plugin loads.',
  },
  {
    meta: 'Shell',
    title: 'Lifecycle hooks',
    body: 'A plugin can declare hooks that fire on session events, and a hook is a shell command. They merge in only from plugins that live in your home directory.',
  },
  {
    meta: 'Processes',
    title: 'MCP servers',
    body: 'A declared server connects over stdio by default, which spawns a child process. A manifest can name sse or http with a url instead.',
  },
] as const;

export default async function FeaturesPluginsPage() {
  const catalog = await loadPluginCatalog();
  const availability = pluginAvailabilityClaim(catalog);

  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <section className="agi-lp-hero" aria-labelledby={IDS.hero}>
          <div className="agi-ds-container agi-lp-hero-grid">
            <div className="agi-lp-hero-copy">
              <p className="agi-lp-eyebrow">Features &middot; Plugins</p>
              <h1 className="agi-lp-h1" id={IDS.hero}>
                <span className="agi-lp-line">A plugin ships code</span>
                <em className="agi-lp-accent">that runs as you.</em>
              </h1>
              <p className="agi-lp-lede">
                A plugin&rsquo;s commands, agents, and skills are markdown that spawns nothing. Its
                hooks are shell commands and its MCP servers are connections opened on load, which
                is why <code>agi plugin install</code> refuses to do anything until you pin a
                SHA-256 of the tree you actually read. <strong>{availability}</strong>
              </p>
              <ButtonRow>
                <Button href="/plugins">Browse the catalogue</Button>
                <Button href="/cli" variant="secondary">
                  See the CLI
                </Button>
              </ButtonRow>
            </div>
            <div className="agi-lp-hero-stage">
              <pre className="agi-lp-terminal" aria-label="A plugin install in the AGI CLI">
                {INSTALL_TRANSCRIPT.map((line) => (
                  <span className="agi-lp-terminal-line" data-kind={line.kind} key={line.text}>
                    {line.text}
                  </span>
                ))}
              </pre>
            </div>
          </div>
        </section>

        <Section id="inside-the-folder" labelledBy={IDS.folder} rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Inside the folder</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.folder}>
                Some of what a plugin carries is inert, and some of it executes.
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {FOLDER_CONTENTS.map((item) => (
                <div
                  key={item.meta}
                  className="flex flex-col gap-3 rounded-xl border border-[var(--agi-rule)] bg-[var(--agi-ground-2)] p-6"
                >
                  <Eyebrow>{item.meta}</Eyebrow>
                  <h3 className="agi-ds-h3">{item.title}</h3>
                  <Prose size="sm">{item.body}</Prose>
                </div>
              ))}
            </div>
          </Stack>
        </Section>

        <Section id="supply-chain" labelledBy={IDS.supply} rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>Supply chain</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.supply}>
                An install is treated as a supply-chain event.
              </h2>
            </div>
            <Ledger
              caption="Plugin install safeguards"
              rows={[
                {
                  label: 'Source',
                  value:
                    'A local folder or a shallow git clone, landing under ~/.agiworkforce/plugins/ with a name that has to pass validation first.',
                },
                {
                  label: 'Integrity',
                  value:
                    'The CLI hashes every file in the tree with SHA-256 and compares it to the --integrity value you passed. A mismatch deletes the tree.',
                },
                {
                  label: 'Manifest',
                  value: 'A tree with no recognized manifest is deleted after the copy.',
                },
                {
                  label: 'Paths',
                  value:
                    'Manifest entries must be plain relative paths. Anything that resolves outside the plugin folder is rejected on load.',
                },
                {
                  label: 'Hooks',
                  value:
                    'Merged only from ~/.agiworkforce/plugins/, so a plugin sitting in a cloned repository cannot start running shell commands on your tool calls.',
                },
              ]}
            />
          </Stack>
        </Section>

        <section className="agi-lp-close" aria-labelledby={IDS.close}>
          <div className="agi-ds-container">
            <div className="agi-lp-close-inner">
              <h2 className="agi-lp-h2" id={IDS.close}>
                Read the folder <em className="agi-lp-accent">before you trust it.</em>
              </h2>
              <p className="agi-lp-lede">
                Once a plugin is loaded, what its tools may actually do is governed by the same
                per-tool permissions as every other tool in the workspace. Every command above is in
                the agi binary source today; public CLI downloads are{' '}
                {SURFACE_STATUS.cli.toLowerCase()}.
              </p>
              <ButtonRow>
                <Button href="/download">Check CLI availability</Button>
                <Button href="/features/tools" variant="secondary">
                  How tool permissions work
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
