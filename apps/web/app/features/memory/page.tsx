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
          lede="AGI Memory is designed to remember useful context across chats and projects without becoming a hidden black box. Users get search, reference-chat controls, generated memory controls, import paths from provider exports, and a clear delete path."
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
          title="Explicit controls for remembered context."
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
              body: 'Migration starts from user-authorized exports so useful context can move from ChatGPT, Claude, Gemini, or other tools.',
            },
            {
              meta: 'Projects',
              title: 'Project-scoped memory',
              body: 'A project can remember facts relevant to that project without polluting unrelated chats.',
              href: '/features/projects',
            },
            {
              meta: 'Privacy',
              title: 'Temporary chats stay out',
              body: 'Incognito or temporary chats stay separate from memory and future personalization.',
            },
          ]}
        />

        <LedgerSection
          eyebrow="Trust language"
          title="Memory boundaries stay visible."
          rows={[
            {
              k: 'Control',
              v: 'Memory is user-controlled, inspectable, editable, deletable, and separately configurable for chats and projects.',
            },
            {
              k: 'Modes',
              v: 'Local, BYOK, and Cloud memory boundaries are visible and governed by mode.',
            },
            {
              k: 'Import',
              v: 'Provider migration uses export files or user-authorized provider paths, not hidden account scraping.',
            },
            {
              k: 'Privacy',
              v: 'Privacy language follows the active Local, BYOK, or Cloud mode instead of a single blanket claim.',
            },
          ]}
        />

        <LaunchCta
          title="Memory builds trust when it stays visible."
          body="Users can make AGI personal while still seeing what it remembers, where that memory came from, and how to remove it."
          primary={{ href: '/download', label: LAUNCH.ctaLabel }}
          secondary={{ href: '/trust', label: 'Trust center' }}
        />
        <MarketingFooter />
      </main>
    </div>
  );
}
