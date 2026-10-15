import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatInterface } from '../ChatInterface';
import { useChatStore } from '../../stores/chatStore';
import type { ChatHostBridge } from '../../lib/hostBridge';
import type { ChatRuntime } from '../../lib/runtime';

const runtime: ChatRuntime = {
  sendMessage: vi.fn(async () => undefined),
  stopGeneration: vi.fn(),
  createConversation: vi.fn(async () => 'conversation-1'),
  deleteConversation: vi.fn(async () => undefined),
  renameConversation: vi.fn(async () => undefined),
};

function bridge(overrides: Partial<ChatHostBridge> = {}): ChatHostBridge {
  return {
    getSnapshot: () => ({
      conversations: [{ id: 'conversation-1', title: 'Existing' }],
      activeConversationId: 'conversation-1',
    }),
    ...overrides,
  };
}

function renderInterface(hostBridge: ChatHostBridge | null) {
  return render(
    <ChatInterface
      runtime={runtime}
      hostBridge={hostBridge}
      sidebarSlot={null}
      enableShortcuts={false}
      enableSearchOverlay={false}
    />,
  );
}

describe('ChatInterface /clear', () => {
  beforeEach(() => {
    useChatStore.setState({
      activeConversationId: 'conversation-1',
      conversations: [
        {
          id: 'conversation-1',
          title: 'Existing',
          createdAt: '2026-08-11T00:00:00.000Z',
          updatedAt: '2026-08-11T00:00:00.000Z',
          pinned: false,
          executionMode: 'local_only',
        },
      ],
      messagesByConversation: { 'conversation-1': [] },
      isStreaming: false,
    });
  });

  afterEach(() => cleanup());

  it('starts a fresh conversation through the host and keeps the old one', () => {
    const createConversation = vi.fn(() => 'conversation-2');
    const selectConversation = vi.fn();
    renderInterface(bridge({ createConversation, selectConversation }));

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '/clear' } });
    useChatStore.setState({
      messagesByConversation: {
        'conversation-1': [
          { id: 'm1', role: 'user', content: 'hi', timestamp: '2026-08-11T00:00:00.000Z' },
        ],
      },
    });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(createConversation).toHaveBeenCalledWith('New chat');
    expect(selectConversation).toHaveBeenCalledWith('conversation-2');
    expect(useChatStore.getState().conversations.some((c) => c.id === 'conversation-1')).toBe(true);
  });

  it('keeps an empty active conversation instead of creating another', () => {
    const createConversation = vi.fn(() => 'conversation-2');
    const selectConversation = vi.fn();
    renderInterface(bridge({ createConversation, selectConversation }));

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '/clear' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(createConversation).not.toHaveBeenCalled();
    expect(selectConversation).not.toHaveBeenCalled();
    expect(useChatStore.getState().draftContent).toBe('');
  });

  it('does not offer /clear when the host cannot create conversations', () => {
    renderInterface(null);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '/cl' } });

    expect(screen.queryByText('/clear')).toBeNull();
  });

  it('does not offer /clear when the host cannot switch to the new conversation', () => {
    renderInterface(bridge({ createConversation: vi.fn(() => 'conversation-2') }));

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '/cl' } });

    expect(screen.queryByText('/clear')).toBeNull();
  });
});
