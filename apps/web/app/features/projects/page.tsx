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
  title: 'AGI Projects - Chats, files, instructions, memory, and artifacts',
  description:
    'AGI Projects keep chats, files, instructions, memories, artifacts, and connected tools organized under one long-running objective.',
  alternates: { canonical: 'https://agiworkforce.com/features/projects' },
};

export default function ProjectsFeaturePage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <CampaignHero
          eyebrow={`${LAUNCH.publicLabel} · Projects`}
          title="Long-running work needs a home, not another loose chat."
          lede="Projects are the workspace layer for recurring work: chats, files, instructions, memories, artifacts, connectors, and model preferences grouped under one objective."
          primaryCta={{ href: '/download', label: LAUNCH.ctaLabel }}
          secondaryCta={{ href: '/features/memory', label: 'Memory controls' }}
          chips={['Files', 'Instructions', 'Chats', 'Artifacts', 'Memory']}
          panelTitle="Project context"
          panelRows={[
            { k: 'Files', v: 'Uploaded docs, code, spreadsheets, PDFs, and images' },
            { k: 'Instructions', v: 'Project-specific system context and preferences' },
            { k: 'Memory', v: 'Durable facts users can inspect, edit, delete, and import' },
            { k: 'Tools', v: 'Enabled connectors and skills scoped to the workstream' },
          ]}
        />

        <FeatureGrid
          eyebrow="Project anatomy"
          title="Make repeated work feel continuous."
          items={[
            {
              meta: 'Context',
              title: 'Files and knowledge',
              body: 'Attach reference material once and retrieve relevant chunks when the active model needs them.',
            },
            {
              meta: 'Instructions',
              title: 'Standing behavior',
              body: 'Store tone, format, constraints, project goals, and model preferences without re-prompting every chat.',
            },
            {
              meta: 'Chats',
              title: 'Multiple threads, one objective',
              body: 'Let users run parallel conversations under the same project while preserving project-level context.',
            },
            {
              meta: 'Artifacts',
              title: 'Outputs stay attached to the project',
              body: 'Reports, dashboards, docs, and prototypes should be discoverable from the project after the chat is gone.',
              href: '/features/artifacts',
            },
            {
              meta: 'Memory',
              title: 'Project memory is not magic',
              body: 'Show what AGI remembers, where it came from, and how to remove or import it.',
              href: '/features/memory',
            },
            {
              meta: 'Sharing',
              title: 'Team context hub',
              body: 'Teams need shared projects with role-aware access and clear restrictions for shared chats and connected data.',
              href: '/teams',
            },
          ]}
        />

        <LedgerSection
          eyebrow="Implementation bar"
          title="What project pages should promise."
          rows={[
            { k: 'Create', v: 'Name, description, icon, and optional starter instructions.' },
            {
              k: 'Upload',
              v: 'Files process into searchable project knowledge, with status and errors visible.',
            },
            {
              k: 'Retrieve',
              v: 'AGI searches project knowledge rather than blindly loading everything.',
            },
            {
              k: 'Move',
              v: 'Eligible chats can move into projects and inherit context from that point forward.',
            },
            {
              k: 'Share',
              v: 'Team projects need access rules, shared files, and clear connector restrictions.',
            },
          ]}
        />

        <LaunchCta
          title="Projects are where AGI becomes a work OS."
          body="Use this page to explain why users should create durable workspaces instead of treating AGI as a disposable chat box."
          primary={{ href: '/download', label: LAUNCH.ctaLabel }}
          secondary={{ href: '/business', label: 'Business workspace' }}
        />
        <MarketingFooter />
      </main>
    </div>
  );
}
