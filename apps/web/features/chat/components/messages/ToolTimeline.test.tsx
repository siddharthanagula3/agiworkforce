import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ToolTimeline } from './ToolTimeline';

// Mock framer-motion to avoid animation timing issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div className={className} {...props}>
        {children}
      </div>
    ),
    span: ({ children, className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
      <span className={className} {...props}>
        {children}
      </span>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ─── Expand / collapse ────────────────────────────────────────────────────────

describe('ToolTimeline — expand and collapse', () => {
  it('starts collapsed when no tools are running', () => {
    const tools = [
      { name: 'tool1', status: 'completed' as const, durationMs: 100 },
      { name: 'tool2', status: 'completed' as const, durationMs: 200 },
    ];

    render(<ToolTimeline tools={tools} />);

    expect(screen.queryByText('tool1')).not.toBeInTheDocument();
    expect(screen.queryByText('tool2')).not.toBeInTheDocument();
  });

  it('expands on header click and collapses again', async () => {
    const tools = [
      { name: 'tool1', status: 'completed' as const, durationMs: 100 },
      { name: 'tool2', status: 'completed' as const, durationMs: 200 },
    ];

    render(<ToolTimeline tools={tools} />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('tool1')).toBeInTheDocument();
      expect(screen.getByText('tool2')).toBeInTheDocument();
    });

    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.queryByText('tool1')).not.toBeInTheDocument();
      expect(screen.queryByText('tool2')).not.toBeInTheDocument();
    });
  });

  it('single tool expands on click', async () => {
    const tools = [{ name: 'read-file', status: 'completed' as const, durationMs: 50 }];

    render(<ToolTimeline tools={tools} />);

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('read-file')).toBeInTheDocument();
    });
  });
});

// ─── Auto-expand / userForcedClosed ───────────────────────────────────────────

describe('ToolTimeline — auto-expand and userForcedClosed', () => {
  it('auto-expands while tools are running', () => {
    const tools = [{ name: 'running-tool', status: 'running' as const }];

    render(<ToolTimeline tools={tools} />);

    expect(screen.getByText('Running tools...')).toBeInTheDocument();
    expect(screen.getByText('running-tool')).toBeInTheDocument();
  });

  it('respects userForcedClosed — stays closed after manual collapse during run', async () => {
    const tools = [{ name: 'running-tool', status: 'running' as const }];
    const { rerender } = render(<ToolTimeline tools={tools} />);

    // Auto-expanded while running — ToolCallCard header renders the tool name
    expect(screen.getByText('running-tool')).toBeInTheDocument();

    // User collapses manually while running — click the ToolTimeline header button
    const headerButton = screen.getByRole('button', { name: /toggle tool timeline/i });
    fireEvent.click(headerButton);

    // Should disappear (userForcedClosed = true)
    await waitFor(() => {
      expect(screen.queryByText('running-tool')).not.toBeInTheDocument();
    });

    // Re-render with still-running tool — should stay closed
    rerender(<ToolTimeline tools={[{ name: 'running-tool', status: 'running' as const }]} />);

    await waitFor(() => {
      expect(screen.queryByText('running-tool')).not.toBeInTheDocument();
    });
  });

  it('clears userForcedClosed when running tools finish', async () => {
    const tools = [{ name: 'running-tool', status: 'running' as const }];
    const { rerender } = render(<ToolTimeline tools={tools} />);

    // Force close while running
    const headerButton = screen.getByRole('button', { name: /toggle tool timeline/i });
    fireEvent.click(headerButton);

    await waitFor(() => {
      expect(screen.queryByText('running-tool')).not.toBeInTheDocument();
    });

    // Tools finish — transition to completed
    await act(async () => {
      rerender(
        <ToolTimeline
          tools={[{ name: 'running-tool', status: 'completed' as const, durationMs: 500 }]}
        />,
      );
    });

    // After finish, userForcedClosed should be cleared — manually expand should work
    const updatedButton = screen.getByRole('button', { name: /toggle tool timeline/i });
    fireEvent.click(updatedButton);

    await waitFor(() => {
      expect(screen.getByText('running-tool')).toBeInTheDocument();
    });
  });
});

// ─── Header labels ────────────────────────────────────────────────────────────

describe('ToolTimeline — header metadata', () => {
  it('displays tool count, total duration, and error count', () => {
    const tools = [
      { name: 'tool1', status: 'completed' as const, durationMs: 1500 },
      { name: 'tool2', status: 'failed' as const, durationMs: 500 },
    ];

    render(<ToolTimeline tools={tools} />);

    expect(screen.getByText(/2 tools/)).toBeInTheDocument();
    expect(screen.getByText(/2\.0s total/)).toBeInTheDocument();
    expect(screen.getByText(/1 failed/)).toBeInTheDocument();
  });

  it('shows "Running tools..." header when a tool is running', () => {
    render(<ToolTimeline tools={[{ name: 'tool', status: 'running' as const }]} />);
    expect(screen.getByText('Running tools...')).toBeInTheDocument();
  });

  it('omits duration when none provided', () => {
    render(<ToolTimeline tools={[{ name: 'quick', status: 'completed' as const }]} />);
    expect(screen.queryByText(/total/)).not.toBeInTheDocument();
  });
});

// ─── ToolCallCard rendering ───────────────────────────────────────────────────

describe('ToolTimeline — ToolCallCard rendering', () => {
  it('renders ToolCallCard with tool name when expanded', async () => {
    const tools = [{ name: 'WebSearch', status: 'completed' as const, durationMs: 300 }];
    render(<ToolTimeline tools={tools} />);

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('WebSearch')).toBeInTheDocument();
    });
  });

  it('renders args as parameters in ToolCallCard', async () => {
    const tools = [
      { name: 'Read', status: 'completed' as const, args: 'package.json', durationMs: 10 },
    ];

    render(<ToolTimeline tools={tools} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('Read')).toBeInTheDocument();
    });
  });
});

// ─── Parallel groups ──────────────────────────────────────────────────────────

describe('ToolTimeline — parallel groups', () => {
  it('shows parallel group indicator for tools sharing a parallelGroup key', async () => {
    const tools = [
      { name: 'tool1', status: 'completed' as const, parallelGroup: 'g1' },
      { name: 'tool2', status: 'completed' as const, parallelGroup: 'g1' },
    ];

    render(<ToolTimeline tools={tools} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('parallel')).toBeInTheDocument();
    });
  });

  it('does not show parallel indicator for a single-entry group', async () => {
    const tools = [{ name: 'solo', status: 'completed' as const, parallelGroup: 'g1' }];

    render(<ToolTimeline tools={tools} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.queryByText('parallel')).not.toBeInTheDocument();
    });
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('ToolTimeline — edge cases', () => {
  it('returns null when no tools are provided', () => {
    const { container } = render(<ToolTimeline tools={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a single pending tool correctly', async () => {
    const tools = [{ name: 'pending-tool', status: 'pending' as const }];
    render(<ToolTimeline tools={tools} />);

    // Not auto-expanded for pending
    expect(screen.queryByText('pending-tool')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('pending-tool')).toBeInTheDocument();
    });
  });

  it('renders error status correctly', async () => {
    const tools = [{ name: 'bad-tool', status: 'failed' as const, error: 'timeout exceeded' }];
    render(<ToolTimeline tools={tools} />);

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('bad-tool')).toBeInTheDocument();
    });
    expect(screen.getByText(/1 failed/)).toBeInTheDocument();
  });
});
