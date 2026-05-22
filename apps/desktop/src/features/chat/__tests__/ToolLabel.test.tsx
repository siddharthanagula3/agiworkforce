/**
 * ToolLabel Component Tests
 *
 * Covers:
 * - Rendering tool name and display args
 * - Status indicator icons: Check (completed), Spinner (running), X (error)
 * - Duration formatting: milliseconds and seconds
 * - Hiding duration while running
 * - Hiding args when displayArgs is empty
 * - Running ellipsis animation indicator
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock framer-motion so motion.div renders as a plain div in jsdom
vi.mock('framer-motion', () => ({
  motion: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock: framer-motion motion proxy
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

import { ToolLabel, type ToolLabelEntry } from '../ToolLabel';

// A fully-populated completed entry used as baseline in most tests
const baseEntry: ToolLabelEntry = {
  id: 'test-1',
  displayName: 'Read',
  displayArgs: 'src/main.rs',
  status: 'completed',
  durationMs: 45,
};

describe('ToolLabel', () => {
  describe('text content', () => {
    it('renders the tool display name', () => {
      render(<ToolLabel entry={baseEntry} />);
      expect(screen.getByText('Read')).toBeInTheDocument();
    });

    it('renders display args wrapped in parentheses', () => {
      render(<ToolLabel entry={baseEntry} />);
      expect(screen.getByText('(src/main.rs)')).toBeInTheDocument();
    });

    it('does not render args span when displayArgs is empty string', () => {
      render(<ToolLabel entry={{ ...baseEntry, displayArgs: '' }} />);
      // When displayArgs is falsy the span is not rendered at all
      expect(screen.queryByText(/^\(.*\)$/)).not.toBeInTheDocument();
    });

    it('renders the running ellipsis when status is running', () => {
      render(<ToolLabel entry={{ ...baseEntry, status: 'running', durationMs: undefined }} />);
      expect(screen.getByText('...')).toBeInTheDocument();
    });

    it('does not render the running ellipsis when completed', () => {
      render(<ToolLabel entry={baseEntry} />);
      expect(screen.queryByText('...')).not.toBeInTheDocument();
    });

    it('does not render the running ellipsis when status is error', () => {
      render(<ToolLabel entry={{ ...baseEntry, status: 'error', error: 'failed' }} />);
      expect(screen.queryByText('...')).not.toBeInTheDocument();
    });
  });

  describe('status icon classes', () => {
    it('shows emerald Check icon for completed status', () => {
      render(<ToolLabel entry={baseEntry} />);
      // The Check icon receives .text-emerald-400
      expect(document.querySelector('.text-emerald-400')).toBeTruthy();
    });

    it('shows spinning Loader icon for running status', () => {
      render(<ToolLabel entry={{ ...baseEntry, status: 'running', durationMs: undefined }} />);
      // Loader2 gets animate-spin class
      expect(document.querySelector('.animate-spin')).toBeTruthy();
    });

    it('shows red X icon for error status', () => {
      render(<ToolLabel entry={{ ...baseEntry, status: 'error', error: 'failed' }} />);
      // X icon receives .text-red-400
      expect(document.querySelector('.text-red-400')).toBeTruthy();
    });

    it('applies red foreground text colour when status is error', () => {
      const { container } = render(
        <ToolLabel entry={{ ...baseEntry, status: 'error', error: 'oops' }} />,
      );
      // The outer motion.div gets text-red-400 when isError is true
      expect(container.firstChild).toHaveClass('text-red-400');
    });

    it('does not apply red foreground text colour when completed', () => {
      const { container } = render(<ToolLabel entry={baseEntry} />);
      expect(container.firstChild).not.toHaveClass('text-red-400');
    });
  });

  describe('duration display', () => {
    it('renders millisecond duration for completed entries under one second', () => {
      render(<ToolLabel entry={baseEntry} />); // durationMs: 45
      expect(screen.getByText('45ms')).toBeInTheDocument();
    });

    it('renders fractional-seconds duration for entries at or above one second', () => {
      render(<ToolLabel entry={{ ...baseEntry, durationMs: 3200 }} />);
      expect(screen.getByText('3.2s')).toBeInTheDocument();
    });

    it('renders 1.0s for exactly 1000ms', () => {
      render(<ToolLabel entry={{ ...baseEntry, durationMs: 1000 }} />);
      expect(screen.getByText('1.0s')).toBeInTheDocument();
    });

    it('renders 999ms for 999 milliseconds', () => {
      render(<ToolLabel entry={{ ...baseEntry, durationMs: 999 }} />);
      expect(screen.getByText('999ms')).toBeInTheDocument();
    });

    it('does not render duration while tool is running', () => {
      render(<ToolLabel entry={{ ...baseEntry, status: 'running', durationMs: undefined }} />);
      expect(screen.queryByText(/ms$/)).not.toBeInTheDocument();
      expect(screen.queryByText(/s$/)).not.toBeInTheDocument();
    });

    it('does not render duration when durationMs is undefined', () => {
      render(<ToolLabel entry={{ ...baseEntry, durationMs: undefined }} />);
      expect(screen.queryByText(/ms$/)).not.toBeInTheDocument();
    });

    it('renders 0ms for zero duration', () => {
      render(<ToolLabel entry={{ ...baseEntry, durationMs: 0 }} />);
      expect(screen.getByText('0ms')).toBeInTheDocument();
    });
  });

  describe('icon mapping', () => {
    const iconCases: Array<[string, string]> = [
      ['Read', 'src/lib.rs'],
      ['Write', 'output.txt'],
      ['Edit', 'index.ts'],
      ['LS', '.'],
      ['Search', 'fn main'],
      ['Bash', 'cargo test'],
      ['WebSearch', 'rust tokio'],
      ['WebFetch', 'https://docs.rs'],
      ['Memory', 'agent ctx'],
      ['Git', 'git status'],
      ['ImageGen', 'mountains'],
    ];

    it.each(iconCases)('renders without error for displayName "%s"', (displayName, displayArgs) => {
      const entry: ToolLabelEntry = { ...baseEntry, id: displayName, displayName, displayArgs };
      const { container } = render(<ToolLabel entry={entry} />);
      expect(container.firstChild).toBeTruthy();
      expect(screen.getByText(displayName)).toBeInTheDocument();
    });

    it('renders with Wrench icon for unknown displayName (fallback)', () => {
      const entry: ToolLabelEntry = {
        ...baseEntry,
        displayName: 'my_custom_tool',
        displayArgs: '',
      };
      const { container } = render(<ToolLabel entry={entry} />);
      // Should not throw — component renders the Wrench fallback icon
      expect(container.firstChild).toBeTruthy();
      expect(screen.getByText('my_custom_tool')).toBeInTheDocument();
    });
  });

  describe('layout and base classes', () => {
    it('applies font-mono and text-xs classes to the root element', () => {
      const { container } = render(<ToolLabel entry={baseEntry} />);
      const root = container.firstChild as HTMLElement;
      expect(root).toHaveClass('font-mono');
      expect(root).toHaveClass('text-xs');
    });
  });
});
