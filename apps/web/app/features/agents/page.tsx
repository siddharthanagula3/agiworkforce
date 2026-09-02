import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Ledger,
  ProductFrame,
  Prose,
  Section,
  Stack,
} from '@/features/marketing/components/system';
import { FactGrid, PageHero } from '@/features/marketing/components/pages/surfaces/shared';

export const metadata = buildMetadata({
  title: 'Agents: delegated work that stops to ask',
  description:
    'An AGI agent is a markdown file with frontmatter naming the tools it may touch. Subagents fan out through the task tool, hooks fire on the session lifecycle, and the approval dialog opens with its cursor parked on No.',
  path: '/features/agents',
});

export default function FeaturesAgentsPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-features-agents-title"
          eyebrow="Features · Agents"
          title="Delegation only works if the default is no."
          lede="An agent is a session you hand work to: it reads files, runs commands, calls connectors, and reports back with what it changed. Every risky step opens an approval you have to answer, and the commands themselves run inside an OS sandbox the CLI refuses to start without."
          ctas={[
            { href: '/cli', label: 'See the agi CLI' },
            {
              href: '/agent-permissions',
              label: 'Read the permission model',
              variant: 'secondary',
            },
          ]}
          visual={
            <ProductFrame
              light="/product/agents-tool-approvals-light.png"
              dark="/product/agents-tool-approvals-dark.png"
              alt='The tool approvals setting in AGI, with "Ask before every action" selected'
              width={1132}
              height={584}
              caption={['Settings', 'Tool approvals']}
              priority
            />
          }
        />

        <Section id="anatomy" labelledBy="agi-features-agents-anatomy-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Anatomy</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-features-agents-anatomy-title">
                An agent is a session you named and narrowed.
              </h2>
            </div>
            <FactGrid
              items={[
                {
                  meta: 'Define',
                  title: 'The definition is a file',
                  body: 'A markdown file with frontmatter: a name, a description of when to use it, an optional model, and the tools it may or may not call. Project definitions sit in .agiworkforce/agents; global ones live in your home directory. Start a session on one with --agent.',
                },
                {
                  meta: 'Fan out',
                  title: 'Subagents run beside you',
                  body: 'The task tool spawns a subagent on its own thread. It reports as running, completed, failed, or cancelled, and hands back its output together with the files it modified. Seven run at once, and the tree stops three levels deep.',
                },
                {
                  meta: 'Observe',
                  title: 'Hooks on the session lifecycle',
                  body: 'Handlers fire on session start, on prompt submit, before and after a tool call, on a permission request, and on stop. That is where your own guardrails, logs, and automations attach.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="defaults" labelledBy="agi-features-agents-defaults-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>Defaults</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-features-agents-defaults-title">
                Where a setting could have gone either way, it shipped closed.
              </h2>
              <Prose>
                Delegation is only as good as what happens when nobody is watching the screen. These
                are the values the code picks when you have not picked one.
              </Prose>
            </div>
            <Ledger
              caption="Agent defaults"
              rows={[
                {
                  label: 'Approval',
                  value:
                    'The overlay opens with the cursor parked on No, held there by an assertion the build checks. Hitting Enter on a prompt you did not read denies the call.',
                },
                {
                  label: 'Your answer',
                  value:
                    'Yes allows one call and persists nothing. Allow Session lasts until you quit. Always Allow is written to the permission store on disk, and /permissions reset clears it again. Deny All cancels the rest of the turn.',
                },
                {
                  label: 'Sandbox',
                  value:
                    'Command execution asks the OS for a sandbox: Seatbelt on macOS, bubblewrap on Linux. When neither is present the run fails rather than quietly continuing without one. Passing --no-sandbox is the way past, and it prints a warning.',
                },
                {
                  label: 'Network',
                  value:
                    'A sandboxed command has no outbound network. An install, a clone, or an API call has to be granted it explicitly.',
                },
                {
                  label: 'Subagents',
                  value:
                    "A subagent inherits the parent's model, permission mode, and tool filters. A named definition can narrow that set further and can never widen it.",
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="containment" labelledBy="agi-features-agents-containment-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Containment</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-features-agents-containment-title">
                The session will tell you what its sandbox allows.
              </h2>
            </div>
            <Prose>
              Typing /sandbox prints the mode the session is running under, the tools it allows, the
              ones it blocks, and the backend enforcing it. The modes are read-only, contained, and
              unrestricted. Which route a session&rsquo;s tokens travel on is a separate boundary,
              covered on the Local page.
            </Prose>
            <ButtonRow>
              <Button href="/local" variant="secondary">
                Read the routing boundary
              </Button>
            </ButtonRow>
          </Stack>
        </Section>

        <Section id="agents-close" labelledBy="agi-features-agents-close-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-features-agents-close-title">
              Write one agent file and hand it a task.
            </h2>
            <Prose>
              Agent definitions, parallel subagents, lifecycle hooks, the approval overlay, and the
              OS sandbox are all in the agi CLI source today.
            </Prose>
            <ButtonRow>
              <Button href="/download">Get the CLI</Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
