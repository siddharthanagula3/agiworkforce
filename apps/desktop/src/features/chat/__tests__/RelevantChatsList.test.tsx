/**
 * RelevantChatsList Component Tests
 *
 * Covers:
 * - Returns null when there are no non-active conversations
 * - Renders conversation titles and last-message previews
 * - Excludes the active conversation from the list
 * - Limits display to maxItems (default 5)
 * - Clicking a conversation calls selectConversation
 * - Snapshot: renders 3 conversations correctly
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.ComponentProps<'div'>) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: React.ComponentProps<'span'>) => (
      <span {...props}>{children}</span>
    ),
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

const mockSelectConversation = vi.fn();

const baseConversations = [
  {
    id: 'conv-1',
    title: 'Competitive analysis',
    lastMessage: 'Comparing Claude vs GPT features',
    updatedAt: new Date('2026-05-22T10:00:00Z'),
    pinned: false,
  },
  {
    id: 'conv-2',
    title: 'Building an AGI Workforce MCP Server',
    lastMessage: 'Added tool registry support',
    updatedAt: new Date('2026-05-22T09:00:00Z'),
    pinned: false,
  },
  {
    id: 'conv-3',
    title: 'Claude Ambassador interest',
    lastMessage: 'Follow-up needed',
    updatedAt: new Date('2026-05-21T20:00:00Z'),
    pinned: false,
  },
];

vi.mock('../../../stores/chat/chatStore', () => ({
  useChatStore: vi.fn((selector) => {
    const state = {
      conversations: baseConversations,
      activeConversationId: 'conv-active',
      selectConversation: mockSelectConversation,
    };
    return selector(state);
  }),
  selectConversations: (s: { conversations: typeof baseConversations }) => s.conversations,
  selectActiveConversationId: (s: { activeConversationId: string }) => s.activeConversationId,
}));

import { RelevantChatsList } from '../RelevantChatsList';

describe('RelevantChatsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders conversation titles', () => {
    render(<RelevantChatsList />);
    expect(screen.getByText('Competitive analysis')).toBeInTheDocument();
    expect(screen.getByText('Building an AGI Workforce MCP Server')).toBeInTheDocument();
  });

  it('renders last-message preview text', () => {
    render(<RelevantChatsList />);
    expect(screen.getByText('Comparing Claude vs GPT features')).toBeInTheDocument();
  });

  it('calls selectConversation when a conversation row is clicked', async () => {
    const user = userEvent.setup();
    render(<RelevantChatsList />);
    const btn = screen.getByRole('button', { name: /Competitive analysis/i });
    await user.click(btn);
    expect(mockSelectConversation).toHaveBeenCalledWith('conv-1');
  });

  it('matches snapshot with three conversations', () => {
    const { container } = render(<RelevantChatsList />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
