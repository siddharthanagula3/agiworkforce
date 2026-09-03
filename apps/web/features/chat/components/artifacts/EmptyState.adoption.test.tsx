import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ArtifactsPanel } from './ArtifactsPanel';
import { ResearchPanel } from '../research/ResearchPanel';
import { useArtifactsStore } from '../../stores/artifacts-store';
import { useResearchPanelStore } from '../../stores/research-panel-store';
import { useChatStore } from '@shared/stores/web-chat-store';

vi.mock('./ArtifactPreview', () => ({ ArtifactPreview: () => null }));

const CONVERSATION_ID = 'conv-empty-state';

/**
 * The shared primitive renders `role="status"` and the accessible icon recipe
 * (`bg-primary/10` + `text-primary`); the local copies it replaced used
 * `bg-muted/50` + `text-muted-foreground`, which is the low-contrast pairing
 * the primitive exists to prevent.
 */
function assertSharedEmptyState(title: string) {
  const region = screen.getByRole('status', { name: title });
  expect(region.querySelector('.bg-primary\\/10')).not.toBeNull();
  expect(region.querySelector('.bg-muted\\/50')).toBeNull();
  expect(region.querySelector('.text-muted-foreground\\/60')).toBeNull();
}

beforeEach(() => {
  useArtifactsStore.getState().reset();
  useChatStore.setState({ activeConversationId: CONVERSATION_ID });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('panel empty states use the shared primitive', () => {
  it('artifacts panel', () => {
    useArtifactsStore.getState().setPanelOpen(true);
    render(<ArtifactsPanel />);
    assertSharedEmptyState('No artifacts yet');
  });

  it('research panel sources tab', () => {
    useResearchPanelStore.getState().openPanel(CONVERSATION_ID, 'msg-1', [], []);
    render(<ResearchPanel />);
    assertSharedEmptyState('No sources yet');
  });

  it('research panel report tab', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ reports: [] }) })),
    );
    useResearchPanelStore.getState().openPanel(CONVERSATION_ID, 'msg-1', [], []);
    render(<ResearchPanel />);
    screen.getByRole('tab', { name: 'Report' }).click();

    await screen.findByRole('status', { name: 'No saved report yet' });
    assertSharedEmptyState('No saved report yet');
  });
});
