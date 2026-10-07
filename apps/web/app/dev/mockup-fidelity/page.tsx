import type { Metadata } from 'next';
import {
  ChromeAppPreview,
  DesktopAppPreview,
  EditorAppPreview,
  PhoneAppPreview,
  SidePanelPreview,
  TerminalAppPreview,
  WebAppPreview,
} from '@/features/marketing/components/app-preview/AppPreviews';
import {
  ApprovalScenePreview,
  ArtifactScenePreview,
  ComposerScenePreview,
  ConsoleScenePreview,
  MemoryScenePreview,
  ProjectScenePreview,
  ResearchScenePreview,
} from '@/features/marketing/components/app-preview/ScenePreviews';

export const metadata: Metadata = {
  title: 'Mockup fidelity',
  robots: { index: false, follow: false },
};

const PAGE = { minHeight: '100vh', padding: '3rem 1.5rem', display: 'grid', gap: '4rem' } as const;
const FRAME = {
  display: 'grid',
  gap: '1rem',
  width: '100%',
  maxWidth: '45rem',
  margin: '0 auto',
} as const;
const PHONE = { ...FRAME, maxWidth: '22.375rem' } as const;
const LABEL = {
  font: '600 1.0625rem/1.4 var(--font-geist-sans), sans-serif',
  margin: 0,
  color: 'var(--agi-ink)',
} as const;

const PREVIEWS = [
  ['AGI Web', <WebAppPreview key="web" />],
  ['AGI Desktop', <DesktopAppPreview key="desktop" />],
  ['AGI Desktop with the Local and Cloud switch', <DesktopAppPreview key="switch" modeSwitch />],
  ['AGI CLI', <TerminalAppPreview key="cli" />],
  ['AGI in Chrome', <ChromeAppPreview key="chrome" />],
  ['Chrome side panel alone', <SidePanelPreview key="panel" />],
  ['AGI in VS Code', <EditorAppPreview key="editor" />],
  ['AGI Mobile', <PhoneAppPreview key="phone" />],
  ['AGI Mobile with the side panel open', <PhoneAppPreview key="drawer" drawerOpen />],
  ['Scene: artifact beside a chat', <ArtifactScenePreview key="artifact" />],
  ['Scene: project page with its settings', <ProjectScenePreview key="project" />],
  ['Scene: memory settings', <MemoryScenePreview key="memory" />],
  ['Scene: memory settings, saved facts', <MemoryScenePreview key="facts" view="facts" />],
  ['Scene: research plan awaiting start', <ResearchScenePreview key="research" />],
  ['Scene: tool approval in chat', <ApprovalScenePreview key="approval" />],
  ['Scene: workspace console, members', <ConsoleScenePreview key="members" view="members" />],
  ['Scene: workspace console, policy', <ConsoleScenePreview key="policy" view="policy" />],
  ['Scene: workspace console, audit', <ConsoleScenePreview key="audit" view="audit" />],
  ['Scene: composer with the slash menu', <ComposerScenePreview key="commands" />],
  [
    'Scene: composer with attachments',
    <ComposerScenePreview key="attachments" view="attachments" />,
  ],
] as const;

export default function MockupFidelityRoute() {
  return (
    <div data-design="agi" style={PAGE}>
      {PREVIEWS.map(([name, preview]) => (
        <section key={name} style={FRAME} data-preview={name}>
          <p style={LABEL}>{name}</p>
          {preview}
        </section>
      ))}
      {PREVIEWS.map(([name, preview]) => (
        <section key={name} style={PHONE} data-preview={`${name} phone`}>
          <p style={LABEL}>{name}, on a 390px phone</p>
          {preview}
        </section>
      ))}
    </div>
  );
}
