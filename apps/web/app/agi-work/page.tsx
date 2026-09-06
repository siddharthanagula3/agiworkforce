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
  title: 'AGI Work: goal in, autonomous tool loop, reviewable deliverables',
  description:
    'AGI Work is the mode built into the AGI web chat composer: switch Chat to AGI Work, give it a goal, and it runs a multi-step tool loop with approvals on sensitive steps, then returns deliverables with a full run history at /tasks.',
  path: '/agi-work',
});

const IDS = {
  hero: 'agi-work-hero-title',
  facts: 'agi-work-facts-title',
  inside: 'agi-work-inside-title',
  states: 'agi-work-states-title',
  close: 'agi-work-close-title',
} as const;

const RUN_FACTS = [
  'three to six step plan before the first tool call',
  'Pro plans and above',
  'every run listed end to end at /tasks',
  'approvals pause the run, never skip it',
] as const;

const INSIDE_A_RUN = [
  {
    meta: 'Composer',
    title: 'A mode of the box you already type in',
    body: 'Chat and AGI Work are two positions of one segmented control. Switching it reveals a project scope chip and two optional fields, constraints and deliverable.',
  },
  {
    meta: 'Plan',
    title: 'The plan lands before the first tool call',
    body: 'AGI Work asks the model for three to six concrete steps, each moving from pending to in progress to completed as the run works.',
  },
  {
    meta: 'Approval',
    title: 'A call you have not cleared stops the run',
    body: 'The run switches to awaiting input and shows the tool name with the arguments it wants to send. Approve, deny, or attach guidance.',
  },
] as const;

export default function AgiWorkPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <section className="agi-lp-hero" aria-labelledby={IDS.hero}>
          <div className="agi-ds-container agi-lp-hero-grid">
            <div className="agi-lp-hero-copy">
              <p className="agi-lp-eyebrow">AGI Work</p>
              <h1 className="agi-lp-h1" id={IDS.hero}>
                <span className="agi-lp-line">AGI Work writes a plan first,</span>
                <em className="agi-lp-accent">then asks before it acts.</em>
              </h1>
              <p className="agi-lp-lede">
                Switch the composer from Chat to AGI Work, describe the outcome, and pin the
                constraints and the deliverable if they matter. It works the plan with web search,
                page fetches, sandboxed code, and files, stopping whenever a call needs your say-so.
              </p>
              <ButtonRow>
                <Button href="/chat">Open AGI Work</Button>
                <Button href="/tasks" variant="secondary">
                  See your runs
                </Button>
              </ButtonRow>
            </div>
            <div className="agi-lp-hero-stage">
              <AgentRunWindow />
            </div>
          </div>
        </section>

        <div className="agi-lp-factline">
          <div className="agi-ds-container">
            <ul className="agi-lp-factline-list">
              {RUN_FACTS.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          </div>
        </div>

        <Section id="agi-work-inside" labelledBy={IDS.inside} rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Inside a run</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.inside}>
                The run tells you what it will do before it does it.
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {INSIDE_A_RUN.map((item) => (
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

        <Section id="agi-work-states" labelledBy={IDS.states} rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>Run states</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.states}>
                Every run wears one of these labels in the task list.
              </h2>
            </div>
            <Ledger
              caption="AGI Work run states"
              rows={[
                {
                  label: 'Queued',
                  value:
                    'The run exists before the model has done anything with it. Stop already works.',
                },
                {
                  label: 'Running',
                  value:
                    'Working through the plan; an open run re-reads its own journal every few seconds.',
                },
                {
                  label: 'Awaiting input',
                  value:
                    'Blocked on you: either a tool call needs approval, or a connector asked for a field.',
                },
                { label: 'Paused', value: 'Held but still live, and Stop still works on it.' },
                {
                  label: 'Ready for review',
                  value:
                    'The last state the agent loop emits: the journal is complete and any files are attached.',
                },
                {
                  label: 'Completed',
                  value: 'Settled, and nothing further will ever be appended to it.',
                },
                {
                  label: 'Failed',
                  value: 'Stopped on an error, and the activity list shows the step it stopped on.',
                },
                { label: 'Cancelled', value: 'You pressed Stop.' },
                {
                  label: 'Archived',
                  value: 'Drops out of the Active filter and stays readable under All.',
                },
              ]}
            />
          </Stack>
        </Section>

        <section className="agi-lp-close" aria-labelledby={IDS.close}>
          <div className="agi-ds-container">
            <div className="agi-lp-close-inner">
              <h2 className="agi-lp-h2" id={IDS.close}>
                Give AGI Work <em className="agi-lp-accent">its first goal.</em>
              </h2>
              <p className="agi-lp-lede">
                On a plan without the capability the control never renders, so nothing breaks at
                send time. AGI Work runs on AGI Managed Cloud, so runs can fail or stall, and
                behaviour may change.
              </p>
              <ButtonRow>
                <Button href="/pricing" variant="secondary">
                  See which plans include AGI Work
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
