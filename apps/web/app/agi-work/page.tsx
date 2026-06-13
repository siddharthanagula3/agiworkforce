import type { Metadata } from 'next';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import {
  CampaignHero,
  FeatureGrid,
  LaunchCta,
  LedgerSection,
} from '../../components/marketing/LandingSections';
import { LAUNCH, POSITIONING } from '../../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'AGI Cowork - Desktop agents for browser, files, apps, and dispatch',
  description:
    'AGI Cowork is the desktop agent mode for computer use, browser tasks, files, scheduled tasks, dispatch, and live artifacts.',
  alternates: { canonical: 'https://agiworkforce.com/cowork' },
};

export default function CoworkPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <CampaignHero
          eyebrow={`${LAUNCH.publicLabel} · Desktop agent mode`}
          title="Let AGI work on the computer you already own."
          lede={`Cowork is the desktop mode for browser use, file work, local apps, scheduled tasks, live artifacts, and mobile-to-desktop dispatch. ${POSITIONING.trustBoundary}`}
          primaryCta={{ href: '/desktop', label: 'See desktop app' }}
          secondaryCta={{ href: '/mobile', label: 'Mobile dispatch' }}
          chips={['Ask mode', 'Act mode', 'Dispatch', 'Scheduled tasks', 'Local extensions']}
          panelTitle="Cowork loop"
          panelRows={[
            { k: 'Observe', v: 'Screenshots, DOM/page context, files, and app state' },
            { k: 'Decide', v: 'Provider-selected model reasons over the next action' },
            { k: 'Approve', v: 'Ask before actions or use explicit act mode' },
            { k: 'Execute', v: 'Browser, keyboard, mouse, files, apps, and connectors' },
          ]}
        />

        <FeatureGrid
          eyebrow="Desktop workflows"
          title="What Cowork needs to make visible."
          items={[
            {
              meta: 'Browser',
              title: 'Use websites with approval',
              body: 'Click, type, scroll, read pages, and fill forms while showing each action and its risk before execution when approval is required.',
            },
            {
              meta: 'Files',
              title: 'Work with local folders',
              body: 'Read, organize, summarize, and create files through local extensions and path-scoped permissions.',
            },
            {
              meta: 'Apps',
              title: 'Operate installed tools',
              body: 'Use approved desktop extensions for notes, spreadsheets, browser sessions, and local MCP servers.',
              href: '/apps',
            },
            {
              meta: 'Dispatch',
              title: 'Send tasks from mobile to desktop',
              body: 'Start a task from the phone and let the desktop host run it while progress streams back.',
              href: '/mobile',
            },
            {
              meta: 'Automation',
              title: 'Scheduled tasks and live artifacts',
              body: 'Run daily or weekly routines and keep dashboards fresh from connected data sources.',
              href: '/features/artifacts',
            },
            {
              meta: 'Safety',
              title: 'Separate local action from cloud inference',
              body: 'Cowork must show which model is reasoning and what local context is leaving the machine before any BYOK or Cloud handoff.',
            },
          ]}
        />

        <LedgerSection
          eyebrow="Mode design"
          title="Cowork must be one chat, not a second universe."
          rows={[
            {
              k: 'Normal chat',
              v: 'Ask questions, attach files, switch models, and create artifacts from the same composer.',
            },
            {
              k: 'Focused file work',
              v: 'Selecting a file should add context and affordances inside the same chat rather than moving users to another chat product.',
            },
            {
              k: 'Ask vs Act',
              v: 'Ask mode requires approval for actions. Act mode is explicit and can be restricted by site, app, tool, or project.',
            },
            {
              k: 'Cloud waitlist',
              v: 'Managed Cowork Cloud is invite-only until hosted execution, fraud, metering, and data controls are ready.',
            },
          ]}
        />

        <LaunchCta
          title="Cowork is the desktop reason to install AGI."
          body="Local and BYOK chat can start the relationship. Cowork turns the desktop into the private execution host for browser, file, app, and dispatch workflows."
          primary={{ href: '/download', label: LAUNCH.ctaLabel }}
          secondary={{ href: '/desktop', label: 'Desktop details' }}
        />
        <MarketingFooter />
      </main>
    </div>
  );
}
