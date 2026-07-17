/**
 * MessageList — tool-approval expired notice (streaming/approval cluster
 * Finding 1: dead tool-approval buttons after reload/restart).
 *
 * The approval registry backing `ChatRuntime.resolveToolApproval` is
 * process-memory-only and doesn't survive a reload/restart, even though a
 * persisted `awaiting_approval` tool card does. Without `approvalTurnExpired`,
 * the Approve/Reject buttons would render live-wired but silently no-op.
 * Pins the gate end-to-end through MessageList -> MessageBubble -> ToolCallCard.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MessageList } from '../MessageList';
import { useChatStore } from '../../stores/chatStore';
import type { ChatMessage } from '../../lib/types';

const awaitingApproval: ChatMessage = {
  id: 'a1',
  role: 'assistant',
  content: '',
  createdAt: '2026-05-06T12:00:00.000Z',
  toolCalls: [
    {
      id: 'call_1',
      name: 'mcp__github__get_pull_request_diff',
      args: { owner: 'acme', repo: 'app', pull_number: 7 },
      status: 'awaiting_approval',
      requiresApproval: true,
    },
  ],
};

function seed(messages: ChatMessage[]) {
  useChatStore.setState({ messagesByConversation: { c1: messages }, isStreaming: false } as never);
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  useChatStore.setState({ messagesByConversation: {}, isStreaming: false } as never);
});

afterEach(() => cleanup());

describe('MessageList tool-approval expired notice', () => {
  it('renders live Approve/Reject buttons when the turn is live (approvalTurnExpired=false)', () => {
    seed([awaitingApproval]);
    render(
      <MessageList
        conversationId="c1"
        onToolApprove={vi.fn()}
        onToolReject={vi.fn()}
        approvalTurnExpired={false}
        showProvenanceFooter={false}
      />,
    );
    expect(screen.getByText('Approve')).toBeTruthy();
    expect(screen.getByText('Reject')).toBeTruthy();
    expect(screen.queryByText(/this approval request expired/i)).toBeNull();
  });

  it('renders the expired notice instead of live buttons when approvalTurnExpired=true', () => {
    seed([awaitingApproval]);
    render(
      <MessageList
        conversationId="c1"
        onToolApprove={vi.fn()}
        onToolReject={vi.fn()}
        approvalTurnExpired={true}
        showProvenanceFooter={false}
      />,
    );
    expect(screen.queryByText('Approve')).toBeNull();
    expect(screen.queryByText('Reject')).toBeNull();
    expect(screen.getByText(/this approval request expired/i)).toBeTruthy();
  });

  it('shows Resend and calls onRegenerateMessage with the message id when both are wired', () => {
    seed([awaitingApproval]);
    const onRegenerate = vi.fn();
    render(
      <MessageList
        conversationId="c1"
        onToolApprove={vi.fn()}
        onToolReject={vi.fn()}
        approvalTurnExpired={true}
        onRegenerateMessage={onRegenerate}
        showProvenanceFooter={false}
      />,
    );
    fireEvent.click(screen.getByText('Resend'));
    expect(onRegenerate).toHaveBeenCalledWith('a1');
  });

  it('falls back to text-only guidance with no Resend button when onRegenerateMessage is not wired (no fake affordance)', () => {
    seed([awaitingApproval]);
    render(
      <MessageList
        conversationId="c1"
        onToolApprove={vi.fn()}
        onToolReject={vi.fn()}
        approvalTurnExpired={true}
        showProvenanceFooter={false}
      />,
    );
    expect(screen.queryByText('Resend')).toBeNull();
    expect(screen.getByText(/send a new message to continue/i)).toBeTruthy();
  });

  it('does not treat a missing approvalTurnExpired prop as expired (undefined = no signal, not "yes expired")', () => {
    seed([awaitingApproval]);
    render(
      <MessageList
        conversationId="c1"
        onToolApprove={vi.fn()}
        onToolReject={vi.fn()}
        showProvenanceFooter={false}
      />,
    );
    expect(screen.getByText('Approve')).toBeTruthy();
    expect(screen.queryByText(/this approval request expired/i)).toBeNull();
  });
});
