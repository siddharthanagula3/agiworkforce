import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/stores/artifactStore', () => ({
  useArtifactStore: (selector: (s: Record<string, unknown>) => unknown) => {
    const state = {
      activeArtifactId: null,
      panelOpen: true,
      isStreaming: null,
      panelWidth: 480,
      artifacts: new Map(),
      summaries: [],
      setActiveArtifact: vi.fn(),
      closePanel: vi.fn(),
      openPanel: vi.fn(),
      getArtifact: vi.fn().mockResolvedValue(null),
      getRenderedArtifact: vi.fn().mockResolvedValue(null),
      deleteArtifact: vi.fn(),
      archiveArtifact: vi.fn(),
      pinArtifact: vi.fn(),
      rollbackArtifact: vi.fn(),
      getArtifactsByConversation: vi.fn().mockResolvedValue([]),
      applyDiffToArtifact: vi.fn(),
      getVersionHistory: vi.fn().mockResolvedValue([]),
      updateArtifact: vi.fn(),
      setPanelWidth: vi.fn(),
      togglePanel: vi.fn(),
    };
    return selector(state);
  },
}));

vi.mock('@/lib/artifactUtils', () => ({
  ArtifactTypeIcon: ({ type }: { type: string }) => (
    <span data-testid="artifact-type-icon">{type}</span>
  ),
  getArtifactFileExtension: () => 'txt',
}));

vi.mock('@/lib/messageArtifactPanel', () => ({
  artifactToSummary: (a: unknown) => a,
}));

vi.mock('./ArtifactRendererView', () => ({
  ArtifactRendererView: () => <div data-testid="artifact-renderer-view" />,
}));

vi.mock('./InlineArtifactEditor', () => ({
  InlineArtifactEditor: () => <div data-testid="inline-artifact-editor" />,
}));

vi.mock('./ShareArtifactDialog', () => ({
  ShareArtifactDialog: () => null,
}));

vi.mock('./ArtifactVersionHistory', () => ({
  ArtifactVersionHistory: () => null,
}));

vi.mock('react-syntax-highlighter', () => ({
  Prism: ({ children }: { children: string }) => (
    <pre data-testid="syntax-highlighter">{children}</pre>
  ),
}));

vi.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({
  oneDark: {},
}));

import { TooltipProvider } from '@/ui/Tooltip';
import { ArtifactPanel } from '../ArtifactPanel';

function Wrapper({ children }: { children: React.ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}

describe('ArtifactPanel parity snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty-state panel (no artifacts) matching AGI sidebar shape', () => {
    const { container } = render(
      <Wrapper>
        <ArtifactPanel />
      </Wrapper>,
    );

    expect(screen.getByText('Artifacts')).toBeInTheDocument();
    expect(screen.getByText('No artifacts yet')).toBeInTheDocument();
    expect(container.firstElementChild).toMatchSnapshot();
  });

  it('renders panel header with Copy/Expand toolbar buttons', () => {
    const { container } = render(
      <Wrapper>
        <ArtifactPanel />
      </Wrapper>,
    );

    expect(screen.getByText('Artifacts')).toBeInTheDocument();
    expect(screen.getByText(/Artifacts will appear here/)).toBeInTheDocument();
    expect(container.querySelectorAll('button').length).toBeGreaterThanOrEqual(2);
    expect(container).toMatchSnapshot();
  });
});
