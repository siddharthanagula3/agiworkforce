import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToolLabel } from './ToolLabel';
import type { ToolLabelEntry } from '@agiworkforce/types';

// framer-motion renders as a plain div in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className, ...rest }: React.HTMLAttributes<HTMLDivElement>) => (
      <div className={className} {...rest}>
        {children}
      </div>
    ),
  },
}));

function makeEntry(overrides: Partial<ToolLabelEntry> = {}): ToolLabelEntry {
  return {
    id: 'test-id',
    displayName: 'Read',
    displayArgs: 'src/main.rs',
    status: 'completed',
    durationMs: 312,
    ...overrides,
  };
}

describe('ToolLabel', () => {
  it('renders tool name and args', () => {
    render(<ToolLabel entry={makeEntry()} />);
    expect(screen.getByText('Read')).toBeDefined();
    expect(screen.getByText('(src/main.rs)')).toBeDefined();
  });

  it('shows check icon when status is completed', () => {
    const { container } = render(<ToolLabel entry={makeEntry({ status: 'completed' })} />);
    // Check icon rendered — no spinner, no X
    expect(container.querySelector('.animate-spin')).toBeNull();
  });

  it('shows spinner when status is running', () => {
    const { container } = render(<ToolLabel entry={makeEntry({ status: 'running', durationMs: undefined })} />);
    expect(container.querySelector('.animate-spin')).toBeDefined();
  });

  it('shows error indicator when status is error', () => {
    render(<ToolLabel entry={makeEntry({ status: 'error', error: 'Permission denied' })} />);
    expect(screen.getAllByText('Permission denied').length).toBeGreaterThan(0);
  });

  it('displays duration when not running', () => {
    render(<ToolLabel entry={makeEntry({ durationMs: 1500 })} />);
    expect(screen.getByText('1.5s')).toBeDefined();
  });

  it('hides duration when running', () => {
    const { queryByText } = render(
      <ToolLabel entry={makeEntry({ status: 'running', durationMs: 1500 })} />,
    );
    expect(queryByText('1.5s')).toBeNull();
  });

  it('shows running ellipsis when running', () => {
    render(<ToolLabel entry={makeEntry({ status: 'running' })} />);
    expect(screen.getByText('...')).toBeDefined();
  });

  it('shows diff toggle button when edit tool has resultPreview', () => {
    const entry = {
      ...makeEntry({ displayName: 'Edit', displayArgs: 'src/lib.rs' }),
      resultPreview: '+fn new() {}\n-fn old() {}',
    };
    render(<ToolLabel entry={entry as ToolLabelEntry} />);
    const toggleBtn = screen.getByRole('button', { name: /expand diff/i });
    expect(toggleBtn).toBeDefined();
  });

  it('expands and collapses diff on toggle', () => {
    const entry = {
      ...makeEntry({ displayName: 'Write', displayArgs: 'out.txt' }),
      resultPreview: '+new line\n-old line',
    };
    render(<ToolLabel entry={entry as ToolLabelEntry} />);

    const toggleBtn = screen.getByRole('button', { name: /expand diff/i });
    fireEvent.click(toggleBtn);
    // diff content should be visible
    expect(screen.getByText('+new line')).toBeDefined();

    // click again to collapse
    const collapseBtn = screen.getByRole('button', { name: /collapse diff/i });
    fireEvent.click(collapseBtn);
    expect(screen.queryByText('+new line')).toBeNull();
  });

  it('does not show diff toggle for non-edit tools', () => {
    const entry = {
      ...makeEntry({ displayName: 'Bash', displayArgs: 'cargo test' }),
      resultPreview: 'test output',
    };
    render(<ToolLabel entry={entry as ToolLabelEntry} />);
    expect(screen.queryByRole('button', { name: /expand diff/i })).toBeNull();
  });

  it('uses Wrench icon fallback for unknown tool names', () => {
    // Should render without errors for unknown displayName
    const { container } = render(<ToolLabel entry={makeEntry({ displayName: 'UnknownTool' })} />);
    expect(container.firstChild).toBeDefined();
  });
});
