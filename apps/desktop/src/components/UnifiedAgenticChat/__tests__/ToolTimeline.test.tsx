/**
 * ToolTimeline Component Tests
 *
 * Covers:
 * - Returns null when entries array is empty
 * - Header shows "Used N tool(s)" when all tools are completed
 * - Header shows "Running tools..." when any entry is running
 * - Error count is displayed in the header when errors exist
 * - Total duration is shown in the header for completed runs
 * - Tool list is expanded automatically while tools are running
 * - Toggle collapse / expand by clicking the header button
 * - Individual ToolLabel entries are rendered inside the expanded list
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ToolLabelEntry } from '../ToolLabel';

// Mock framer-motion so AnimatePresence and motion render synchronously in jsdom
vi.mock('framer-motion', () => ({
  motion: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock: framer-motion motion proxy
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  // Render children immediately — avoids needing to await animation exit
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

// ToolLabel uses framer-motion too; mock it consistently
vi.mock('../ToolLabel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ToolLabel')>();
  return actual;
});

import { ToolTimeline } from '../ToolTimeline';

// Three completed entries used as the default set
const completedEntries: ToolLabelEntry[] = [
  { id: '1', displayName: 'Read', displayArgs: 'main.rs', status: 'completed', durationMs: 45 },
  {
    id: '2',
    displayName: 'Bash',
    displayArgs: 'cargo test',
    status: 'completed',
    durationMs: 3200,
  },
  { id: '3', displayName: 'Edit', displayArgs: 'lib.rs', status: 'completed', durationMs: 12 },
];

describe('ToolTimeline', () => {
  describe('empty state', () => {
    it('renders nothing when entries array is empty', () => {
      const { container } = render(<ToolTimeline entries={[]} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('completed state header', () => {
    it('shows correct singular "tool" label for a single entry', () => {
      render(<ToolTimeline entries={[completedEntries[0]!]} />);
      expect(screen.getByText(/Used 1 tool(?!s)/)).toBeInTheDocument();
    });

    it('shows correct plural "tools" label for multiple entries', () => {
      render(<ToolTimeline entries={completedEntries} />);
      expect(screen.getByText(/Used 3 tools/)).toBeInTheDocument();
    });

    it('shows the total cumulative duration when all tools have finished', () => {
      // Total: 45 + 3200 + 12 = 3257ms → 3.3s
      render(<ToolTimeline entries={completedEntries} />);
      expect(screen.getByText(/3\.3s/)).toBeInTheDocument();
    });

    it('shows duration in ms when total is under one second', () => {
      const shortEntries: ToolLabelEntry[] = [
        { id: 'a', displayName: 'Read', displayArgs: 'x', status: 'completed', durationMs: 45 },
        { id: 'b', displayName: 'Edit', displayArgs: 'y', status: 'completed', durationMs: 12 },
      ];
      render(<ToolTimeline entries={shortEntries} />);
      // 45 + 12 = 57ms
      expect(screen.getByText(/57ms/)).toBeInTheDocument();
    });

    it('does not show duration text when all durationMs values are undefined', () => {
      const noDurationEntries: ToolLabelEntry[] = [
        { id: 'x', displayName: 'Read', displayArgs: 'f', status: 'completed' },
      ];
      render(<ToolTimeline entries={noDurationEntries} />);
      // totalDuration = 0, so the duration span is not rendered
      expect(screen.queryByText(/ms\)/)).not.toBeInTheDocument();
      expect(screen.queryByText(/s\)/)).not.toBeInTheDocument();
    });
  });

  describe('running state header', () => {
    it('shows "Running tools..." text when at least one entry is running', () => {
      const runningEntries: ToolLabelEntry[] = [
        { id: 'r1', displayName: 'Read', displayArgs: 'f', status: 'running' },
      ];
      render(<ToolTimeline entries={runningEntries} />);
      expect(screen.getByText('Running tools...')).toBeInTheDocument();
    });

    it('shows running state even when some entries are already completed', () => {
      const mixed: ToolLabelEntry[] = [
        ...completedEntries,
        { id: 'r', displayName: 'Bash', displayArgs: 'pnpm test', status: 'running' },
      ];
      render(<ToolTimeline entries={mixed} />);
      expect(screen.getByText('Running tools...')).toBeInTheDocument();
    });

    it('does not show "Used N tools" text when any entry is running', () => {
      const running: ToolLabelEntry[] = [
        { id: 'r', displayName: 'Read', displayArgs: 'f', status: 'running' },
      ];
      render(<ToolTimeline entries={running} />);
      expect(screen.queryByText(/Used \d+ tool/)).not.toBeInTheDocument();
    });
  });

  describe('error count', () => {
    it('shows error count in the header when one or more tools failed', () => {
      const withError: ToolLabelEntry[] = [
        ...completedEntries,
        {
          id: 'e1',
          displayName: 'Bash',
          displayArgs: 'npm test',
          status: 'error',
          error: 'exit 1',
        },
      ];
      render(<ToolTimeline entries={withError} />);
      expect(screen.getByText(/1 failed/)).toBeInTheDocument();
    });

    it('shows correct count when multiple tools failed', () => {
      const multiError: ToolLabelEntry[] = [
        { id: 'e1', displayName: 'Bash', displayArgs: 'a', status: 'error', error: 'err' },
        { id: 'e2', displayName: 'Bash', displayArgs: 'b', status: 'error', error: 'err' },
        { id: 'ok', displayName: 'Read', displayArgs: 'c', status: 'completed', durationMs: 10 },
      ];
      render(<ToolTimeline entries={multiError} />);
      expect(screen.getByText(/2 failed/)).toBeInTheDocument();
    });

    it('does not show error count text when no tools failed', () => {
      render(<ToolTimeline entries={completedEntries} />);
      expect(screen.queryByText(/failed/)).not.toBeInTheDocument();
    });
  });

  describe('auto-expand while running', () => {
    it('automatically expands the tool list when tools are running', () => {
      const running: ToolLabelEntry[] = [
        { id: 'r', displayName: 'Read', displayArgs: 'main.rs', status: 'running' },
      ];
      render(<ToolTimeline entries={running} />);
      // The tool label "Read" should be visible without any user interaction
      expect(screen.getByText('Read')).toBeInTheDocument();
    });
  });

  describe('collapse / expand toggle', () => {
    it('starts collapsed when all tools are completed', () => {
      render(<ToolTimeline entries={completedEntries} />);
      // Individual tool labels are inside the collapsible section which starts closed
      expect(screen.queryByText('Read')).not.toBeInTheDocument();
    });

    it('expands the tool list when the header button is clicked', async () => {
      const user = userEvent.setup();
      render(<ToolTimeline entries={completedEntries} />);

      // Click the header toggle button
      const headerButton = screen.getByRole('button');
      await user.click(headerButton);

      // Now each ToolLabel entry should be visible
      expect(screen.getByText('Read')).toBeInTheDocument();
      expect(screen.getByText('Bash')).toBeInTheDocument();
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });

    it('collapses again when the header button is clicked a second time', async () => {
      const user = userEvent.setup();
      render(<ToolTimeline entries={completedEntries} />);

      const headerButton = screen.getByRole('button');
      // First click: expand
      await user.click(headerButton);
      expect(screen.getByText('Read')).toBeInTheDocument();

      // Second click: collapse
      await user.click(headerButton);
      expect(screen.queryByText('Read')).not.toBeInTheDocument();
    });
  });

  describe('entry rendering inside expanded list', () => {
    it('renders all entry display names when expanded', async () => {
      const user = userEvent.setup();
      render(<ToolTimeline entries={completedEntries} />);

      await user.click(screen.getByRole('button'));

      expect(screen.getByText('Read')).toBeInTheDocument();
      expect(screen.getByText('Bash')).toBeInTheDocument();
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });

    it('renders entry display args when expanded', async () => {
      const user = userEvent.setup();
      render(<ToolTimeline entries={completedEntries} />);

      await user.click(screen.getByRole('button'));

      // Args are rendered as JSON via argsFromDisplayArgs({ input: displayArgs })
      expect(screen.getByText(/main\.rs/)).toBeInTheDocument();
      expect(screen.getByText(/cargo test/)).toBeInTheDocument();
      expect(screen.getByText(/lib\.rs/)).toBeInTheDocument();
    });

    it('renders a single entry correctly when expanded', async () => {
      const user = userEvent.setup();
      const single: ToolLabelEntry[] = [
        {
          id: 's',
          displayName: 'WebSearch',
          displayArgs: 'rust docs',
          status: 'completed',
          durationMs: 800,
        },
      ];
      render(<ToolTimeline entries={single} />);

      await user.click(screen.getByRole('button'));

      expect(screen.getByText('WebSearch')).toBeInTheDocument();
      expect(screen.getByText(/rust docs/)).toBeInTheDocument();
    });
  });

  describe('optional className prop', () => {
    it('applies additional className to the root container', () => {
      const { container } = render(
        <ToolTimeline entries={completedEntries} className="my-custom-class" />,
      );
      expect(container.firstChild).toHaveClass('my-custom-class');
    });
  });
});
