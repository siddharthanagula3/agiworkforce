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
import { PageHero, FactGrid } from '@/features/marketing/components/pages/surfaces/shared';
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

export default async function FeaturesPluginsPage() {
  const catalog = await loadPluginCatalog();
  const availability = pluginAvailabilityClaim(catalog);

  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-features-plugins-title"
          eyebrow="Features · Plugins"
          title="A plugin ships code that runs as you."
          lede={
            <>
              A plugin&rsquo;s slash commands, subagent definitions, and skill folders are markdown
              that spawns nothing. Its hooks are shell commands and its MCP servers are connections
              opened on load, which is why agi plugin install refuses to do anything until you pin a
              SHA-256 of the tree you actually read. <strong>{availability}</strong>
            </>
          }
          ctas={[
            { href: '/plugins', label: 'Browse the catalogue' },
            { href: '/cli', label: 'See the CLI', variant: 'secondary' },
          ]}
        />

        <Section id="inside-the-folder" labelledBy="agi-features-plugins-folder-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Inside the folder</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-features-plugins-folder-title">
                Some of what a plugin carries is inert, and some of it executes.
              </h2>
            </div>
            <FactGrid
              items={[
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
                  body: 'A declared server connects over stdio by default, which spawns a child process. A manifest can name sse or http with a url instead, and a transport the CLI does not recognize is skipped with a note.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="supply-chain" labelledBy="agi-features-plugins-supply-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>Supply chain</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-features-plugins-supply-title">
                An install is treated as a supply-chain event.
              </h2>
            </div>
            <Ledger
              caption="Plugin install safeguards"
              rows={[
                {
                  label: 'Source',
                  value:
                    'A plugin arrives from a local folder or a shallow git clone, and lands under ~/.agiworkforce/plugins/ with a name that has to pass validation first.',
                },
                {
                  label: 'Integrity',
                  value:
                    'After the copy, the CLI hashes every file in the tree with SHA-256 and compares it to the --integrity value you passed. A mismatch deletes the tree and reports both hashes. Skipping the check requires --unsafe-no-integrity, which prints a warning on every install.',
                },
                {
                  label: 'Manifest',
                  value:
                    'A tree with no recognized manifest is deleted after the copy, and the error names all five paths that were probed.',
                },
                {
                  label: 'Paths',
                  value:
                    'Manifest entries must be plain relative paths. Absolute paths, dot and parent segments, and anything that resolves outside the plugin folder are rejected on load and named on stderr.',
                },
                {
                  label: 'Hooks',
                  value:
                    'Hooks are merged only from ~/.agiworkforce/plugins/. A plugin sitting in a repository you cloned has its hooks blocked and the block reported, so a clone cannot start running shell commands on your tool calls.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="plugins-close" labelledBy="agi-features-plugins-close-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-features-plugins-close-title">
              Read the folder before you trust it.
            </h2>
            <Prose>
              Once a plugin is loaded, what its tools may actually do is governed by the same
              per-tool permissions as every other tool in the workspace. Every command above is in
              the agi binary source today; public CLI downloads are{' '}
              {SURFACE_STATUS.cli.toLowerCase()}.
            </Prose>
            <ButtonRow>
              <Button href="/download">Check CLI availability</Button>
              <Button href="/features/tools" variant="secondary">
                How tool permissions work
              </Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
