import type { Metadata } from 'next';
import { Header } from '../../../components/layout/Header';
import { MarketingFooter } from '../../../components/marketing/MarketingFooter';
import {
  CampaignHero,
  FeatureGrid,
  LaunchCta,
  LedgerSection,
} from '../../../components/marketing/LandingSections';
import { LAUNCH } from '../../../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'AGI Memory - Search, reference, import, manage, and delete context',
  description:
    'AGI Memory gives users control over remembered context across chats and projects, including search, import, view, edit, and delete controls.',
  alternates: { canonical: 'https://agiworkforce.com/features/memory' },
};

export default function MemoryFeaturePage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <CampaignHero
          eyebrow={`${LAUNCH.publicLabel} · Memory`}
          title="Memory only works if users can see and control it."
          lede="AGI should remember useful context across chats and projects, but never as a hidden black box. Users need search, reference-chat controls, generated memory controls, import from other AI providers, and a clear delete path."
          primaryCta={{ href: '/download', label: LAUNCH.ctaLabel }}
          secondaryCta={{ href: '/privacy', label: 'Privacy posture' }}
          chips={['View', 'Search', 'Edit', 'Delete', 'Import']}
          panelTitle="Memory settings"
          panelRows={[
            { k: 'Search chats', v: 'Allow AGI to search relevant past chats when enabled' },
            { k: 'Generate', v: 'Allow durable memories from chat history when enabled' },
            { k: 'Manage', v: 'View, edit, pin, delete, and inspect source' },
            { k: 'Import', v: 'Bring context from another AI provider with user consent' },
          ]}
        />

        <FeatureGrid
          eyebrow="Memory controls"
          title="The settings page needs explicit language."
          items={[
            {
              meta: 'Search',
              title: 'Search and reference chats',
              body: 'When enabled, AGI can search relevant details from past chats to improve new answers.',
            },
            {
              meta: 'Generate',
              title: 'Generate memory from chat history',
              body: 'When enabled, AGI can extract durable facts and preferences that apply across chats and projects.',
            },
            {
              meta: 'Manage',
              title: 'View and manage memory',
              body: 'Users can inspect each memory, see where it came from, edit it, delete it, or pin it.',
            },
            {
              meta: 'Import',
              title: 'Import from other AI providers',
              body: 'Migration should provide a prompt and a start-import flow so users can bring useful context from ChatGPT, Claude, Gemini, or other exports.',
            },
            {
              meta: 'Projects',
              title: 'Project-scoped memory',
              body: 'A project can remember facts relevant to that project without polluting unrelated chats.',
              href: '/features/projects',
            },
            {
              meta: 'Privacy',
              title: 'Temporary chats must opt out',
              body: 'Incognito or temporary chats should never become memory and should not train future personalization.',
            },
          ]}
        />

        <LedgerSection
          eyebrow="Trust language"
          title="What to promise and what to avoid."
          rows={[
            {
              k: 'Say',
              v: 'Memory is user-controlled, inspectable, editable, deletable, and separately configurable for chats and projects.',
            },
            {
              k: 'Say',
              v: 'Local, BYOK, and Cloud memory boundaries are visible and governed by mode.',
            },
            {
              k: 'Avoid',
              v: 'Do not imply AGI can import memories directly from another provider account without that provider export or user authorization path.',
            },
            {
              k: 'Avoid',
              v: 'Do not claim all memory is private without specifying whether the active mode is Local, BYOK, or Cloud.',
            },
          ]}
        />

        <LaunchCta
          title="Memory is one of the highest-trust pages on the site."
          body="This page gives users confidence that AGI can be personal without becoming opaque."
          primary={{ href: '/download', label: LAUNCH.ctaLabel }}
          secondary={{ href: '/trust', label: 'Trust center' }}
        />
        <MarketingFooter />
      </main>
    </div>
  );
}
