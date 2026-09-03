import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatInput } from '../ChatInput';
import { useChatStore } from '../../stores/chatStore';
import { useModelStore } from '../../stores/modelStore';
import { useAgentControlStore } from '../../stores/agentControlStore';
import { createChatModelInfo } from '../../lib/modelInfo';
import { requireCatalogModel } from '../../test/modelCatalogFixtures';

const metadata = requireCatalogModel(
  (model) =>
    model.reasoning?.canDisableThinking === true && model.reasoning.defaultEffort === 'high',
  'a switchable reasoning model whose default effort is high',
);
const model = createChatModelInfo({
  id: metadata.id,
  name: 'stale test host label',
  provider: metadata.provider,
  isLocal: false,
  isByok: true,
});

const CONVERSATION = 'conv-effort';

function effortFor() {
  return useAgentControlStore.getState().resolve(CONVERSATION, null).effort;
}

describe('composer model picker · reasoning effort', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem('app-mode-store', JSON.stringify({ state: { mode: 'local' } }));
    useAgentControlStore.setState({ byConversation: {}, byProject: {} } as never);
    useChatStore.setState({
      activeConversationId: CONVERSATION,
      draftContent: '',
      draftsByConversation: {},
      isStreaming: false,
      conversations: [
        {
          id: CONVERSATION,
          title: 'Effort',
          createdAt: '2026-08-21T00:00:00.000Z',
          updatedAt: '2026-08-21T00:00:00.000Z',
          pinned: false,
          executionMode: 'byok',
          model: model.id,
        },
      ],
    } as never);
    useModelStore.setState({
      models: [model],
      selectedModelId: model.id,
      modelCatalogStatus: 'ready',
      modelCatalogError: null,
      recentModelIds: [],
      lastRoutingDecision: null,
    } as never);
  });

  afterEach(() => cleanup());

  it('offers the thinking toggle the picker builds, which the composer never wired', () => {
    render(
      <ChatInput
        onSend={vi.fn()}
        onStop={vi.fn()}
        onModelSelectorClick={vi.fn()}
        hasMessages={false}
        conversationId={CONVERSATION}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Select model' }));
    expect(screen.getByRole('button', { name: /thinking mode/i })).toBeTruthy();
  });

  it('turns thinking off and back on through the store the effort chip reads', () => {
    render(
      <ChatInput
        onSend={vi.fn()}
        onStop={vi.fn()}
        onModelSelectorClick={vi.fn()}
        hasMessages={false}
        conversationId={CONVERSATION}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Select model' }));

    // The store defaults to medium, so a reasoning model starts switched on.
    expect(effortFor()).toBe('medium');

    fireEvent.click(screen.getByRole('button', { name: 'Disable thinking mode' }));
    expect(effortFor()).toBe('none');

    fireEvent.click(screen.getByRole('button', { name: 'Enable thinking mode' }));
    expect(effortFor()).toBe('high');
  });
});
