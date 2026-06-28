import type { Metadata } from 'next';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { FeatureGrid, LedgerSection } from '../../components/marketing/LandingSections';
import { FinalCta, FlagshipHero } from '../../components/marketing/FlagshipSections';
import { LAUNCH } from '../../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'AGI Work: Scheduled work and dispatch on your desktop',
  description:
    'AGI Work is the Desktop mode for scheduled routines, local file work, approved tools, and mobile-to-desktop dispatch. Explicit approvals on every sensitive action.',
  alternates: { canonical: 'https://agiworkforce.com/agi-work' },
};

export default function AgiWorkPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <FlagshipHero
          eyebrow="AGI Work · on Desktop"
          titleLines={['Your desktop,', 'on schedule.']}
          em="on schedule."
          lede="AGI Work is the Desktop mode for scheduled work and dispatched tasks: set routines that run on your own machine, send a task from your phone to the Desktop host, and approve the steps that matter before they run. The compute is yours, and so is every decision."
          ctas={[
            { href: '/download', label: 'Download AGI' },
            { href: '/desktop', label: 'See AGI Desktop' },
            { href: '/mobile', label: 'See Mobile Dispatch' },
          ]}
          modeRibbon={['Local · on-device', 'BYOK · your keys', 'Cloud · public alpha']}
        />

        <FeatureGrid
          eyebrow="Desktop workflows"
          title="What AGI Work does on your machine."
          items={[
            {
              meta: 'Schedule',
              title: 'Scheduled work',
              body: 'Run daily or weekly routines on your own machine, with results waiting in the thread when you come back.',
            },
            {
              meta: 'Dispatch',
              title: 'Mobile-to-desktop dispatch',
              body: 'Start a task from the phone; the Desktop host runs it and progress streams back to your pocket.',
              href: '/mobile',
            },
            {
              meta: 'Files',
              title: 'Local file work',
              body: 'Read, organize, summarize, and draft against local folders through path-scoped permissions.',
            },
            {
              meta: 'Tools',
              title: 'Apps and connectors',
              body: 'Use approved desktop extensions and local MCP servers behind explicit tool approvals.',
              href: '/apps',
            },
            {
              meta: 'Approvals',
              title: 'Approval-first execution',
              body: 'Sensitive actions wait for your explicit approval, with the action visible before it runs.',
            },
            {
              meta: 'Boundary',
              title: 'Visible routing',
              body: 'AGI Work shows which model is reasoning and what local context would leave the machine before any BYOK or Cloud handoff.',
            },
          ]}
        />

        <LedgerSection
          eyebrow="Mode design"
          title="One chat, not a second universe."
          rows={[
            {
              k: 'Normal chat',
              v: 'Ask questions, attach files, switch models, and create artifacts from the same composer.',
            },
            {
              k: 'Focused file work',
              v: 'Selecting a file adds context and affordances inside the same chat instead of moving you to another product.',
            },
            {
              k: 'Approvals',
              v: 'Actions ask before they run. Broader automation is an explicit, scoped choice. Never a silent default.',
            },
            {
              k: 'Hosted AGI Work',
              v: 'Managed cloud execution is public alpha, open by default; metering, fraud, and data controls keep pace with usage.',
            },
          ]}
        />

        <FinalCta
          eyebrow={LAUNCH.publicLabel}
          title="Put your desktop on the roster."
          body="Install AGI Desktop, schedule the first routine, and dispatch work from your phone. Every sensitive action stays visible and approved before it runs."
          ctas={[
            { href: '/download', label: 'Download AGI' },
            { href: '/desktop', label: 'See AGI Desktop' },
            { label: 'Join Cloud Waitlist', waitlist: true },
          ]}
          stamp={`Public launch · ${LAUNCH.date}`}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
