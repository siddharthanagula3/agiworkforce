/**
 * ToolCallCard Component Tests (R22 badge-mode refactor)
 *
 * The desktop ToolCallCard now renders via @agiworkforce/unified-chat
 * InlineToolCall with iconStyle="badge". Tests validate the new visual
 * contract rather than the old framer-motion bordered-card contract.
 *
 * Covers:
 * - Tool name rendered in the bar
 * - Badge icon rendered (data-icon-style="badge")
 * - Status → InlineToolCallStatus mapping
 * - Expandable body with Request / Response sections
 * - Duration display in argSummary
 * - Keyboard expand/collapse
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

import { ToolCallCard } from '../ToolCallCard';

describe('ToolCallCard', () => {
  describe('basic rendering', () => {
    it('renders the tool name in the label', () => {
      render(<ToolCallCard toolCallId="tc-1" toolName="list_directory" status="complete" />);
      expect(screen.getByText('list_directory')).toBeTruthy();
    });

    it('renders in badge icon mode (data-icon-style="badge")', () => {
      const { container } = render(
        <ToolCallCard toolCallId="tc-2" toolName="read_file" status="complete" />,
      );
      expect(container.querySelector('[data-icon-style="badge"]')).not.toBeNull();
    });

    it('renders a badge element', () => {
      const { container } = render(
        <ToolCallCard toolCallId="tc-3" toolName="list_directory" status="complete" />,
      );
      expect(container.querySelector('[data-badge-kind]')).not.toBeNull();
    });
  });

  describe('status mapping', () => {
    it('pending status renders ellipsis suffix', () => {
      const { container } = render(
        <ToolCallCard toolCallId="s1" toolName="tool" status="pending" />,
      );
      expect(container.querySelector('[data-status="pending"]')).not.toBeNull();
    });

    it('running status renders the spinner', () => {
      const { container } = render(
        <ToolCallCard toolCallId="s2" toolName="tool" status="running" />,
      );
      expect(container.querySelector('.animate-spin')).not.toBeNull();
    });

    it('complete status maps to data-status="success"', () => {
      const { container } = render(
        <ToolCallCard toolCallId="s3" toolName="tool" status="complete" />,
      );
      expect(container.querySelector('[data-status="success"]')).not.toBeNull();
    });

    it('error status maps to data-status="error"', () => {
      const { container } = render(<ToolCallCard toolCallId="s4" toolName="tool" status="error" />);
      expect(container.querySelector('[data-status="error"]')).not.toBeNull();
    });
  });

  describe('duration display', () => {
    it('shows duration in seconds for elapsedMs >= 1000', () => {
      render(<ToolCallCard toolCallId="d1" toolName="tool" status="complete" elapsedMs={1250} />);
      expect(screen.getByText('1.3s')).toBeTruthy();
    });

    it('shows duration in ms when under 1 second', () => {
      render(<ToolCallCard toolCallId="d2" toolName="tool" status="complete" elapsedMs={450} />);
      expect(screen.getByText('450ms')).toBeTruthy();
    });
  });

  describe('expand / collapse', () => {
    it('bar is not expandable when no args or result', () => {
      const { container } = render(
        <ToolCallCard toolCallId="e1" toolName="tool" status="complete" />,
      );
      // No expandable body means no role=button on the bar
      expect(container.querySelector('[data-icon-style="badge"] [role="button"]')).toBeNull();
    });

    it('bar is expandable when args are provided', async () => {
      const user = userEvent.setup();
      render(
        <ToolCallCard
          toolCallId="e2"
          toolName="list_directory"
          status="complete"
          args={{ path: '/home/user' }}
          result="file1.txt"
        />,
      );
      const bar = screen.getByRole('button');
      expect(bar.getAttribute('aria-expanded')).toBe('false');
      await user.click(bar);
      expect(bar.getAttribute('aria-expanded')).toBe('true');
      expect(screen.getByText('Request')).toBeTruthy();
    });

    it('expands to show Response section when result provided', async () => {
      const user = userEvent.setup();
      render(
        <ToolCallCard
          toolCallId="e3"
          toolName="read_file"
          status="complete"
          args={{ path: '/etc/hosts' }}
          result="127.0.0.1 localhost"
        />,
      );
      await user.click(screen.getByRole('button'));
      expect(screen.getByText('Response')).toBeTruthy();
    });

    it('collapses back when clicked again', async () => {
      const user = userEvent.setup();
      render(
        <ToolCallCard
          toolCallId="e4"
          toolName="read_file"
          status="complete"
          result="content"
          args={{ path: '/f' }}
        />,
      );
      const btn = screen.getByRole('button');
      await user.click(btn);
      expect(screen.getByText('Response')).toBeTruthy();
      await user.click(btn);
      expect(screen.queryByText('Response')).toBeNull();
    });
  });

  describe('kind inference', () => {
    it('infers browser kind for known browser tool names', () => {
      const { container } = render(
        <ToolCallCard toolCallId="k1" toolName="click" status="complete" />,
      );
      // Browser kind maps to badge letter "B"
      const badge = container.querySelector('[data-badge-kind="letter"]');
      expect(badge?.getAttribute('data-badge-letter')).toBe('B');
    });

    it('infers mcp kind for mcp-prefixed tool names', () => {
      const { container } = render(
        <ToolCallCard toolCallId="k2" toolName="mcp__filesystem__list" status="complete" />,
      );
      const badge = container.querySelector('[data-badge-kind="letter"]');
      expect(badge?.getAttribute('data-badge-letter')).toBe('M');
    });

    it('infers read kind and shows F badge for read-related tools', () => {
      const { container } = render(
        <ToolCallCard toolCallId="k3" toolName="read_file" status="complete" />,
      );
      const badge = container.querySelector('[data-badge-kind="letter"]');
      expect(badge?.getAttribute('data-badge-letter')).toBe('F');
    });
  });
});
