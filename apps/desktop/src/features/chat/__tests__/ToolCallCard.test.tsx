/**
 * ToolCallCard Component Tests
 *
 * Covers:
 * - Collapsed row: icon + tool name + brief result summary + chevron
 * - Expanded JSON request/response sections with labeled headers
 * - Status border variants (pending, running, complete, error)
 * - Duration display
 * - Source badge for MCP and browser tools
 * - No expand affordance when card has no detail
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
  describe('collapsed row', () => {
    it('renders the tool name', () => {
      render(<ToolCallCard toolCallId="tc-1" toolName="list_directory" status="complete" />);
      expect(screen.getByText('list_directory')).toBeInTheDocument();
    });

    it('shows a brief result summary in collapsed state', () => {
      render(
        <ToolCallCard
          toolCallId="tc-2"
          toolName="read_file"
          status="complete"
          result={'file contents here\nline 2\nline 3'}
        />,
      );
      expect(screen.getByText('file contents here')).toBeInTheDocument();
    });

    it('truncates long result summary to 80 chars with ellipsis', () => {
      const longLine = 'a'.repeat(90);
      render(
        <ToolCallCard toolCallId="tc-3" toolName="bash" status="complete" result={longLine} />,
      );
      const summary = screen.getByText(/^a+…$/);
      expect(summary.textContent?.length).toBeLessThanOrEqual(81);
    });

    it('shows error summary in collapsed state for error status', () => {
      render(
        <ToolCallCard
          toolCallId="tc-4"
          toolName="bash"
          status="error"
          error="Command not found: foo"
        />,
      );
      expect(screen.getByText('Command not found: foo')).toBeInTheDocument();
    });

    it('shows a chevron when there is expandable detail', () => {
      const { container } = render(
        <ToolCallCard toolCallId="tc-5" toolName="tool" status="complete" result="some result" />,
      );
      // ChevronDown SVG should be present
      expect(container.querySelector('svg')).toBeTruthy();
    });

    it('renders an MCP badge for MCP-prefixed tool ids', () => {
      render(
        <ToolCallCard
          toolCallId="mcp__filesystem__list"
          toolName="list_directory"
          status="complete"
        />,
      );
      expect(screen.getByText('MCP')).toBeInTheDocument();
    });

    it('renders a Browser badge for known browser display names', () => {
      render(<ToolCallCard toolCallId="tc-6" toolName="click" status="complete" />);
      expect(screen.getByText('Browser')).toBeInTheDocument();
    });

    it('shows duration for complete status', () => {
      render(<ToolCallCard toolCallId="tc-7" toolName="tool" status="complete" elapsedMs={1250} />);
      expect(screen.getByText('1.3s')).toBeInTheDocument();
    });

    it('shows duration in ms when under 1 second', () => {
      render(<ToolCallCard toolCallId="tc-8" toolName="tool" status="complete" elapsedMs={450} />);
      expect(screen.getByText('450ms')).toBeInTheDocument();
    });
  });

  describe('expand / collapse', () => {
    it('expands to show Request section when args provided', async () => {
      const user = userEvent.setup();
      render(
        <ToolCallCard
          toolCallId="tc-9"
          toolName="list_directory"
          status="complete"
          args={{ path: '/home/user' }}
          result="file1.txt\nfile2.txt"
        />,
      );

      const toggleBtn = screen.getByRole('button', { name: /expand tool details/i });
      await user.click(toggleBtn);

      expect(screen.getByText('Request')).toBeInTheDocument();
    });

    it('expands to show Response section when result provided', async () => {
      const user = userEvent.setup();
      render(
        <ToolCallCard
          toolCallId="tc-10"
          toolName="read_file"
          status="complete"
          args={{ path: '/etc/hosts' }}
          result="127.0.0.1 localhost"
        />,
      );

      await user.click(screen.getByRole('button', { name: /expand tool details/i }));

      expect(screen.getByText('Response')).toBeInTheDocument();
    });

    it('shows Response labeled in red for error status', async () => {
      const user = userEvent.setup();
      render(
        <ToolCallCard
          toolCallId="tc-11"
          toolName="bash"
          status="error"
          args={{ cmd: 'broken' }}
          error="exit code 127"
        />,
      );

      await user.click(screen.getByRole('button', { name: /expand tool details/i }));

      const responseLabel = screen.getByText('Response');
      expect(responseLabel).toHaveClass('text-red-400');
    });

    it('collapses back when clicked again', async () => {
      const user = userEvent.setup();
      render(
        <ToolCallCard toolCallId="tc-12" toolName="read_file" status="complete" result="content" />,
      );

      const btn = screen.getByRole('button', { name: /expand tool details/i });
      await user.click(btn);
      expect(screen.getByText('Response')).toBeInTheDocument();

      await user.click(btn);
      expect(screen.queryByText('Response')).not.toBeInTheDocument();
    });

    it('renders the expand button as disabled when there is no detail', () => {
      render(<ToolCallCard toolCallId="tc-13" toolName="tool" status="running" />);
      // Button is present but disabled — not interactive
      const btn = screen.getByRole('button', { name: /expand tool details/i });
      expect(btn).toBeDisabled();
    });
  });

  describe('status icons', () => {
    it('shows spinning loader for pending status', () => {
      const { container } = render(
        <ToolCallCard toolCallId="s1" toolName="tool" status="pending" />,
      );
      expect(container.querySelector('.animate-spin')).toBeTruthy();
    });

    it('shows ping animation for running status', () => {
      const { container } = render(
        <ToolCallCard toolCallId="s2" toolName="tool" status="running" />,
      );
      expect(container.querySelector('.animate-ping')).toBeTruthy();
    });

    it('applies green border for complete status', () => {
      const { container } = render(
        <ToolCallCard toolCallId="s3" toolName="tool" status="complete" />,
      );
      expect(container.firstChild).toHaveClass('border-green-500/40');
    });

    it('applies red border for error status', () => {
      const { container } = render(<ToolCallCard toolCallId="s4" toolName="tool" status="error" />);
      expect(container.firstChild).toHaveClass('border-red-500/40');
    });
  });
});
