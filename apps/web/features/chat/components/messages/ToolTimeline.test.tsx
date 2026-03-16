import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToolTimeline } from './ToolTimeline';

// Mock framer-motion to avoid animation timing issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('ToolTimeline Animations', () => {
  it('animates and toggles visibility of tool content on header click', async () => {
    const tools = [
      { name: 'tool1', status: 'completed' as const, durationMs: 100 },
      { name: 'tool2', status: 'completed' as const, durationMs: 200 },
    ];

    render(<ToolTimeline tools={tools} />);

    // Initially, tool content should not be visible (collapsed state)
    expect(screen.queryByText('tool1')).not.toBeInTheDocument();
    expect(screen.queryByText('tool2')).not.toBeInTheDocument();

    // Click header to expand
    const button = screen.getByRole('button');
    fireEvent.click(button);

    // After click, tool content becomes visible
    await waitFor(() => {
      expect(screen.getByText('tool1')).toBeInTheDocument();
      expect(screen.getByText('tool2')).toBeInTheDocument();
    });

    // Click header again to collapse
    fireEvent.click(button);

    // Tool content disappears from DOM
    await waitFor(() => {
      expect(screen.queryByText('tool1')).not.toBeInTheDocument();
      expect(screen.queryByText('tool2')).not.toBeInTheDocument();
    });
  });

  it('toggles expansion on header click', async () => {
    const tools = [{ name: 'read-file', status: 'completed' as const, durationMs: 50 }];

    render(<ToolTimeline tools={tools} />);

    // Find and click the header button
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();

    fireEvent.click(button);

    // After click, the tool content should be visible
    await waitFor(() => {
      expect(screen.getByText('read-file')).toBeInTheDocument();
    });
  });

  it('auto-expands when tools are running', () => {
    const tools = [{ name: 'running-tool', status: 'running' as const }];

    render(<ToolTimeline tools={tools} />);

    // Tool content should be visible automatically due to running status
    expect(screen.getByText('Running tools...')).toBeInTheDocument();
  });

  it('displays header with tool count, duration, and error count', async () => {
    const tools = [
      { name: 'tool1', status: 'completed' as const, durationMs: 1500 },
      { name: 'tool2', status: 'failed' as const, durationMs: 500 },
    ];

    render(<ToolTimeline tools={tools} />);

    // Verify all three metrics are displayed in header
    expect(screen.getByText(/2 tools/)).toBeInTheDocument();
    expect(screen.getByText(/2\.0s total/)).toBeInTheDocument();
    expect(screen.getByText(/1 failed/)).toBeInTheDocument();
  });

  it('auto-expands when tools are running and overrides manual collapse', async () => {
    const tools = [{ name: 'running-tool', status: 'running' as const }];
    render(<ToolTimeline tools={tools} />);

    // Tool should be visible due to running status (auto-expanded)
    await waitFor(() => {
      expect(screen.getByText('running-tool')).toBeInTheDocument();
    });

    // Try to collapse by clicking header
    const button = screen.getByRole('button');
    fireEvent.click(button);

    // Should STILL be visible because running tools force expansion
    await waitFor(() => {
      expect(screen.getByText('running-tool')).toBeInTheDocument();
    });
  });

  it('returns null when no tools provided', () => {
    const { container } = render(<ToolTimeline tools={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('formats tool args correctly', () => {
    const tools = [
      { name: 'read', status: 'completed' as const, args: 'package.json', durationMs: 10 },
    ];

    render(<ToolTimeline tools={tools} />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(screen.getByText(/package.json/)).toBeInTheDocument();
  });

  it('displays parallel group indicator for parallel tools', () => {
    const tools = [
      { name: 'tool1', status: 'completed' as const, parallelGroup: 'group1' },
      { name: 'tool2', status: 'completed' as const, parallelGroup: 'group1' },
    ];

    render(<ToolTimeline tools={tools} />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    // Check for parallel indicator
    expect(screen.getByText('parallel')).toBeInTheDocument();
  });
});
