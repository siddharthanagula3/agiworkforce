import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useArtifactStore } from '@/stores/artifactStore';
import type { EnhancedMessage } from '@/stores/chat/types';

function assistantMessage(overrides: Partial<EnhancedMessage> = {}): EnhancedMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: 'I am preparing the operation.',
    timestamp: new Date('2026-05-21T12:00:00.000Z'),
    metadata: {},
    ...overrides,
  };
}

const mockUnifiedState = {
  activeConversationId: null as string | null,
  messages: [assistantMessage()] as EnhancedMessage[],
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
  updateMessage: vi.fn(),
  closeSidecar: vi.fn(),
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
  useUnifiedChatStore: Object.assign(
    (selector?: (state: typeof mockUnifiedState) => unknown) =>
      selector ? selector(mockUnifiedState) : mockUnifiedState,
    { getState: () => mockUnifiedState },
  ),
}));

vi.mock('../../../stores/chat/chatStore', () => ({
  useChatStore: (selector?: (state: typeof mockChatState) => unknown) =>
    selector ? selector(mockChatState) : mockChatState,
  // RelevantChatsList (round 19) reads via these selectors. Return safe
  // empty values so the panel renders without breaking ChatStream's
  // existing transcript assertions.
  selectConversations: () => [] as unknown[],
  selectActiveConversationId: () => null,
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

vi.mock('@/features/agi', () => ({
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
  beforeEach(() => {
    Element.prototype.scrollTo = vi.fn();
    mockUnifiedState.activeConversationId = null;
    mockUnifiedState.messages = [assistantMessage()];
    mockUnifiedState.updateMessage = vi.fn();
    mockUnifiedState.closeSidecar = vi.fn();
    useArtifactStore.setState({
      artifacts: new Map(),
      summaries: [],
      activeArtifactId: null,
      selectedVersion: null,
      panelOpen: false,
      isLoading: false,
      isStreaming: null,
    });
  });

  it('renders pending approvals inline in the transcript', () => {
    render(<ChatStream />);

    expect(screen.getByTestId('message-bubble')).toHaveTextContent('I am preparing the operation.');
    expect(screen.getByText('Unassigned approvals')).toBeInTheDocument();
    expect(screen.getByTestId('approval-card')).toHaveTextContent(
      'Run npm install in the project workspace',
    );
  });

  it('opens message artifact cards in the persistent artifact panel', async () => {
    const user = userEvent.setup();
    const onOpenSidecar = vi.fn();
    mockUnifiedState.messages = [
      assistantMessage({
        id: 'assistant-artifact',
        content: 'Created the specification.',
        metadata: {},
        artifacts: [
          {
            id: 'artifact-1',
            type: 'markdown',
            title: 'Launch specification',
            content: '# Launch specification',
            language: 'markdown',
          },
        ],
      }),
    ];

    render(<ChatStream onOpenSidecar={onOpenSidecar} />);

    await user.click(screen.getByRole('button', { name: /launch specification/i }));

    await waitFor(() => {
      expect(useArtifactStore.getState().panelOpen).toBe(true);
    });
    expect(useArtifactStore.getState().activeArtifactId).toBe('artifact-1');
    expect(mockUnifiedState.closeSidecar).toHaveBeenCalled();
    expect(onOpenSidecar).not.toHaveBeenCalled();
  });
});
