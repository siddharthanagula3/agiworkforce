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
  title: 'AGI Artifacts - Canvas-style apps, documents, code, and reports',
  description:
    'Create, preview, iterate, version, download, and share generated apps, dashboards, documents, code, and reports in AGI artifacts.',
  alternates: { canonical: 'https://agiworkforce.com/features/artifacts' },
};

export default function ArtifactsFeaturePage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <CampaignHero
          eyebrow={`${LAUNCH.publicLabel} · Artifacts`}
          title="Generated work should live beside the chat, not inside it."
          lede="Artifacts are the AGI answer to Claude Artifacts and ChatGPT Canvas: a dedicated surface for apps, documents, reports, charts, code, spreadsheets, and prototypes that users can inspect, revise, download, and share."
          primaryCta={{ href: '/download', label: LAUNCH.ctaLabel }}
          secondaryCta={{ href: '/features/deep-research', label: 'Research artifacts' }}
          chips={['Preview', 'Version', 'Download', 'Publish', 'Auto-fix']}
          panelTitle="Artifact lifecycle"
          panelRows={[
            {
              k: 'Create',
              v: 'Model emits standalone content or user starts from a guided artifact flow',
            },
            { k: 'Preview', v: 'Render safely in a sandboxed side panel' },
            { k: 'Iterate', v: 'Update the current artifact instead of restarting from scratch' },
            { k: 'Share', v: 'Download, publish, or share inside a workspace with permissions' },
          ]}
        />

        <FeatureGrid
          eyebrow="Artifact types"
          title="Make every substantial output portable."
          items={[
            {
              meta: 'Apps',
              title: 'HTML and React previews',
              body: 'Render prototypes, dashboards, calculators, games, and UI experiments in a sandbox with visible errors and revisions.',
            },
            {
              meta: 'Docs',
              title: 'Markdown, PDF, DOCX, and reports',
              body: 'Turn research and strategy work into named documents with versions, exports, and workspace sharing.',
            },
            {
              meta: 'Data',
              title: 'Tables, charts, and spreadsheets',
              body: 'Show analysis outputs as inspectable artifacts instead of screenshots or plain message text.',
            },
            {
              meta: 'Code',
              title: 'Generated files and scripts',
              body: 'Keep substantial code outputs in a file-like surface with syntax highlighting, copy, download, and iteration controls.',
            },
            {
              meta: 'Gallery',
              title: 'A catalog of created work',
              body: 'Users need an artifacts home for search, filtering, inspiration, cleanup, and re-opening prior work.',
            },
            {
              meta: 'Safety',
              title: 'Sandbox and domain controls',
              body: 'Rendered artifacts need isolated execution, explicit network egress policy, and clear publish warnings.',
            },
          ]}
        />

        <LedgerSection
          eyebrow="Parity checklist"
          title="What users will expect from artifacts."
          rows={[
            { k: 'Panel', v: 'Resizable right-side preview beside the active chat.' },
            {
              k: 'Toolbar',
              v: 'Title, copy, download, open, iterate, version, publish, and close controls.',
            },
            {
              k: 'Versions',
              v: 'Keep prior versions and allow users to switch without losing work.',
            },
            {
              k: 'Errors',
              v: 'Runtime errors should surface in the UI and feed back into an auto-fix loop.',
            },
            { k: 'Gallery', v: 'All artifacts should be searchable from a dedicated catalog.' },
          ]}
        />

        <LaunchCta
          title="Artifacts are a launch-page must, not a later nice-to-have."
          body="Claude and ChatGPT both train users to expect a canvas for substantial work. AGI should advertise it as a first-class capability across models."
          primary={{ href: '/download', label: LAUNCH.ctaLabel }}
          secondary={{ href: '/compare/claude', label: 'Compare with Claude' }}
        />
        <MarketingFooter />
      </main>
    </div>
  );
}
