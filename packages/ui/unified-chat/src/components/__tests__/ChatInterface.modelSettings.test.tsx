import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
      modelCatalogStatus: 'ready',
      modelCatalogError: null,
      recentModelIds: [],
      lastRoutingDecision: null,
    });
  });

  afterEach(() => cleanup());

  it('preserves an omitted settings callback through the real composer and selector', () => {
    renderInterface();

    fireEvent.click(screen.getByRole('button', { name: 'Select model' }));

    expect(screen.queryByRole('button', { name: 'Manage local models' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Set up a local model' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open Models & Keys' })).toBeNull();
  });

  it('keeps the Local/BYOK settings action operable when the host supplies it', () => {
    const onModelSelectorClick = vi.fn();
    renderInterface(onModelSelectorClick);

    fireEvent.click(screen.getByRole('button', { name: 'Select model' }));
    fireEvent.click(screen.getByRole('button', { name: 'Manage local models' }));

    expect(onModelSelectorClick).toHaveBeenCalledOnce();
  });

  it('offers local-model setup only until a reachable model becomes available', async () => {
    const onModelSelectorClick = vi.fn();
    useModelStore.setState({ models: [], selectedModelId: '' });
    renderInterface(onModelSelectorClick);

    fireEvent.click(screen.getByRole('button', { name: 'Select model' }));

    expect(screen.getByText('No local models detected')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Set up a local model' }));
    expect(onModelSelectorClick).toHaveBeenCalledOnce();

    act(() => {
      useModelStore.setState({
        models: [
          {
            id: 'fixture-discovered-local-model',
            name: 'Discovered Local Model',
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
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Select model' }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Set up a local model' })).toBeNull();
      expect(
        screen.getByRole('button', { name: /Discovered Local Model/i }).hasAttribute('disabled'),
      ).toBe(false);
    });
    fireEvent.click(screen.getByRole('button', { name: /Discovered Local Model/i }));
    expect(useModelStore.getState().selectedModelId).toBe('fixture-discovered-local-model');
    expect(onModelSelectorClick).toHaveBeenCalledOnce();
  });
});
