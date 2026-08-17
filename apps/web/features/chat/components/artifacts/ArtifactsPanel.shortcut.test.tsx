import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ArtifactsToggleButton } from './ArtifactsPanel';
import { useArtifactsStore } from '../../stores/artifacts-store';
import { useChatStore } from '@shared/stores/web-chat-store';
import { KEYBOARD_SHORTCUT_DOCS } from '../../hooks/use-keyboard-shortcuts';

vi.mock('./ArtifactPreview', () => ({
  ArtifactPreview: () => null,
}));

const CONVERSATION_ID = 'conv-artifacts-shortcut';

function pressToggleArtifacts() {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'A',
        metaKey: true,
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

describe('artifacts panel keyboard shortcut', () => {
  beforeEach(() => {
    useArtifactsStore.getState().reset();
    useChatStore.setState({ activeConversationId: CONVERSATION_ID });
  });

  it('is documented so the shortcuts dialog lists it', () => {
    const doc = KEYBOARD_SHORTCUT_DOCS.find((d) => d.description === 'Toggle artifacts panel');

    expect(doc).toMatchObject({ key: 'A', shift: true, category: 'ui' });
    expect(doc?.ctrl || doc?.meta).toBe(true);
  });

  it('opens and closes the panel from the keyboard while the toggle is mounted', () => {
    render(<ArtifactsToggleButton />);
    expect(useArtifactsStore.getState().panelOpen).toBe(false);

    pressToggleArtifacts();
    expect(useArtifactsStore.getState().panelOpen).toBe(true);
    expect(screen.getByRole('button', { name: 'Close artifacts panel' })).toBeInTheDocument();

    pressToggleArtifacts();
    expect(useArtifactsStore.getState().panelOpen).toBe(false);
  });

  it('stops toggling once the toggle unmounts', () => {
    const view = render(<ArtifactsToggleButton />);
    view.unmount();

    pressToggleArtifacts();

    expect(useArtifactsStore.getState().panelOpen).toBe(false);
  });
});
