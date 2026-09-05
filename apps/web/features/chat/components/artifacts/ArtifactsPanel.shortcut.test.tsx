import { describe, it, expect, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { _sharedArtifactStore } from '../../stores/artifacts-store';
import { useKeyboardShortcuts, KEYBOARD_SHORTCUT_DOCS } from '../../hooks/use-keyboard-shortcuts';

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

// Stands in for the single useKeyboardShortcuts call WebChatPage owns. The
// shortcut used to live inside ArtifactsToggleButton's own hook instance,
// which meant it stopped firing whenever that button was not on screen; it
// is now claimed once, at the page, alongside every other documented binding.
function PageLevelShortcuts() {
  useKeyboardShortcuts({
    onToggleArtifacts: () => _sharedArtifactStore.getState().togglePanel(),
  });
  return null;
}

describe('artifacts panel keyboard shortcut', () => {
  beforeEach(() => {
    _sharedArtifactStore.getState().setPanelOpen(false);
  });

  it('is documented so the shortcuts dialog lists it', () => {
    const doc = KEYBOARD_SHORTCUT_DOCS.find((d) => d.description === 'Toggle artifacts panel');

    expect(doc).toMatchObject({ key: 'A', shift: true, category: 'ui' });
    expect(doc?.ctrl || doc?.meta).toBe(true);
  });

  it('opens and closes the panel from the keyboard through the page-level binding', () => {
    render(<PageLevelShortcuts />);
    expect(_sharedArtifactStore.getState().panelOpen).toBe(false);

    pressToggleArtifacts();
    expect(_sharedArtifactStore.getState().panelOpen).toBe(true);

    pressToggleArtifacts();
    expect(_sharedArtifactStore.getState().panelOpen).toBe(false);
  });

  it('keeps working when the toggle button itself is not mounted', () => {
    render(<PageLevelShortcuts />);

    pressToggleArtifacts();

    expect(_sharedArtifactStore.getState().panelOpen).toBe(true);
  });

  it('stops toggling once the page-level binding unmounts', () => {
    const view = render(<PageLevelShortcuts />);
    view.unmount();

    pressToggleArtifacts();

    expect(_sharedArtifactStore.getState().panelOpen).toBe(false);
  });
});
