import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockUnifiedState = {
  messages: [
    {
      id: 'assistant-1',
      role: 'assistant',
      content: 'I am preparing the operation.',
      metadata: {},
    },
  ],
  pendingApprovals: [
    {
      id: 'approval-1',
      type: 'terminal_command',
      description: 'Run npm install in the project workspace',
      riskLevel: 'medium',
      details: { command: 'npm install' },
      status: 'pending',
      createdAt: new Date('2026-03-11T12:00:00.000Z'),
      timeoutSeconds: 120,
    },
  ],
  agentStatus: null,
  isLoading: false,
  isStreaming: false,
  startEditingMessage: vi.fn(),
  showMessageTimestamps: false,
  editAndRegenerateFromMessage: vi.fn(),
};

const mockChatState = {
  toolTimelineByMessage: {},
  thinkingByMessage: {},
};

const mockUiState = {
  mode: 'advanced',
};

vi.mock('framer-motion', () => ({
  motion: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../../stores/unifiedChatStore', () => ({
  useUnifiedChatStore: (selector?: (state: typeof mockUnifiedState) => unknown) =>
    selector ? selector(mockUnifiedState) : mockUnifiedState,
}));

vi.mock('../../../stores/chat/chatStore', () => ({
  useChatStore: (selector?: (state: typeof mockChatState) => unknown) =>
    selector ? selector(mockChatState) : mockChatState,
}));

vi.mock('../../../stores/ui', () => ({
  useSimpleModeStore: (selector?: (state: typeof mockUiState) => unknown) =>
    selector ? selector(mockUiState) : mockUiState,
  selectIsSimpleMode: (state: typeof mockUiState) => state.mode === 'simple',
}));

vi.mock('../../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

vi.mock('../MessageBubble', () => ({
  MessageBubble: ({ message }: { message: { content: string } }) => (
    <div data-testid="message-bubble">{message.content}</div>
  ),
}));

vi.mock('../Cards/ActiveToolStreams', () => ({
  ActiveToolStreams: () => null,
}));

vi.mock('../../AGI', () => ({
  IterationProgressPanel: () => null,
}));

vi.mock('../SimpleEmptyState', () => ({
  SimpleEmptyState: () => <div>simple-empty</div>,
}));

vi.mock('../AdvancedEmptyState', () => ({
  AdvancedEmptyState: () => <div>advanced-empty</div>,
}));

vi.mock('../ToolRationaleDisplay', () => ({
  ToolRationaleDisplay: () => null,
}));

vi.mock('../ToolTimeline', () => ({
  ToolTimeline: () => <div data-testid="tool-timeline" />,
}));

vi.mock('../ThinkingBlock', () => ({
  ThinkingBlock: ({ content }: { content: string }) => <div>{content}</div>,
}));

vi.mock('../Cards/ApprovalRequestCard', () => ({
  ApprovalRequestCard: ({ approval }: { approval: { description: string } }) => (
    <div data-testid="approval-card">{approval.description}</div>
  ),
}));

import { ChatStream } from '../ChatStream';

describe('ChatStream', () => {
  it('renders pending approvals inline in the transcript', () => {
    render(<ChatStream />);

    expect(screen.getByTestId('message-bubble')).toHaveTextContent('I am preparing the operation.');
    expect(screen.getByText('Unassigned approvals')).toBeInTheDocument();
    expect(screen.getByTestId('approval-card')).toHaveTextContent(
      'Run npm install in the project workspace',
    );
  });
});
