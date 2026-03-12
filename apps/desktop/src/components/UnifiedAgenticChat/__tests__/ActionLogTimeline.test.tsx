import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const mockState = {
  actionLog: [
    {
      id: 'log-1',
      actionId: 'mcp-search',
      type: 'mcp' as const,
      title: 'Using filesystem.search',
      description: 'Executing MCP tool from workspace',
      status: 'running' as const,
      createdAt: new Date('2026-03-11T12:00:00.000Z'),
      updatedAt: new Date('2026-03-11T12:00:01.000Z'),
      metadata: {
        messageId: 'assistant-1',
        tool: 'filesystem.search',
        query: 'TODO',
      },
    },
  ],
};

vi.mock('framer-motion', () => ({
  motion: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock
    pre: ({ children, ...props }: any) => <pre {...props}>{children}</pre>,
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../../stores/unifiedChatStore', () => ({
  useUnifiedChatStore: (selector?: (state: typeof mockState) => unknown) =>
    selector ? selector(mockState) : mockState,
}));

import { ActionLogTimeline } from '../ActionLogTimeline';

describe('ActionLogTimeline', () => {
  it('renders message-owned runtime activity inline', () => {
    render(<ActionLogTimeline messageId="assistant-1" />);

    expect(screen.getByText('Agent activity')).toBeInTheDocument();
    expect(screen.getByText('Using filesystem.search')).toBeInTheDocument();
    expect(screen.getByText('Executing MCP tool from workspace')).toBeInTheDocument();
  });

  it('shows details when expanded', async () => {
    const user = userEvent.setup();
    render(<ActionLogTimeline messageId="assistant-1" />);

    await user.click(screen.getByRole('button', { name: /details/i }));

    expect(
      screen.getByText((content) => content.includes('"tool": "filesystem.search"')),
    ).toBeInTheDocument();
    expect(
      screen.getByText((content) => content.includes('"query": "TODO"')),
    ).toBeInTheDocument();
  });
});
