import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  MAX_SIDE_PANEL_WIDTH,
  MIN_SIDE_PANEL_WIDTH,
  useChatUIStore,
} from '@agiworkforce/unified-chat';
import { ArtifactsPanel } from '@/features/chat/components/artifacts/ArtifactsPanel';
import {
  ARTIFACT_PANEL_OVERLAY_QUERY,
  useArtifactsStore,
} from '@/features/chat/stores/artifacts-store';
import { useStreamingArtifactStore } from '@/features/chat/stores/streaming-artifact-store';
import { useChatStore } from '@shared/stores/web-chat-store';

vi.mock('@/features/chat/components/artifacts/ArtifactPreview', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/features/chat/components/artifacts/ArtifactPreview')
  >()),
  ArtifactPreview: ({ artifact }: { artifact: { title?: string } }) => (
    <div data-testid="artifact-preview">{artifact.title}</div>
  ),
}));

const CONVERSATION_ID = 'conv-secondary-panel';
const EMPTY_CONVERSATION_ID = 'conv-secondary-panel-empty';
const WINDOW_WIDTH = 1600;
const originalMatchMedia = window.matchMedia;
const originalInnerWidth = window.innerWidth;

function stubViewport(phone: boolean): void {
  window.matchMedia = ((query: string) =>
    ({
      matches: query === ARTIFACT_PANEL_OVERLAY_QUERY ? phone : !phone,
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
    {
      id: 'artifact-b',
      type: 'html',
      language: 'html',
      title: 'Beta, with a much longer title than the first',
      content: `<p>${'b'.repeat(4000)}</p>`,
    },
    CONVERSATION_ID,
  );
}

function openDocked() {
  stubViewport(false);
  useArtifactsStore.getState().setPanelOpen(true);
  render(<ArtifactsPanel />);
  return screen.getByRole('separator', { name: /resize artifacts panel/i });
}

const widthOf = (handle: HTMLElement) => Number(handle.getAttribute('aria-valuenow'));
const panelStyleWidth = () => screen.getByTestId('artifacts-panel').style.width;

function drag(handle: HTMLElement, clientX: number) {
  fireEvent.pointerDown(handle, { clientX: WINDOW_WIDTH - widthOf(handle) });
  act(() => {
    window.dispatchEvent(new MouseEvent('pointermove', { clientX }));
    window.dispatchEvent(new MouseEvent('pointerup', { clientX }));
  });
}

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: WINDOW_WIDTH });
  useArtifactsStore.getState().reset();
  useStreamingArtifactStore.getState().clearStreamingArtifact();
  useChatUIStore.getState().setArtifactPanelWidth(400);
  useChatStore.setState({ activeConversationId: CONVERSATION_ID });
  seedArtifacts();
});

afterEach(() => {
  cleanup();
  window.matchMedia = originalMatchMedia;
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth });
});

describe('the secondary panel beside a conversation', () => {
  it('resizes from the keyboard in both directions', () => {
    const handle = openDocked();
    handle.focus();
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(widthOf(handle)).toBe(424);
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(widthOf(handle)).toBe(376);
    expect(panelStyleWidth()).toBe('376px');
  });

  it('follows the pointer while its divider is dragged, and stops when it is let go', () => {
    const handle = openDocked();
    drag(handle, WINDOW_WIDTH - 620);
    expect(widthOf(handle)).toBe(620);
    expect(panelStyleWidth()).toBe('620px');
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: WINDOW_WIDTH - 300 }));
    });
    expect(widthOf(handle)).toBe(620);
    expect(document.body.style.getPropertyValue('user-select')).toBe('');
  });

  it('holds its minimum and maximum width however far it is dragged or keyed', () => {
    const handle = openDocked();
    drag(handle, WINDOW_WIDTH - 10);
    expect(widthOf(handle)).toBe(MIN_SIDE_PANEL_WIDTH);
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(widthOf(handle)).toBe(MIN_SIDE_PANEL_WIDTH);

    drag(handle, 0);
    expect(widthOf(handle)).toBe(MAX_SIDE_PANEL_WIDTH);
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(widthOf(handle)).toBe(MAX_SIDE_PANEL_WIDTH);
    expect(panelStyleWidth()).toBe(`${MAX_SIDE_PANEL_WIDTH}px`);
  });

  it('keeps the width the user chose while its content changes', () => {
    useChatUIStore.getState().setArtifactPanelWidth(520);
    useArtifactsStore.getState().selectArtifact('artifact-a');
    openDocked();
    expect(panelStyleWidth()).toBe('520px');

    act(() => {
      useArtifactsStore.getState().selectArtifact('artifact-b');
    });
    expect(screen.getByTestId('artifact-preview').textContent).toContain('Beta');
    expect(panelStyleWidth()).toBe('520px');
  });

  it('closes from its own control', () => {
    useChatStore.setState({ activeConversationId: EMPTY_CONVERSATION_ID });
    openDocked();
    fireEvent.click(screen.getByRole('button', { name: 'Close artifacts panel' }));
    expect(useArtifactsStore.getState().panelOpen).toBe(false);
    expect(screen.queryByTestId('artifacts-panel')).toBeNull();
  });
});

describe('the secondary panel as a full-screen sheet on a phone', () => {
  it('is a named modal with a visible title', () => {
    stubViewport(true);
    useArtifactsStore.getState().setPanelOpen(true);
    render(<ArtifactsPanel />);
    const sheet = screen.getByRole('dialog', { name: 'Artifacts' });
    expect(sheet).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { name: 'Artifacts' })).toBeVisible();
  });

  it('closes on Escape and hands focus back to what opened it', () => {
    stubViewport(true);
    const opener = document.createElement('button');
    opener.textContent = 'Open artifacts';
    document.body.appendChild(opener);
    opener.focus();

    render(<ArtifactsPanel />);
    act(() => {
      useArtifactsStore.getState().setPanelOpen(true);
    });
    const sheet = screen.getByRole('dialog', { name: 'Artifacts' });
    expect(sheet.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(sheet, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Artifacts' })).toBeNull();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('closes from its own control when nothing is selected', () => {
    stubViewport(true);
    useChatStore.setState({ activeConversationId: EMPTY_CONVERSATION_ID });
    useArtifactsStore.getState().setPanelOpen(true);
    render(<ArtifactsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Close artifacts panel' }));
    expect(screen.queryByRole('dialog', { name: 'Artifacts' })).toBeNull();
  });
});
