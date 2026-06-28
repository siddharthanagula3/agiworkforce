import type { Metadata } from 'next';
import { Header } from '../../../components/layout/Header';
import { MarketingFooter } from '../../../components/marketing/MarketingFooter';
import { CapabilityGrid, FinalCta } from '../../../components/marketing/FlagshipSections';
import { FeatureGrid, LedgerSection } from '../../../components/marketing/LandingSections';

export const metadata: Metadata = {
  title: 'AGI Artifacts | Sandboxed Previews, Versions & Downloads',
  description:
    'Artifacts in the AGI workspace: HTML, React, SVG, diagrams, code, and documents rendered in a sandboxed preview beside the chat. Versioned, with source view, copy, and download.',
  alternates: { canonical: 'https://agiworkforce.com/features/artifacts' },
};

export default function ArtifactsFeaturePage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-page-hero">
          <p className="agi-section-eyebrow">Features · Artifacts</p>
          <h1 className="agi-page-h1">Work you can keep.</h1>
          <p className="agi-page-lede">
            When a reply turns into a document, a prototype, or a diagram, AGI lifts it out of the
            message stream and into an artifact. It sits beside the chat and you can preview,
            revise, version, and download it.
          </p>
        </section>

        <FeatureGrid
          eyebrow="Artifact types"
          title="Six kinds of output, one panel."
          items={[
            {
              meta: 'HTML',
              title: 'Pages that actually run',
              body: 'HTML prototypes render live in a sandboxed frame. Scripts included, isolated from the rest of the app.',
            },
            {
              meta: 'React',
              title: 'Components in isolation',
              body: 'React previews let UI ideas be inspected and iterated on instead of imagined from code.',
            },
            {
              meta: 'SVG',
              title: 'Vector graphics',
              body: 'SVG output is sanitized and rendered, ready to copy out or download.',
            },
            {
              meta: 'Diagrams',
              title: 'Mermaid, drawn',
              body: 'Diagram definitions become rendered flowcharts and graphs instead of staying code blocks.',
            },
            {
              meta: 'Code',
              title: 'Files, not fragments',
              body: 'Substantial code lands in a file-like view with source, copy, and download controls.',
            },
            {
              meta: 'Documents',
              title: 'Named, durable writing',
              body: 'Written work becomes a titled document you can download as Markdown.',
            },
          ]}
        />

        <LedgerSection
          eyebrow="Lifecycle"
          title="From reply to artifact."
          rows={[
            {
              k: 'Detect',
              v: 'Substantial outputs are recognized in the reply and offered as artifacts automatically.',
            },
            {
              k: 'Preview',
              v: 'Rendering runs in an isolated sandbox. A separate origin when configured, a locked-down frame otherwise.',
            },
            {
              k: 'Inspect',
              v: 'Preview and source sit on tabs, so what runs is also what you can read.',
            },
            {
              k: 'Iterate',
              v: 'Follow-up prompts revise the artifact, and each pass is kept as a version you can switch back to.',
            },
            {
              k: 'Export',
              v: 'Copy the contents, download one artifact, or download the whole panel as a zip.',
            },
            {
              k: 'Publish',
              v: 'Managed publishing is rolling out as sharing controls are proven.',
            },
          ]}
        />

        <CapabilityGrid
          eyebrow="Around artifacts"
          title="Where your work travels."
          items={[
            {
              meta: 'Chat',
              title: 'AI Chat',
              body: 'Artifacts open beside the conversation that produced them.',
              href: '/features/ai-chat',
            },
            {
              meta: 'Projects',
              title: 'Projects',
              body: 'Group chats, files, instructions, memory, and sources by topic.',
              href: '/features/projects',
            },
            {
              meta: 'Desktop',
              title: 'AGI Desktop',
              body: 'The native app pairs chat with an artifacts workbench for local work.',
              href: '/desktop',
            },
          ]}
        />

        <FinalCta
          eyebrow="Start now"
          title="Make something you can keep."
          body="Try AGI Web in the browser, or install the apps for Local and BYOK work."
          ctas={[
            { href: '/login?redirectTo=%2Fchat', label: 'Try AGI Web' },
            { href: '/download', label: 'Download AGI' },
          ]}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
