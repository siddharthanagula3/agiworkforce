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
import { FactGrid, PageHero } from '@/features/marketing/components/pages/surfaces/shared';

export const metadata = buildMetadata({
  title: 'AGI Work: goal in, autonomous tool loop, reviewable deliverables',
  description:
    'AGI Work is the mode built into the AGI web chat composer: switch Chat to AGI Work, give it a goal, and it runs a multi-step tool loop with approvals on sensitive steps, then returns deliverables with a full run history at /tasks.',
  path: '/agi-work',
});

export default function AgiWorkPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-work-hero-title"
          eyebrow="AGI Work"
          title="AGI Work writes a plan first, then asks before it acts."
          lede="Switch the composer from Chat to AGI Work, describe the outcome, and pin the constraints and the deliverable if they matter. Before it touches a tool, AGI Work sends back a three-to-six step plan for the objective you gave it. Then it works that plan with web search, page fetches, sandboxed code, and files, stopping the run whenever a call needs your say-so."
          ctas={[
            { href: '/chat', label: 'Open AGI Work' },
            { href: '/tasks', label: 'See your runs', variant: 'secondary' },
          ]}
        />

        <Section id="agi-work-inside" labelledBy="agi-work-inside-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Inside a run</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-work-inside-title">
                The run tells you what it will do before it does it.
              </h2>
            </div>
            <FactGrid
              items={[
                {
                  meta: 'Composer',
                  title: 'A mode of the box you already type in',
                  body: 'Chat and AGI Work are two positions of one segmented control: right of the attachment button on a wide screen, inside the plus menu on a narrow one. Switching it reveals a project scope chip and two optional fields, constraints and deliverable, under the composer.',
                },
                {
                  meta: 'Plan',
                  title: 'The plan lands before the first tool call',
                  body: 'AGI Work asks the model for three to six concrete steps and shows them under a plan heading. Each step moves from pending to in progress to completed as the run works, so a stalled run is visible at the step that stalled.',
                },
                {
                  meta: 'Approval',
                  title: 'A call you have not cleared stops the run',
                  body: 'The run switches to awaiting input and shows the tool name with the arguments it wants to send. Approve it, deny it, or attach guidance that redirects what happens next. Another device signed into the same account can answer too, and the first answer wins.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="agi-work-states" labelledBy="agi-work-states-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>Run states</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-work-states-title">
                Every run wears one of these labels in the task list.
              </h2>
            </div>
            <Ledger
              caption="AGI Work run states"
              rows={[
                {
                  label: 'Queued',
                  value:
                    'The run exists before the model has done anything with it. It is already listed, and Stop already works.',
                },
                {
                  label: 'Running',
                  value:
                    'The run is working through the plan, and an open run re-reads its own journal every few seconds.',
                },
                {
                  label: 'Awaiting input',
                  value:
                    'The run is blocked on you: either a tool call is waiting for approval, or a connector asked for a field before it can continue.',
                },
                {
                  label: 'Paused',
                  value: 'The run is held but still live, and Stop still works on it.',
                },
                {
                  label: 'Ready for review',
                  value:
                    'The last state the agent loop emits: the journal is complete, and any files the run generated are attached for download.',
                },
                {
                  label: 'Completed',
                  value: 'The run is settled, and nothing further will ever be appended to it.',
                },
                {
                  label: 'Failed',
                  value:
                    'The run stopped on an error, and the activity list shows the step it stopped on.',
                },
                { label: 'Cancelled', value: 'You pressed Stop.' },
                {
                  label: 'Archived',
                  value: 'The run drops out of the Active filter and stays readable under All.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="agi-work-close" labelledBy="agi-work-close-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-work-close-title">
              Give AGI Work its first goal.
            </h2>
            <Prose>
              The composer toggle appears on Pro plans and above; on a plan without the capability
              the control never renders, so nothing breaks at send time. Once it is there, every run
              you start is readable end to end at /tasks: goal, plan, tool calls, approvals, and
              outputs. AGI Work runs on AGI Managed Cloud, so runs can fail or stall, and behaviour
              may change.
            </Prose>
            <ButtonRow>
              <Button href="/pricing" variant="secondary">
                See which plans include AGI Work
              </Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
