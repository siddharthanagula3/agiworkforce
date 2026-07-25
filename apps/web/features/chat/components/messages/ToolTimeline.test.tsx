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
  // AUDIT-FIX GOV-33: ToolTimeline now reads prefers-reduced-motion through
  // framer-motion (inline motion styles are out of reach of the global CSS
  // reset). The mock must export it or every render throws.
  useReducedMotion: () => false,
}));

// ─── Expand / collapse ────────────────────────────────────────────────────────

describe('ToolTimeline · expand and collapse', () => {
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

describe('ToolTimeline · auto-expand and userForcedClosed', () => {
  it('auto-expands while tools are running', () => {
    const tools = [{ name: 'running-tool', status: 'running' as const }];

    render(<ToolTimeline tools={tools} />);

    // Running header shows the running tool's statusPhrase, or the "Working..."
    // fallback when none is set (per the playful per-tool status phrase change).
    expect(screen.getByText('Working...')).toBeInTheDocument();
    expect(screen.getByText('running-tool')).toBeInTheDocument();
  });

  it('respects userForcedClosed · stays closed after manual collapse during run', async () => {
    const tools = [{ name: 'running-tool', status: 'running' as const }];
    const { rerender } = render(<ToolTimeline tools={tools} />);

    // Auto-expanded while running · ToolCallCard header renders the tool name
    expect(screen.getByText('running-tool')).toBeInTheDocument();

    // User collapses manually while running · click the ToolTimeline header button
    const headerButton = screen.getByRole('button', { name: /toggle tool timeline/i });
    fireEvent.click(headerButton);

    // Should disappear (userForcedClosed = true)
    await waitFor(() => {
      expect(screen.queryByText('running-tool')).not.toBeInTheDocument();
    });

    // Re-render with still-running tool · should stay closed
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

    // Tools finish · transition to completed
    await act(async () => {
      rerender(
        <ToolTimeline
          tools={[{ name: 'running-tool', status: 'completed' as const, durationMs: 500 }]}
        />,
      );
    });

    // After finish, userForcedClosed should be cleared · manually expand should work
    const updatedButton = screen.getByRole('button', { name: /toggle tool timeline/i });
    fireEvent.click(updatedButton);

    await waitFor(() => {
      expect(screen.getByText('running-tool')).toBeInTheDocument();
    });
  });
});

// ─── Header labels ────────────────────────────────────────────────────────────

describe('ToolTimeline · header metadata', () => {
  it('displays an action-phrased summary and error count in the header', () => {
    const tools = [
      { name: 'Read', status: 'completed' as const, durationMs: 1500 },
      { name: 'Bash', status: 'failed' as const, durationMs: 500 },
    ];

    render(<ToolTimeline tools={tools} />);

    // Header shows action summary (no "N tools" count, no duration)
    expect(screen.getByText(/read a file/i)).toBeInTheDocument();
    // Error count still displayed alongside the summary
    expect(screen.getByText(/1 failed/)).toBeInTheDocument();
  });

  it('shows the running status phrase (statusPhrase, else "Working...") when a tool is running', () => {
    render(<ToolTimeline tools={[{ name: 'tool', status: 'running' as const }]} />);
    expect(screen.getByText('Working...')).toBeInTheDocument();

    // When the running tool carries a statusPhrase, the header surfaces it.
    render(
      <ToolTimeline
        tools={[{ name: 'tool', status: 'running' as const, statusPhrase: 'Searching…' }]}
      />,
    );
    expect(screen.getByText('Searching…')).toBeInTheDocument();
  });

  it('omits duration from header (duration no longer shown in Claude-style header)', () => {
    render(
      <ToolTimeline tools={[{ name: 'Read', status: 'completed' as const, durationMs: 2000 }]} />,
    );
    // Duration is no longer in the header line per Claude reference design
    expect(screen.queryByText(/total/)).not.toBeInTheDocument();
  });
});

// ─── ToolCallCard rendering ───────────────────────────────────────────────────

describe('ToolTimeline · ToolCallCard rendering', () => {
  it('renders ToolCallCard with humanized label when expanded', async () => {
    // WebSearch is a known web-search tool id: humanized to "Web search" (no query args)
    const tools = [{ name: 'WebSearch', status: 'completed' as const, durationMs: 300 }];
    render(<ToolTimeline tools={tools} />);

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('Web search')).toBeInTheDocument();
    });
  });

  it('renders ToolCallCard with query as label when args provided for web search', async () => {
    const tools = [
      {
        name: 'web_search',
        status: 'completed' as const,
        args: 'best resume templates 2025',
        durationMs: 300,
      },
    ];
    render(<ToolTimeline tools={tools} />);

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('best resume templates 2025')).toBeInTheDocument();
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

describe('ToolTimeline · parallel groups', () => {
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

describe('ToolTimeline · edge cases', () => {
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

  it('surfaces the failure reason on the tool card itself, not just the aggregate count', async () => {
    // Regression guard: ToolEntry.error is populated by useChatStream but was
    // previously dropped before reaching ToolCallCard — a failed tool showed
    // only "1 failed" with no indication of why. This asserts the actual
    // reason text is rendered, not just that a failure occurred.
    const tools = [{ name: 'bad-tool', status: 'failed' as const, error: 'timeout exceeded' }];
    render(<ToolTimeline tools={tools} />);

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText(/timeout exceeded/)).toBeInTheDocument();
    });
  });
});

// ─── Audit-trail lifecycle (Claude parity: live steps → collapsed trail) ──────

describe('ToolTimeline · audit-trail collapse lifecycle', () => {
  it('shows steps live while running, auto-collapses to a summary on completion, and re-expands on click', async () => {
    const running = [
      { name: 'Read', status: 'completed' as const, durationMs: 120 },
      { name: 'file_create', status: 'running' as const, statusPhrase: 'Creating file…' },
    ];
    const { rerender } = render(<ToolTimeline tools={running} />);

    // Live phase: auto-expanded, steps visible with the running status phrase
    expect(screen.getByText('Creating file…')).toBeInTheDocument();
    expect(screen.getByText('Read')).toBeInTheDocument();

    // All steps complete → the trail auto-collapses into the action-phrase summary
    const completed = [
      { name: 'Read', status: 'completed' as const, durationMs: 120 },
      { name: 'file_create', status: 'completed' as const, durationMs: 900 },
    ];
    await act(async () => {
      rerender(<ToolTimeline tools={completed} />);
    });
    expect(screen.queryByText('Read')).not.toBeInTheDocument();
    expect(screen.getByText(/read a file, created a file/i)).toBeInTheDocument();

    // Collapsed trail stays clickable: expanding restores the full step list
    fireEvent.click(screen.getByRole('button', { name: /toggle tool timeline/i }));
    await waitFor(() => {
      expect(screen.getByText('Read')).toBeInTheDocument();
      expect(screen.getByText('Done')).toBeInTheDocument();
    });

    // And collapses again on a second click
    fireEvent.click(screen.getByRole('button', { name: /toggle tool timeline/i }));
    await waitFor(() => {
      expect(screen.queryByText('Read')).not.toBeInTheDocument();
    });
  });
});

// ─── Manual tool-approval forwarding ──────────────────────────────────────────

describe('ToolTimeline · manual approval', () => {
  const awaitingTool = {
    id: 'entry-1',
    name: 'mcp__github__get_pull_request_diff',
    status: 'awaiting_approval' as const,
    toolCallId: 'call_1',
    requiresApproval: true,
    parameters: { owner: 'acme', repo: 'app', pull_number: 7 },
  };

  it('auto-expands and renders approve/reject for an awaiting_approval tool', () => {
    render(<ToolTimeline tools={[awaitingTool]} onApprove={() => {}} onReject={() => {}} />);
    // The card is visible without a manual expand click (timeline auto-opens).
    expect(screen.getByText('Approve')).toBeInTheDocument();
    expect(screen.getByText('Reject')).toBeInTheDocument();
  });

  it('calls onApprove with the exact tool_call_id', () => {
    const onApprove = vi.fn();
    render(<ToolTimeline tools={[awaitingTool]} onApprove={onApprove} onReject={() => {}} />);
    fireEvent.click(screen.getByText('Approve'));
    expect(onApprove).toHaveBeenCalledWith('call_1');
  });

  it('calls onReject with the exact tool_call_id', () => {
    const onReject = vi.fn();
    render(<ToolTimeline tools={[awaitingTool]} onApprove={() => {}} onReject={onReject} />);
    fireEvent.click(screen.getByText('Reject'));
    expect(onReject).toHaveBeenCalledWith('call_1');
  });
});

// ─── Expired approval (Finding 1: dead buttons after reload/restart) ────────

describe('ToolTimeline · expired approval', () => {
  const awaitingTool = {
    id: 'entry-1',
    name: 'mcp__github__get_pull_request_diff',
    status: 'awaiting_approval' as const,
    toolCallId: 'call_1',
    requiresApproval: true,
    parameters: { owner: 'acme', repo: 'app', pull_number: 7 },
  };

  it('renders an expired notice instead of live Approve/Reject buttons', () => {
    render(
      <ToolTimeline tools={[awaitingTool]} onApprove={() => {}} onReject={() => {}} expired />,
    );
    expect(screen.queryByText('Approve')).not.toBeInTheDocument();
    expect(screen.queryByText('Reject')).not.toBeInTheDocument();
    expect(screen.getByText(/this approval request expired/i)).toBeInTheDocument();
  });

  it('shows a Resend affordance when onResend is provided, and calls it', () => {
    const onResend = vi.fn();
    render(
      <ToolTimeline
        tools={[awaitingTool]}
        onApprove={() => {}}
        onReject={() => {}}
        expired
        onResend={onResend}
      />,
    );
    fireEvent.click(screen.getByText('Resend'));
    expect(onResend).toHaveBeenCalledWith('call_1');
  });

  it('falls back to text-only guidance with no Resend button when onResend is absent', () => {
    render(
      <ToolTimeline tools={[awaitingTool]} onApprove={() => {}} onReject={() => {}} expired />,
    );
    expect(screen.queryByText('Resend')).not.toBeInTheDocument();
    expect(screen.getByText(/send a new message to continue/i)).toBeInTheDocument();
  });

  it('does NOT show the expired notice when not expired (live buttons render as normal)', () => {
    render(<ToolTimeline tools={[awaitingTool]} onApprove={() => {}} onReject={() => {}} />);
    expect(screen.queryByText(/this approval request expired/i)).not.toBeInTheDocument();
    expect(screen.getByText('Approve')).toBeInTheDocument();
  });
});
