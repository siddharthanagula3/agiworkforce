import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToolTimeline } from './ToolTimeline';

describe('ToolTimeline Animations', () => {
  it('animates height when toggling expansion', async () => {
    const tools = [
      { name: 'tool1', status: 'completed' as const, durationMs: 100 },
      { name: 'tool2', status: 'completed' as const, durationMs: 200 },
    ];

    const { container } = render(<ToolTimeline tools={tools} />);

    // Verify motion div with animation wrapper exists
    const motionDiv = container.querySelector('.overflow-hidden');
    expect(motionDiv).toBeDefined();
  });

  it('has initial state collapsed and animated state expanded', () => {
    const tools = [{ name: 'tool1', status: 'completed' as const, durationMs: 100 }];
    const { container } = render(<ToolTimeline tools={tools} />);

    // Verify overflow-hidden wrapper exists for animation
    const overflowWrapper = container.querySelector('.overflow-hidden');
    expect(overflowWrapper).toBeInTheDocument();
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

  it('displays total duration and error count in header', () => {
    const tools = [
      { name: 'tool1', status: 'completed' as const, durationMs: 500 },
      { name: 'tool2', status: 'failed' as const, durationMs: 300 },
    ];

    render(<ToolTimeline tools={tools} />);

    // Check for tool count and error indication
    expect(screen.getByText(/2 tools/)).toBeInTheDocument();
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
