import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatInterface } from '../ChatInterface';
import { useChatStore } from '../../stores/chatStore';
import { useModelStore } from '../../stores/modelStore';
import type { ChatRuntime } from '../../lib/runtime';

const runtime: ChatRuntime = {
  sendMessage: vi.fn(async () => undefined),
  stopGeneration: vi.fn(),
  createConversation: vi.fn(async () => 'conversation-1'),
  deleteConversation: vi.fn(async () => undefined),
  renameConversation: vi.fn(async () => undefined),
};

function renderInterface(onModelSelectorClick?: () => void) {
  return render(
    <ChatInterface
      runtime={runtime}
      sidebarSlot={null}
      enableShortcuts={false}
      enableSearchOverlay={false}
      onModelSelectorClick={onModelSelectorClick}
      allowModelFallbackModels={false}
    />,
  );
}

describe('ChatInterface model-settings capability', () => {
  beforeEach(() => {
    useChatStore.setState({
      activeConversationId: 'conversation-1',
      conversations: [
        {
          id: 'conversation-1',
          title: 'Local conversation',
          createdAt: '2026-08-11T00:00:00.000Z',
          updatedAt: '2026-08-11T00:00:00.000Z',
          pinned: false,
          executionMode: 'local_only',
        },
      ],
      messagesByConversation: { 'conversation-1': [] },
      isStreaming: false,
    });
    useModelStore.setState({
      models: [
        {
          id: 'fixture-local-model',
          name: 'Local Model Fixture',
          provider: 'ollama',
          tier: 'standard',
          supportsThinking: false,
          supportsVision: true,
          supportsTools: true,
          contextWindow: 128_000,
          isLocal: true,
          isByok: false,
        },
      ],
      selectedModelId: 'fixture-local-model',
      recentModelIds: [],
      lastRoutingDecision: null,
    });
  });

  afterEach(() => cleanup());

  it('preserves an omitted settings callback through the real composer and selector', () => {
    renderInterface();

    fireEvent.click(screen.getByRole('button', { name: 'Select model' }));

    expect(screen.queryByRole('button', { name: 'Manage API Keys' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open Models & Keys' })).toBeNull();
  });

  it('keeps the Local/BYOK settings action operable when the host supplies it', () => {
    const onModelSelectorClick = vi.fn();
    renderInterface(onModelSelectorClick);

    fireEvent.click(screen.getByRole('button', { name: 'Select model' }));
    fireEvent.click(screen.getByRole('button', { name: 'Manage API Keys' }));

    expect(onModelSelectorClick).toHaveBeenCalledOnce();
  });
});
