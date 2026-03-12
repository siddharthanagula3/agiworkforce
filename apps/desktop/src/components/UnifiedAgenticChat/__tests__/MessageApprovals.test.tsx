import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockState = {
  pendingApprovals: [
    {
      id: 'approval-1',
      type: 'mcp_tool' as const,
      description: 'Run filesystem.search',
      riskLevel: 'medium' as const,
      details: { toolName: 'filesystem.search', messageId: 'assistant-1' },
      status: 'pending' as const,
      createdAt: new Date('2026-03-11T12:00:00.000Z'),
      messageId: 'assistant-1',
    },
    {
      id: 'approval-2',
      type: 'terminal_command' as const,
      description: 'Run npm install',
      riskLevel: 'high' as const,
      details: {},
      status: 'pending' as const,
      createdAt: new Date('2026-03-11T12:00:00.000Z'),
      messageId: 'assistant-2',
    },
  ],
};

vi.mock('../../../stores/unifiedChatStore', () => ({
  useUnifiedChatStore: (selector?: (state: typeof mockState) => unknown) =>
    selector ? selector(mockState) : mockState,
}));

vi.mock('../Cards/ApprovalRequestCard', () => ({
  ApprovalRequestCard: ({
    approval,
  }: {
    approval: { description: string };
  }) => <div data-testid="approval-card">{approval.description}</div>,
}));

import { MessageApprovals } from '../MessageApprovals';

describe('MessageApprovals', () => {
  it('renders only approvals owned by the message', () => {
    render(<MessageApprovals messageId="assistant-1" />);

    expect(screen.getByText('Pending approvals')).toBeInTheDocument();
    expect(screen.getByTestId('approval-card')).toHaveTextContent('Run filesystem.search');
    expect(screen.queryByText('Run npm install')).not.toBeInTheDocument();
  });
});
