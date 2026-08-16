import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MessageList } from '../MessageList';
import { useChatStore } from '../../stores/chatStore';
import { useModelStore } from '../../stores/modelStore';
import type { ChatMessage } from '../../lib/types';

const FIXTURE_ROUTED_MODEL_ID = 'fixture-routed-model';

const autoRouted: ChatMessage = {
  id: 'a1',
  role: 'assistant',
  content: 'routed answer',
  createdAt: '2026-05-06T12:00:10.000Z',
  routing: {
    source: 'auto',
    task: 'code',
    reason: 'preferred_slot via harness-a',
    pinModel: FIXTURE_ROUTED_MODEL_ID,
  },
};

const manual: ChatMessage = {
  id: 'a2',
  role: 'assistant',
  content: 'manual answer',
  createdAt: '2026-05-06T12:01:00.000Z',
};

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  useChatStore.setState({ messagesByConversation: {}, isStreaming: false } as never);
  useModelStore.setState({ selectedModelId: 'auto', recentModelIds: [] } as never);
});

afterEach(() => cleanup());

describe('MessageList pin-to-model wiring', () => {
  it('renders the Pin button for an auto-routed assistant message', () => {
    useChatStore.setState({
      messagesByConversation: { c1: [autoRouted] },
      isStreaming: false,
    } as never);
    render(<MessageList conversationId="c1" />);

    expect(screen.getByText(`Pin to ${FIXTURE_ROUTED_MODEL_ID}`)).toBeTruthy();
  });

  it('pins the model selection to routing.pinModel when clicked', () => {
    useChatStore.setState({
      messagesByConversation: { c1: [autoRouted] },
      isStreaming: false,
    } as never);
    render(<MessageList conversationId="c1" />);

    fireEvent.click(screen.getByText(`Pin to ${FIXTURE_ROUTED_MODEL_ID}`));

    expect(useModelStore.getState().selectedModelId).toBe(FIXTURE_ROUTED_MODEL_ID);
  });

  it('renders no Pin button for a manually-selected assistant message', () => {
    useChatStore.setState({
      messagesByConversation: { c1: [manual] },
      isStreaming: false,
    } as never);
    render(<MessageList conversationId="c1" />);

    expect(screen.queryByText(/^Pin to /)).toBeNull();
  });
});
