import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MessageList } from '../MessageList';
import { useChatStore } from '../../stores/chatStore';
import type { ChatMessage } from '../../lib/types';

const CONVERSATION_ID = 'conversation-research';

function seed(metadata: Record<string, unknown> | undefined) {
  const message: ChatMessage = {
    id: 'assistant-1',
    role: 'assistant',
    content: 'Here is the report.',
    timestamp: '2026-08-15T00:00:00.000Z',
    ...(metadata ? { metadata } : {}),
  };
  useChatStore.setState({
    activeConversationId: CONVERSATION_ID,
    messagesByConversation: { [CONVERSATION_ID]: [message] },
    isStreaming: false,
  });
}

describe('MessageList deep-research status', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = () => {};
    useChatStore.setState({ messagesByConversation: {}, isStreaming: false });
  });

  afterEach(cleanup);

  it('renders the phase and counts parsed from x_research_status metadata', () => {
    seed({
      research: {
        phase: 'searching',
        iteration: 2,
        maxIterations: 4,
        searches: 7,
        sources: 1,
        elapsedMs: 65_000,
      },
    });

    render(<MessageList conversationId={CONVERSATION_ID} showProvenanceFooter={false} />);

    const chip = screen.getByTestId('research-status');
    expect(chip.getAttribute('data-phase')).toBe('searching');
    expect(chip.textContent).toContain('Searching the web');
    const counts = screen.getByTestId('research-status-counts').textContent ?? '';
    expect(counts).toContain('round 2 of 4');
    expect(counts).toContain('7 searches');
    expect(counts).toContain('1 source');
    expect(counts).not.toContain('1 sources');
    expect(counts).toContain('1:05');
  });

  it('prefers the server label and marks a failed run', () => {
    seed({ research: { phase: 'error', label: 'Research run failed', searches: 3 } });

    render(<MessageList conversationId={CONVERSATION_ID} showProvenanceFooter={false} />);

    const chip = screen.getByTestId('research-status');
    expect(chip.getAttribute('data-phase')).toBe('error');
    expect(chip.textContent).toContain('Research run failed');
  });

  it('renders nothing when metadata carries no research state or an unknown phase', () => {
    seed({ research: { phase: 'bogus', searches: 3 } });
    render(<MessageList conversationId={CONVERSATION_ID} showProvenanceFooter={false} />);
    expect(screen.queryByTestId('research-status')).toBeNull();
    cleanup();

    seed(undefined);
    render(<MessageList conversationId={CONVERSATION_ID} showProvenanceFooter={false} />);
    expect(screen.queryByTestId('research-status')).toBeNull();
  });
});
