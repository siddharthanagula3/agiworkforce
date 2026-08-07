import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { FeatureGrid, LedgerSection } from '@/features/marketing/components/LandingSections';
import { FinalCta, FlagshipHero } from '@/features/marketing/components/FlagshipSections';
import { LAUNCH } from '../../lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'AGI Work: goal in, autonomous tool loop, reviewable deliverables',
  description:
    'AGI Work is the mode built into the AGI web chat composer: switch Chat to AGI Work, give it a goal, and it runs a multi-step tool loop with approvals on sensitive steps, then returns deliverables with a full run history at /tasks.',
  path: '/agi-work',
});

export default function AgiWorkPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <FlagshipHero
          eyebrow="AGI Work · in the web app"
          titleLines={['Give it a goal.', 'Get a deliverable.']}
          em="Get a deliverable."
          lede="AGI Work is a mode built into the AGI chat composer today. Flip the composer from Chat to AGI Work, describe the outcome you want, and it works through a multi-step loop with tools and files — pausing for your approval on anything sensitive — then hands back the finished work. Every run is saved to your task history."
          ctas={[
            { href: '/chat', label: 'Open AGI Work' },
            { href: '/tasks', label: 'See task history' },
            { href: '/pricing', label: 'Plans with AGI Work' },
          ]}
          modeRibbon={['Local · on-device', 'BYOK · your keys', 'Cloud · public alpha']}
        />

        <FeatureGrid
          eyebrow="How it works"
          title="What AGI Work does in the composer."
          items={[
            {
              meta: 'Toggle',
              title: 'Chat or AGI Work, one composer',
              body: 'A single segmented toggle switches the same composer between quick chat and AGI Work — multi-step tasks with tools, files, and reviewable deliverables. No second app, no separate workspace.',
              href: '/chat',
            },
            {
              meta: 'Goal',
              title: 'Goal in, plan out',
              body: 'Describe the outcome instead of the keystrokes. AGI Work breaks the goal into steps and works through them, using the tools and files the task needs.',
            },
            {
              meta: 'Approvals',
              title: 'Approval-first on sensitive steps',
              body: 'The loop runs on its own for safe steps and pauses for your explicit approval before anything sensitive — each action is shown before it runs.',
            },
            {
              meta: 'Deliverables',
              title: 'Reviewable deliverables',
              body: 'Runs end in something you can check: files, drafts, and artifacts you can open, edit, and keep — not just a chat reply.',
            },
            {
              meta: 'History',
              title: 'Full run history at /tasks',
              body: 'Every AGI Work run and agent step is recorded in your task history, so you can revisit what ran, what it produced, and why.',
              href: '/tasks',
            },
            {
              meta: 'Boundary',
              title: 'Visible model and routing',
              body: 'AGI Work shows which model is reasoning and what context would leave your machine before any BYOK or managed-cloud handoff. Local, BYOK, and Cloud stay separate trust boundaries.',
            },
          ]}
        />

        <LedgerSection
          eyebrow="Where it runs"
          title="One chat, not a second universe."
          rows={[
            {
              k: 'In the app today',
              v: 'AGI Work ships in the web chat composer at /chat on plans that include it. Give it a goal and review the deliverable in the same thread.',
            },
            {
              k: 'Task history',
              v: 'Completed and in-progress runs live at /tasks — your managed-cloud task and agent-run history.',
            },
            {
              k: 'Approvals',
              v: 'Sensitive actions ask before they run. Broader automation is an explicit, scoped choice — never a silent default.',
            },
            {
              k: 'Desktop dispatch',
              v: 'Scheduled routines run on your own machine, and you can hand a task from your phone to a paired desktop. Both require the Desktop app, and dispatch only runs when that desktop has explicitly enabled it.',
            },
          ]}
        />

        <FinalCta
          eyebrow={LAUNCH.publicLabel}
          title="Put a goal into AGI Work."
          body="AGI Work is live in the web app: switch the composer to AGI Work, hand it an outcome, approve the steps that matter, and collect the deliverable. Scheduled routines and mobile-to-desktop dispatch ship with the Desktop app."
          ctas={[
            { href: '/chat', label: 'Open AGI Work' },
            { href: '/tasks', label: 'See task history' },
            { href: '/pricing', label: 'Compare plans' },
          ]}
          stamp={LAUNCH.publicLabel}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
