import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { ArtifactsPanel } from './ArtifactsPanel';
import { ARTIFACT_PANEL_OVERLAY_QUERY, useArtifactsStore } from '../../stores/artifacts-store';
import { useStreamingArtifactStore } from '../../stores/streaming-artifact-store';
import { useChatStore } from '@shared/stores/web-chat-store';

vi.mock('./ArtifactPreview', () => ({
  ArtifactPreview: ({ artifact }: { artifact: { title?: string } }) => (
    <div data-testid="artifact-preview">{artifact.title}</div>
  ),
}));

const CONVERSATION_ID = 'conv-panel-layout';
const originalMatchMedia = window.matchMedia;

function stubViewport(overlay: boolean): void {
  window.matchMedia = ((query: string) =>
    ({
      matches: query === ARTIFACT_PANEL_OVERLAY_QUERY ? overlay : !overlay,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

function seedArtifacts(): void {
  const store = useArtifactsStore.getState();
  store.addArtifactForMessage(
    'msg-a',
    { id: 'artifact-a', type: 'html', language: 'html', title: 'Alpha', content: '<p>a</p>' },
    CONVERSATION_ID,
  );
  store.addArtifactForMessage(
    'msg-b',
    { id: 'artifact-b', type: 'html', language: 'html', title: 'Beta', content: '<p>b</p>' },
    CONVERSATION_ID,
  );
}

beforeEach(() => {
  useArtifactsStore.getState().reset();
  useStreamingArtifactStore.getState().clearStreamingArtifact();
  useChatStore.setState({ activeConversationId: CONVERSATION_ID });
  seedArtifacts();
});

afterEach(() => {
  cleanup();
  window.matchMedia = originalMatchMedia;
});

describe('ArtifactsPanel layout', () => {
  it('becomes a modal full-screen sheet on a phone viewport', () => {
    stubViewport(true);
    useArtifactsStore.getState().setPanelOpen(true);
    render(<ArtifactsPanel />);

    const panel = screen.getByRole('dialog', { name: 'Artifacts' });
    expect(panel).toHaveAttribute('aria-modal', 'true');
    expect(panel.className).toContain('fixed');
    expect(panel.className).toContain('inset-y-0');
    expect(panel.className).toContain('w-full');
    // The drag handle resizes a docked pane; there is no pane to resize here.
    expect(screen.queryByRole('separator', { name: /resize artifacts panel/i })).toBeNull();
  });

  it('docks beside the transcript on a wide viewport, with a resize handle', () => {
    stubViewport(false);
    useArtifactsStore.getState().setPanelOpen(true);
    render(<ArtifactsPanel />);

    expect(screen.queryByRole('dialog', { name: 'Artifacts' })).toBeNull();
    const handle = screen.getByRole('separator', { name: /resize artifacts panel/i });
    expect(Number(handle.getAttribute('aria-valuemin'))).toBe(280);
    expect(Number(handle.getAttribute('aria-valuemax'))).toBe(900);
    const width = Number(handle.getAttribute('aria-valuenow'));
    expect(width).toBeGreaterThanOrEqual(280);
    expect(width).toBeLessThanOrEqual(900);
  });

  it('reopens on the artifact that was selected when it was closed', () => {
    stubViewport(false);
    const store = useArtifactsStore.getState();
    store.setPanelOpen(true);
    store.selectArtifact('artifact-b');
    const view = render(<ArtifactsPanel />);
    expect(screen.getByTestId('artifact-preview').textContent).toContain('Beta');

    act(() => {
      useArtifactsStore.getState().setPanelOpen(false);
    });
    expect(screen.queryByTestId('artifact-preview')).toBeNull();

    act(() => {
      useArtifactsStore.getState().setPanelOpen(true);
    });
    expect(useArtifactsStore.getState().selectedArtifactId).toBe('artifact-b');
    expect(view.getByTestId('artifact-preview').textContent).toContain('Beta');
  });
});
