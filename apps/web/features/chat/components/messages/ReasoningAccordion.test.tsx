import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ReasoningAccordion } from './ReasoningAccordion';

// Mock framer-motion so animation transitions are synchronous in tests
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

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Find the content area (the pre-formatted div inside the expanded body). */
function queryContentText(text: string) {
  // The whitespace-pre-wrap div is the content container — use a partial match
  return screen.queryByText((content) => content.includes(text), {
    selector: 'div.whitespace-pre-wrap',
  });
}

// ─── Empty / guard ────────────────────────────────────────────────────────────

describe('ReasoningAccordion — null guard', () => {
  it('renders nothing when steps is empty and not streaming', () => {
    const { container } = render(<ReasoningAccordion steps={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders accordion header when streaming even with no steps yet', () => {
    render(<ReasoningAccordion steps={[]} isStreaming />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});

// ─── Collapsed header labels ──────────────────────────────────────────────────

describe('ReasoningAccordion — collapsed header', () => {
  it('shows "Thought about this" fallback when all step lines are under 15 chars', () => {
    // Both lines are short enough to be filtered out (< 15 chars)
    render(<ReasoningAccordion steps={['ok', 'yep']} isStreaming={false} />);
    expect(screen.getByText('Thought about this')).toBeInTheDocument();
  });

  it('shows "Thought for Xs" when durationMs is provided and not streaming', () => {
    render(
      <ReasoningAccordion steps={['thinking step one']} isStreaming={false} durationMs={3200} />,
    );
    expect(screen.getByText('Thought for 3.2s')).toBeInTheDocument();
  });

  it('shows "Thinking..." summary in header when streaming', () => {
    render(<ReasoningAccordion steps={['...partial']} isStreaming />);
    expect(screen.getByText('Thinking...')).toBeInTheDocument();
  });

  it('extracts topic summary from first line matching a known pattern', () => {
    const steps = ['Let me analyze the user request carefully before answering.'];
    render(<ReasoningAccordion steps={steps} isStreaming={false} />);
    // The full sentence fits within 80 chars so appears verbatim in the header
    expect(
      screen.getByText('Let me analyze the user request carefully before answering.'),
    ).toBeInTheDocument();
  });

  it('truncates long summary lines to ~80 chars', () => {
    const long = 'I need to ' + 'x'.repeat(200);
    render(<ReasoningAccordion steps={[long]} isStreaming={false} />);
    const label = screen.getByText(/I need to/);
    // Should be truncated — original is >200 chars, capped at 77 + '...' = 80
    expect((label.textContent ?? '').length).toBeLessThanOrEqual(83);
  });
});

// ─── Expand / collapse ────────────────────────────────────────────────────────

describe('ReasoningAccordion — expand and collapse', () => {
  it('starts closed — expanded content body not visible until click', () => {
    const steps = ['Let me reason through the problem here.'];
    render(<ReasoningAccordion steps={steps} isStreaming={false} />);

    // Button should report closed
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
    // The content text should not appear in the body (only the summary in the header)
    // queryContentText looks inside the whitespace-pre-wrap container
    expect(queryContentText('Let me reason through the problem here.')).not.toBeInTheDocument();
  });

  it('expands on button click — content body appears', async () => {
    const steps = ['Let me reason through the problem here.'];
    render(<ReasoningAccordion steps={steps} isStreaming={false} />);

    const btn = screen.getByRole('button');
    fireEvent.click(btn);

    await waitFor(() => {
      expect(queryContentText('Let me reason through the problem here.')).toBeInTheDocument();
    });
  });

  it('collapses when clicking an open accordion', async () => {
    const steps = ['I need to answer this question step by step.'];
    render(<ReasoningAccordion steps={steps} isStreaming={false} />);

    const btn = screen.getByRole('button');

    // Open
    fireEvent.click(btn);
    await waitFor(() => {
      expect(queryContentText('I need to answer this question step by step.')).toBeInTheDocument();
    });

    // Close
    fireEvent.click(btn);
    await waitFor(() => {
      expect(
        queryContentText('I need to answer this question step by step.'),
      ).not.toBeInTheDocument();
    });
  });

  it('aria-expanded reflects open state', () => {
    render(<ReasoningAccordion steps={['step content here']} isStreaming={false} />);
    const btn = screen.getByRole('button');

    expect(btn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
  });
});

// ─── Auto-expand / hasUserCollapsed ──────────────────────────────────────────

describe('ReasoningAccordion — auto-expand during streaming', () => {
  it('auto-expands when isStreaming transitions from false to true', async () => {
    const { rerender } = render(
      <ReasoningAccordion steps={['thinking in progress...']} isStreaming={false} />,
    );

    // Initially closed
    expect(queryContentText('thinking in progress...')).not.toBeInTheDocument();

    await act(async () => {
      rerender(<ReasoningAccordion steps={['thinking in progress...']} isStreaming />);
    });

    await waitFor(() => {
      expect(queryContentText('thinking in progress...')).toBeInTheDocument();
    });
  });

  it('starts open when initially rendered with isStreaming=true', () => {
    render(<ReasoningAccordion steps={['step one content here']} isStreaming />);
    // isOpen initializes to true (matches isStreaming)
    expect(queryContentText('step one content here')).toBeInTheDocument();
  });

  it('respects manual collapse during streaming (hasUserCollapsed)', async () => {
    const { rerender } = render(
      <ReasoningAccordion steps={['active step content here']} isStreaming />,
    );

    expect(queryContentText('active step content here')).toBeInTheDocument();

    // User collapses manually
    const btn = screen.getByRole('button');
    fireEvent.click(btn);

    await waitFor(() => {
      expect(queryContentText('active step content here')).not.toBeInTheDocument();
    });

    // More content streams in — should NOT re-expand
    await act(async () => {
      rerender(
        <ReasoningAccordion
          steps={['active step content here', 'new content arrived now']}
          isStreaming
        />,
      );
    });

    expect(queryContentText('new content arrived now')).not.toBeInTheDocument();
  });
});

// ─── Streaming visual cues ────────────────────────────────────────────────────

describe('ReasoningAccordion — streaming visual cues', () => {
  it('applies purple border when streaming', () => {
    render(<ReasoningAccordion steps={['step']} isStreaming />);
    const container = screen.getByRole('button').closest('div');
    expect(container?.className).toContain('border-purple-500/50');
  });

  it('applies zinc border when not streaming', () => {
    render(<ReasoningAccordion steps={['step content line here']} isStreaming={false} />);
    const container = screen.getByRole('button').closest('div');
    expect(container?.className).toContain('border-zinc-800');
  });
});

// ─── Multiple steps ───────────────────────────────────────────────────────────

describe('ReasoningAccordion — multiple steps', () => {
  it('joins multiple steps and shows them in the expanded body', async () => {
    const steps = ['Step one analysis done.', 'Step two: verify result here.'];
    render(<ReasoningAccordion steps={steps} isStreaming={false} />);

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(queryContentText('Step one analysis done.')).toBeInTheDocument();
      expect(queryContentText('Step two: verify result here.')).toBeInTheDocument();
    });
  });
});
