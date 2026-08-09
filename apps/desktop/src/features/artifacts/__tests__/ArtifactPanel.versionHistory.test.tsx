/**
 * Regression test for the "View full diff history" trigger: it must mount
 * the real ArtifactVersionHistory (side-by-side DiffPanel) component with
 * the active artifact's real id/version, not the removed VersionHistoryDialog
 * stand-in.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// vi.mock factories run before this file's own top-level statements
// (Vitest hoists them ahead of imports), so fixtures referenced inside must
// be declared inline rather than as outer consts — matching the pattern
// ArtifactSidebarParity.test.tsx already uses.
vi.mock('@/stores/artifactStore', () => {
  const rendered = {
    id: 'art-1',
    title: 'Flowchart',
    artifact_type: 'diagram',
    rendered_content: {
      type: 'Diagram',
      data: { source: 'graph TD; A-->B', diagram_type: 'flowchart', theme: 'dark' },
    },
    version_info: {
      current: 3,
      total: 3,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
    },
    status: 'complete',
    available_actions: [],
  };
  const summary = {
    id: 'art-1',
    title: 'Flowchart',
    artifact_type: 'diagram',
    status: 'complete',
    current_version: 3,
    version_count: 3,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    size_bytes: 42,
    tags: [],
    pinned: false,
  };
  const versions = [
    {
      version: 3,
      content: 'graph TD; A-->B',
      created_at: '2026-01-02T00:00:00.000Z',
      size_bytes: 42,
      content_hash: 'hash-3',
    },
    {
      version: 2,
      content: 'graph TD; A-->C',
      created_at: '2026-01-01T00:00:00.000Z',
      size_bytes: 40,
      content_hash: 'hash-2',
    },
  ];

  // Stable across renders (built once, outside the per-render selector call)
  // — a fresh vi.fn() per render would change identity on every call, which
  // retriggers the component's [..., getVersionHistory] effect forever.
  const state = {
    activeArtifactId: 'art-1',
    panelOpen: true,
    isStreaming: null,
    artifacts: new Map(),
    setActiveArtifact: vi.fn(),
    closePanel: vi.fn(),
    getArtifact: vi.fn().mockResolvedValue(null),
    getRenderedArtifact: vi.fn().mockResolvedValue(rendered),
    deleteArtifact: vi.fn(),
    archiveArtifact: vi.fn(),
    pinArtifact: vi.fn(),
    rollbackArtifact: vi.fn(),
    getArtifactsByConversation: vi.fn().mockResolvedValue([summary]),
    applyDiffToArtifact: vi.fn(),
    getVersionHistory: vi.fn().mockResolvedValue(versions),
  };

  return {
    useArtifactStore: (selector: (s: Record<string, unknown>) => unknown) => selector(state),
  };
});

vi.mock('@/lib/artifactUtils', () => ({
  ArtifactTypeIcon: () => <span data-testid="artifact-type-icon" />,
  getArtifactFileExtension: () => 'txt',
}));

vi.mock('@/lib/messageArtifactPanel', () => ({
  artifactToSummary: (a: unknown) => a,
}));

// NB: paths are relative to THIS file (in __tests__/), so they must climb up
// one level to reach the sibling modules ArtifactPanel.tsx imports.
vi.mock('../ArtifactRendererView', () => ({
  ArtifactRendererView: () => <div data-testid="artifact-renderer-view" />,
}));

vi.mock('../InlineArtifactEditor', () => ({
  InlineArtifactEditor: () => <div data-testid="inline-artifact-editor" />,
}));

vi.mock('../ShareArtifactDialog', () => ({
  ShareArtifactDialog: () => null,
}));

const mockArtifactVersionHistory = vi.fn((_props: Record<string, unknown>) => (
  <div data-testid="artifact-version-history" />
));
vi.mock('../ArtifactVersionHistory', () => ({
  ArtifactVersionHistory: (props: Record<string, unknown>) => mockArtifactVersionHistory(props),
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

describe('ArtifactPanel version history trigger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mounts ArtifactVersionHistory with the active artifact id/version on "View full diff history"', async () => {
    render(
      <Wrapper>
        <ArtifactPanel conversationId={1} />
      </Wrapper>,
    );

    // Wait for the rendered artifact to load and the viewer toolbar to appear.
    fireEvent.click(await screen.findByRole('button', { name: 'Version history' }));
    fireEvent.click(await screen.findByText('View full diff history'));

    await waitFor(() => {
      expect(mockArtifactVersionHistory).toHaveBeenCalled();
    });
    const lastCallProps = mockArtifactVersionHistory.mock.calls.at(-1)?.[0] as {
      artifactId: string;
      currentVersion: number;
    };
    expect(lastCallProps.artifactId).toBe('art-1');
    expect(lastCallProps.currentVersion).toBe(3);
  });
});
