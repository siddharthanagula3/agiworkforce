import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ArtifactsPanel } from './ArtifactsPanel';
import { ARTIFACT_PANEL_OVERLAY_QUERY, useArtifactsStore } from '../../stores/artifacts-store';
import { useStreamingArtifactStore } from '../../stores/streaming-artifact-store';
import { useChatStore } from '@shared/stores/web-chat-store';

type ArtifactPreviewModule = typeof import('./ArtifactPreview');

vi.mock('./ArtifactPreview', async (importOriginal) => ({
  ...(await importOriginal<ArtifactPreviewModule>()),
  ArtifactPreview: ({ onRequestEdits }: { onRequestEdits?: (prompt: string) => boolean }) => (
    <div data-testid="artifact-preview">
      {onRequestEdits ? (
        <button type="button" onClick={() => onRequestEdits('change it')}>
          send edit request
        </button>
      ) : null}
    </div>
  ),
}));

const CONVERSATION_ID = 'conv-request-edits';
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

beforeEach(() => {
  useArtifactsStore.getState().reset();
  useStreamingArtifactStore.getState().clearStreamingArtifact();
  useChatStore.setState({ activeConversationId: CONVERSATION_ID });
  useArtifactsStore
    .getState()
    .addArtifactForMessage(
      'msg-a',
      { id: 'artifact-a', type: 'html', language: 'html', title: 'Alpha', content: '<p>a</p>' },
      CONVERSATION_ID,
    );
  useArtifactsStore.getState().setPanelOpen(true);
});

afterEach(() => {
  cleanup();
  window.matchMedia = originalMatchMedia;
});

describe('ArtifactsPanel request edits', () => {
  it('offers the request only when the page can send a chat turn', () => {
    stubViewport(false);
    render(<ArtifactsPanel />);

    expect(screen.queryByRole('button', { name: 'send edit request' })).toBeNull();
  });

  it('hands the prompt to the chat and keeps the docked panel open', () => {
    stubViewport(false);
    const onRequestEdits = vi.fn(() => true);
    render(<ArtifactsPanel onRequestEdits={onRequestEdits} />);

    fireEvent.click(screen.getByRole('button', { name: 'send edit request' }));

    expect(onRequestEdits).toHaveBeenCalledWith('change it');
    expect(useArtifactsStore.getState().panelOpen).toBe(true);
  });

  it('closes the full-screen sheet on a phone so the reply is visible', () => {
    stubViewport(true);
    render(<ArtifactsPanel onRequestEdits={() => true} />);

    fireEvent.click(screen.getByRole('button', { name: 'send edit request' }));

    expect(useArtifactsStore.getState().panelOpen).toBe(false);
  });

  it('keeps the sheet open when the chat refused the turn', () => {
    stubViewport(true);
    render(<ArtifactsPanel onRequestEdits={() => false} />);

    fireEvent.click(screen.getByRole('button', { name: 'send edit request' }));

    expect(useArtifactsStore.getState().panelOpen).toBe(true);
  });
});
