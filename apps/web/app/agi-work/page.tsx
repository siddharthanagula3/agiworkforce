import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { FeatureGrid, LedgerSection } from '@/features/marketing/components/LandingSections';
import { FinalCta, FlagshipHero } from '@/features/marketing/components/FlagshipSections';

export const metadata = buildMetadata({
  title: 'AGI Work: goal in, autonomous tool loop, reviewable deliverables',
  description:
    'AGI Work is the mode built into the AGI web chat composer: switch Chat to AGI Work, give it a goal, and it runs a multi-step tool loop with approvals on sensitive steps, then returns deliverables with a full run history at /tasks.',
  path: '/agi-work',
});

function AgiWorkRunPanel() {
  return (
    <figure className="agi-chat" aria-label="An AGI Work run in the task list, paused for approval">
      <figcaption className="agi-chat-header">
        <span className="agi-chat-model">AGI Work task</span>
        <span className="agi-chat-meta">Awaiting input</span>
      </figcaption>
      <div className="agi-chat-body" aria-hidden="true">
        <div className="agi-msg">
          <p className="agi-msg-role">Goal</p>
          <p className="agi-msg-text">
            Compare our onboarding email sequence with the three competitors we track, and write up
            where ours loses people.
          </p>
        </div>
        <div className="agi-msg agi-msg-quiet">
          <p className="agi-msg-role">Deliverable</p>
          <p className="agi-msg-text">A one-page memo with the drop-off points ranked.</p>
        </div>
        <div className="agi-switch">
          <span className="agi-switch-label">Plan &middot; 4</span>
        </div>
        <div className="agi-msg agi-msg-quiet">
          <p className="agi-msg-role">Steps</p>
          <p className="agi-msg-text">
            Collect the three published sequences &middot; Extract each step and its timing &middot;
            Compare them with ours &middot; Draft the memo
          </p>
        </div>
        <div className="agi-switch">
          <span className="agi-switch-label">Waiting for your approval</span>
        </div>
        <div className="agi-msg">
          <p className="agi-msg-role">url_fetch</p>
          <p className="agi-msg-text">
            <code>{'{"url":"https://competitor.example/emails/day-3"}'}</code>
          </p>
          <p className="agi-msg-text">Approve, deny, or add guidance to steer this run.</p>
        </div>
      </div>
    </figure>
  );
}

export default function AgiWorkPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <FlagshipHero
          eyebrow="AGI Work · in the web composer"
          titleLines={['AGI Work writes a plan first, then asks before it acts.']}
          em="writes a plan first"
          lede="Switch the composer from Chat to AGI Work, describe the outcome, and pin the constraints and the deliverable if they matter. Before it touches a tool, AGI Work sends back a three-to-six step plan for the objective you gave it. Then it works that plan with web search, page fetches, sandboxed code, and files, stopping the run whenever a call needs your say-so."
          ctas={[
            { href: '/chat', label: 'Open AGI Work' },
            { href: '/tasks', label: 'See your runs' },
          ]}
          modeRibbon={[]}
          visual={<AgiWorkRunPanel />}
        />

        <FeatureGrid
          eyebrow="Inside a run"
          title="The run tells you what it will do before it does it."
          items={[
            {
              meta: 'Composer',
              title: 'A mode of the box you already type in',
              body: 'Chat and AGI Work are two positions of one segmented control: right of the attachment button on a wide screen, inside the plus menu on a narrow one. Switching it reveals a project scope chip and two optional fields, Constraints and Deliverable, under the composer. Whatever you type is the objective; the fields only narrow it.',
              href: '/chat',
            },
            {
              meta: 'Plan',
              title: 'The plan lands before the first tool call',
              body: 'AGI Work asks the model for three to six concrete steps and shows them under a Plan heading. Each step moves from pending to in progress to completed as the run works, so a stalled run is visible at the step that stalled.',
            },
            {
              meta: 'Approval',
              title: 'A call you have not cleared stops the run',
              body: 'The run switches to Awaiting input and shows the tool name with the arguments it wants to send. Approve it, deny it, or attach guidance that redirects what happens next. Another device signed into the same account can answer too, and the first answer wins.',
            },
          ]}
        />

        <LedgerSection
          eyebrow="Run states"
          title="Every run wears one of these labels in the task list."
          rows={[
            {
              k: 'Queued',
              v: 'The run exists before the model has done anything with it. It is already listed, and Stop already works.',
            },
            {
              k: 'Running',
              v: 'The run is working through the plan, and an open run re-reads its own journal every few seconds, so the activity list keeps moving without a refresh.',
            },
            {
              k: 'Awaiting input',
              v: 'The run is blocked on you: either a tool call is waiting for approval, or a connector asked for a field before it can continue.',
            },
            {
              k: 'Paused',
              v: 'The run is held but still live, and Stop still works on it.',
            },
            {
              k: 'Ready for review',
              v: 'This is the last state the agent loop emits: the journal is complete, and any files the run generated are attached to it for download.',
            },
            {
              k: 'Completed',
              v: 'The run is settled, and nothing further will ever be appended to it.',
            },
            {
              k: 'Failed',
              v: 'The run stopped on an error, and the activity list shows the step it stopped on.',
            },
            { k: 'Cancelled', v: 'You pressed Stop.' },
            {
              k: 'Archived',
              v: 'The run drops out of the Active filter and stays readable under All.',
            },
          ]}
        />

        <FinalCta
          eyebrow="Plans"
          title="Give AGI Work its first goal."
          body="The composer toggle appears on Pro plans and above; on a plan without the capability the control never renders, so nothing breaks at send time. Once it is there, every run you start is readable end to end at /tasks: goal, plan, tool calls, approvals, and outputs."
          ctas={[{ href: '/pricing', label: 'See which plans include AGI Work' }]}
          stamp="AGI Work runs on AGI Managed Cloud: runs can fail or stall, and behaviour may change."
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
