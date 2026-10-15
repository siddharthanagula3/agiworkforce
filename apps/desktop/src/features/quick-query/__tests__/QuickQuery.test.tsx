import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { createChatModelInfo, useChatModelStore } from '@agiworkforce/unified-chat';
import type { ChatExecutionMode } from '@agiworkforce/types';
import { QuickQuery } from '../index';
import { useChatStore } from '../../../stores/chat/chatStore';
import { TooltipProvider } from '@/ui/Tooltip';

const LOCAL_MODEL = createChatModelInfo({
  id: 'fixture-local-model',
  name: 'Fixture Local',
  provider: 'ollama',
  isLocal: true,
  isByok: false,
});
const SECOND_LOCAL_MODEL = createChatModelInfo({
  id: 'fixture-local-second',
  name: 'Fixture Local Two',
  provider: 'lmstudio',
  isLocal: true,
  isByok: false,
});
const BYOK_MODEL = createChatModelInfo({
  id: 'fixture-byok-model',
  name: 'Fixture Byok',
  provider: 'fixture-provider',
  isLocal: false,
  isByok: true,
});
const MANAGED_MODEL = createChatModelInfo({
  id: 'fixture-managed-model',
  name: 'Fixture Managed',
  provider: 'managed_cloud',
  isLocal: false,
  isByok: false,
});

const CONVERSATION_ID = 'conversation-under-test';

function openIn(executionMode: ChatExecutionMode, selectedModelId: string) {
  useChatModelStore.setState({
    models: [LOCAL_MODEL, SECOND_LOCAL_MODEL, BYOK_MODEL, MANAGED_MODEL],
    selectedModelId,
  });
  useChatStore.setState({
    conversations: [
      {
        id: CONVERSATION_ID,
        title: 'Chat',
        pinned: false,
        lastMessage: '',
        updatedAt: new Date('2026-10-01T10:00:00Z'),
        executionMode,
      },
    ],
    activeConversationId: CONVERSATION_ID,
  });
}

function renderQuickQuery(props: Partial<ComponentProps<typeof QuickQuery>> = {}) {
  return render(
    <TooltipProvider>
      <QuickQuery open onClose={vi.fn()} onSubmit={vi.fn()} {...props} />
    </TooltipProvider>,
  );
}

function offeredModelNames() {
  return screen
    .getAllByRole('button')
    .filter((button) => button.hasAttribute('aria-pressed'))
    .map((button) => button.querySelector('span')?.textContent);
}

describe('QuickQuery model picker', () => {
  beforeEach(() => {
    useChatModelStore.setState({ models: [], selectedModelId: '' });
    useChatStore.setState({ conversations: [], activeConversationId: null });
  });

  it('offers a Local chat only the models that run on this device', () => {
    openIn('local_only', LOCAL_MODEL.id);
    renderQuickQuery();

    fireEvent.click(screen.getByRole('button', { name: 'Model: Fixture Local' }));

    expect(offeredModelNames()).toEqual([LOCAL_MODEL.name, SECOND_LOCAL_MODEL.name]);
    expect(screen.getByText('Local')).toBeInTheDocument();
  });

  it('offers a BYOK chat only the models behind the provider keys', () => {
    openIn('byok', BYOK_MODEL.id);
    renderQuickQuery();

    fireEvent.click(screen.getByRole('button', { name: 'Model: Fixture Byok' }));

    expect(offeredModelNames()).toEqual([BYOK_MODEL.name]);
  });

  it('offers a Cloud chat only the managed models', () => {
    openIn('cloud_managed', MANAGED_MODEL.id);
    renderQuickQuery();

    fireEvent.click(screen.getByRole('button', { name: 'Model: Fixture Managed' }));

    expect(offeredModelNames()).toEqual([MANAGED_MODEL.name]);
  });

  it('sends with the model chosen in the picker', () => {
    openIn('local_only', LOCAL_MODEL.id);
    const onSubmit = vi.fn();
    renderQuickQuery({ onSubmit });

    fireEvent.click(screen.getByRole('button', { name: 'Model: Fixture Local' }));
    fireEvent.click(screen.getByRole('button', { name: SECOND_LOCAL_MODEL.name }));

    expect(useChatModelStore.getState().selectedModelId).toBe(SECOND_LOCAL_MODEL.id);
    expect(
      useChatStore.getState().conversations.find(({ id }) => id === CONVERSATION_ID)?.modelOverride,
    ).toBe(SECOND_LOCAL_MODEL.id);
    expect(screen.getByRole('button', { name: 'Model: Fixture Local Two' })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Ask anything...'), {
      target: { value: 'hello' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(onSubmit).toHaveBeenCalledWith('hello');
    expect(useChatModelStore.getState().selectedModelId).toBe(SECOND_LOCAL_MODEL.id);
  });

  it('does not present a model from another boundary as the current choice', () => {
    openIn('local_only', MANAGED_MODEL.id);
    renderQuickQuery();

    expect(screen.getByRole('button', { name: 'Model: Select model' })).toBeInTheDocument();
  });

  it('says so when the current mode has no model to offer', () => {
    openIn('local_only', MANAGED_MODEL.id);
    useChatModelStore.setState({ models: [MANAGED_MODEL, BYOK_MODEL] });
    renderQuickQuery();

    expect(screen.getByRole('button', { name: 'Model: No model available' })).toBeDisabled();
  });
});
