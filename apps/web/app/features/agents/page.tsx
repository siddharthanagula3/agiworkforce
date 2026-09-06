import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { AgentRunWindow } from '@/features/marketing/components/FeatureScenes';
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

export const metadata = buildMetadata({
  title: 'Agents: delegated work that stops to ask',
  description:
    'An AGI agent is a markdown file with frontmatter naming the tools it may touch. Subagents fan out through the task tool, hooks fire on the session lifecycle, and the approval dialog opens with its cursor parked on No.',
  path: '/features/agents',
});

const IDS = {
  hero: 'agi-features-agents-title',
  anatomy: 'agi-features-agents-anatomy-title',
  defaults: 'agi-features-agents-defaults-title',
  containment: 'agi-features-agents-containment-title',
  close: 'agi-features-agents-close-title',
} as const;

const ANATOMY = [
  {
    meta: 'Define',
    title: 'The definition is a file',
    body: 'A markdown file with frontmatter: a name, a description of when to use it, an optional model, and the tools it may or may not call. Start a session on one with --agent.',
  },
  {
    meta: 'Fan out',
    title: 'Subagents run beside you',
    body: 'The task tool spawns a subagent on its own thread. It reports as running, completed, failed, or cancelled, and hands back its output with the files it modified.',
  },
  {
    meta: 'Observe',
    title: 'Hooks on the session lifecycle',
    body: 'Handlers fire on session start, on prompt submit, before and after a tool call, on a permission request, and on stop.',
  },
] as const;

export default function FeaturesAgentsPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <section className="agi-lp-hero" aria-labelledby={IDS.hero}>
          <div className="agi-ds-container agi-lp-hero-grid">
            <div className="agi-lp-hero-copy">
              <p className="agi-lp-eyebrow">Features &middot; Agents</p>
              <h1 className="agi-lp-h1" id={IDS.hero}>
                <span className="agi-lp-line">Delegation only works</span>
                <em className="agi-lp-accent">if the default is no.</em>
              </h1>
              <p className="agi-lp-lede">
                An agent is a session you hand work to: it reads files, runs commands, calls
                connectors, and reports back with what it changed. Every risky step opens an
                approval you have to answer, and commands run inside an OS sandbox the CLI refuses
                to start without.
              </p>
              <ButtonRow>
                <Button href="/cli">See the agi CLI</Button>
                <Button href="/agent-permissions" variant="secondary">
                  Read the permission model
                </Button>
              </ButtonRow>
            </div>
            <div className="agi-lp-hero-stage">
              <AgentRunWindow />
            </div>
          </div>
        </section>

        <Section id="anatomy" labelledBy={IDS.anatomy} rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Anatomy</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.anatomy}>
                An agent is a session you named and narrowed.
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {ANATOMY.map((item) => (
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

        <Section id="defaults" labelledBy={IDS.defaults} rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>Defaults</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.defaults}>
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
                    'The overlay opens with the cursor parked on No, held there by an assertion the build checks.',
                },
                {
                  label: 'Your answer',
                  value:
                    'Yes allows one call. Allow Session lasts until you quit. Always Allow writes to disk and /permissions reset clears it.',
                },
                {
                  label: 'Sandbox',
                  value:
                    'Command execution asks the OS for a sandbox: Seatbelt on macOS, bubblewrap on Linux. Missing either, the run fails rather than continuing without one.',
                },
                {
                  label: 'Network',
                  value:
                    'A sandboxed command has no outbound network unless granted it explicitly.',
                },
                {
                  label: 'Subagents',
                  value:
                    "A subagent inherits the parent's model, permission mode, and tool filters, and a named definition can only narrow that set further.",
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="containment" labelledBy={IDS.containment} rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Containment</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.containment}>
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

        <section className="agi-lp-close" aria-labelledby={IDS.close}>
          <div className="agi-ds-container">
            <div className="agi-lp-close-inner">
              <h2 className="agi-lp-h2" id={IDS.close}>
                Write one agent file <em className="agi-lp-accent">and hand it a task.</em>
              </h2>
              <p className="agi-lp-lede">
                Agent definitions, parallel subagents, lifecycle hooks, the approval overlay, and
                the OS sandbox are all in the agi CLI source today.
              </p>
              <ButtonRow>
                <Button href="/download">Get the CLI</Button>
              </ButtonRow>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
