import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatInput, type ChatInputProps } from '../ChatInput';
import { useChatStore } from '../../stores/chatStore';
import { useMediaModeStore } from '../../stores/mediaModeStore';
import { useModelStore } from '../../stores/modelStore';

function renderComposer(overrides: Partial<ChatInputProps> = {}) {
  render(
    <ChatInput
      onSend={vi.fn()}
      onStop={vi.fn()}
      onModelSelectorClick={vi.fn()}
      hasMessages={false}
      conversationId="conv-1"
      {...overrides}
    />,
  );
}

function openAttachmentMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'Add attachment' }));
}

describe('ChatInput image/video generation mode', () => {
  beforeEach(() => {
    useChatStore.setState({
      activeConversationId: 'conv-1',
      draftContent: '',
      draftsByConversation: {},
      isStreaming: false,
    });
    useModelStore.setState({ selectedModelId: 'auto-economy' });
    useMediaModeStore.setState({ mediaMode: 'text' });
  });

  afterEach(() => {
    cleanup();
  });

  it('offers a generation entry for every kind the runtime declares', () => {
    renderComposer({ supportsImageGeneration: true, supportsVideoGeneration: true });
    openAttachmentMenu();

    expect(screen.getByText('Generate image')).toBeTruthy();
    expect(screen.getByText('Generate video')).toBeTruthy();
  });

  it('offers no entry for a kind the runtime cannot generate', () => {
    renderComposer({ supportsImageGeneration: true, supportsVideoGeneration: false });
    openAttachmentMenu();

    expect(screen.getByText('Generate image')).toBeTruthy();
    expect(screen.queryByText('Generate video')).toBeNull();
  });

  it('offers nothing at all when the runtime generates no media', () => {
    renderComposer({});
    openAttachmentMenu();

    expect(screen.queryByText('Generate image')).toBeNull();
    expect(screen.queryByText('Generate video')).toBeNull();
  });

  it('puts the composer into image mode, which is what the send reads', () => {
    renderComposer({ supportsImageGeneration: true });
    openAttachmentMenu();

    fireEvent.click(screen.getByText('Generate image'));

    expect(useMediaModeStore.getState().mediaMode).toBe('image');
  });

  it('shows the active mode as a dismissible chip so it is never silently on', () => {
    useMediaModeStore.setState({ mediaMode: 'image' });
    renderComposer({ supportsImageGeneration: true });

    const chip = screen.getByRole('button', { name: 'Leave image generation mode' });
    fireEvent.click(chip);

    expect(useMediaModeStore.getState().mediaMode).toBe('text');
  });

  it('drops a stale mode when the host stops declaring that capability', () => {
    useMediaModeStore.setState({ mediaMode: 'video' });
    renderComposer({ supportsImageGeneration: true, supportsVideoGeneration: false });

    expect(useMediaModeStore.getState().mediaMode).toBe('text');
  });
});
