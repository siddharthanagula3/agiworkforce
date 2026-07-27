/**
 * ToolCallCard Component Tests (R25 V7 consolidation)
 *
 * Tests cover the canonical ToolCallCard at features/chat/MessageBubble/ToolCallCard.tsx,
 * which renders via @agiworkforce/unified-chat InlineToolCall with iconStyle="badge".
 *
 * Covers:
 * - Tool name rendered in the bar
 * - Badge icon rendered (data-icon-style="badge")
 * - Status → InlineToolCallStatus mapping
 * - Expandable body with Request section (toolCommand)
 * - Approval prompt when requiresApproval=true
 * - Kind inference from tool name
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('framer-motion', () => ({
  motion: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../../lib/tauri-mock', () => ({
  isTauri: false,
  invoke: vi.fn(),
}));

vi.mock('../../../api/toolConfirmation', () => ({
  respondToolConfirmation: vi.fn(),
}));

vi.mock('../../../stores/ui', () => ({
  useSimpleModeStore: vi.fn(() => false),
}));

vi.mock('../../../stores/unifiedChatStore', () => ({
  SidecarMode: {},
  useUnifiedChatStore: vi.fn(),
}));

import { ToolCallCard } from '../MessageBubble/ToolCallCard';

describe('ToolCallCard', () => {
  describe('basic rendering', () => {
    it('renders the tool name in the label', () => {
      render(<ToolCallCard messageId="tc-1" toolName="list_directory" requiresApproval={false} />);
      expect(screen.getByText('list_directory')).toBeTruthy();
    });

    it('renders in badge icon mode (data-icon-style="badge")', () => {
      const { container } = render(
        <ToolCallCard messageId="tc-2" toolName="read_file" requiresApproval={false} />,
      );
      expect(container.querySelector('[data-icon-style="badge"]')).not.toBeNull();
    });

    it('renders a badge element', () => {
      const { container } = render(
        <ToolCallCard messageId="tc-3" toolName="list_directory" requiresApproval={false} />,
      );
      expect(container.querySelector('[data-badge-kind]')).not.toBeNull();
    });
  });

  describe('status mapping', () => {
    it('pending status renders data-status="pending"', () => {
      const { container } = render(
        <ToolCallCard
          messageId="s1"
          toolName="tool"
          toolStatus="pending"
          requiresApproval={false}
        />,
      );
      expect(container.querySelector('[data-status="pending"]')).not.toBeNull();
    });

    it('running status renders the spinner', () => {
      const { container } = render(
        <ToolCallCard
          messageId="s2"
          toolName="tool"
          toolStatus="running"
          requiresApproval={false}
        />,
      );
      expect(container.querySelector('.animate-spin')).not.toBeNull();
    });

    it('completed status maps to data-status="success"', () => {
      const { container } = render(
        <ToolCallCard
          messageId="s3"
          toolName="tool"
          toolStatus="completed"
          requiresApproval={false}
        />,
      );
      expect(container.querySelector('[data-status="success"]')).not.toBeNull();
    });

    it('error status maps to data-status="error"', () => {
      const { container } = render(
        <ToolCallCard messageId="s4" toolName="tool" toolStatus="error" requiresApproval={false} />,
      );
      expect(container.querySelector('[data-status="error"]')).not.toBeNull();
    });
  });

  describe('expand / collapse', () => {
    it('bar is not expandable when no toolCommand', () => {
      const { container } = render(
        <ToolCallCard messageId="e1" toolName="tool" requiresApproval={false} />,
      );
      // No expandable body means no role=button on the bar
      expect(container.querySelector('[data-icon-style="badge"] [role="button"]')).toBeNull();
    });

    it('bar is expandable when toolCommand is provided', async () => {
      const user = userEvent.setup();
      render(
        <ToolCallCard
          messageId="e2"
          toolName="list_directory"
          toolCommand='{"path": "/home/user"}'
          requiresApproval={false}
        />,
      );
      const bar = screen.getByRole('button');
      expect(bar.getAttribute('aria-expanded')).toBe('false');
      await user.click(bar);
      expect(bar.getAttribute('aria-expanded')).toBe('true');
      expect(screen.getByText('Request')).toBeTruthy();
    });

    it('collapses back when clicked again', async () => {
      const user = userEvent.setup();
      render(
        <ToolCallCard
          messageId="e3"
          toolName="read_file"
          toolCommand="some command"
          requiresApproval={false}
        />,
      );
      const btn = screen.getByRole('button');
      await user.click(btn);
      expect(screen.getByText('Request')).toBeTruthy();
      await user.click(btn);
      expect(screen.queryByText('Request')).toBeNull();
    });

    it('opens with approval prompt when requiresApproval=true and confirmationRequestId set', () => {
      render(
        <ToolCallCard
          messageId="e4"
          toolName="bash"
          requiresApproval={true}
          confirmationRequestId="req-1"
        />,
      );
      expect(screen.getByText(/This tool requires approval/)).toBeTruthy();
    });
  });

  describe('kind inference', () => {
    it('infers browser kind for known browser tool names', () => {
      const { container } = render(
        <ToolCallCard messageId="k1" toolName="click" requiresApproval={false} />,
      );
      // Browser kind maps to badge letter "B"
      const badge = container.querySelector('[data-badge-kind="letter"]');
      expect(badge?.getAttribute('data-badge-letter')).toBe('B');
    });

    it('infers mcp kind for mcp-prefixed tool names', () => {
      const { container } = render(
        <ToolCallCard messageId="k2" toolName="mcp__filesystem__list" requiresApproval={false} />,
      );
      const badge = container.querySelector('[data-badge-kind="letter"]');
      expect(badge?.getAttribute('data-badge-letter')).toBe('M');
    });

    it('infers read kind and shows F badge for read-related tools', () => {
      const { container } = render(
        <ToolCallCard messageId="k3" toolName="read_file" requiresApproval={false} />,
      );
      const badge = container.querySelector('[data-badge-kind="letter"]');
      expect(badge?.getAttribute('data-badge-letter')).toBe('F');
    });
  });
});
