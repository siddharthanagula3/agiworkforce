import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MessageResearchState } from '@shared/stores/web-chat-store';

import { ResearchActivity } from './ResearchActivity';

function research(overrides: Partial<MessageResearchState> = {}): MessageResearchState {
  return {
    phase: 'searching',
    label: 'Searching the web',
    searches: 2,
    sources: 5,
    elapsedMs: 12_000,
    startedAt: '2026-08-05T10:00:00.000Z',
    ...overrides,
  };
}

/**
 * Research runs are bounded by an iteration and a search cap that the loop has
 * always enforced (`totalSearches >= maxSearches`) and never reported. A count
 * that simply stops climbing looks like the run gave up; showing it against
 * the cap says the budget is spent.
 */
describe('ResearchActivity budget', () => {
  it('shows searches against the cap while the run can still spend it', () => {
    render(
      <ResearchActivity
        isStreaming
        research={research({ searches: 4, maxSearches: 12, iteration: 2, maxIterations: 6 })}
      />,
    );

    expect(screen.getByText(/4 of 12 searches/)).toBeInTheDocument();
    expect(screen.getByText(/round 2 of 6/)).toBeInTheDocument();
  });

  it('drops the cap once the run is finished', () => {
    // On a completed run the total is the interesting number; "4 of 12" would
    // imply the run stopped short of something it was still allowed to do.
    render(
      <ResearchActivity
        isStreaming={false}
        research={research({
          phase: 'complete',
          searches: 4,
          maxSearches: 12,
          iteration: 6,
          maxIterations: 6,
        })}
      />,
    );

    expect(screen.getByText(/4 searches/)).toBeInTheDocument();
    expect(screen.queryByText(/of 12/)).toBeNull();
    expect(screen.queryByText(/round/)).toBeNull();
  });

  it('falls back to a bare count when the server reported no cap', () => {
    // Older runs, and any path that does not emit max_searches.
    render(<ResearchActivity isStreaming research={research({ searches: 3 })} />);

    expect(screen.getByText(/3 searches/)).toBeInTheDocument();
    expect(screen.queryByText(/ of /)).toBeNull();
  });
});

describe('ResearchActivity plan queue', () => {
  it('renders each planned step with the status the server reported', () => {
    render(
      <ResearchActivity
        isStreaming
        research={research({
          steps: [
            { id: 'plan-1', type: 'search', description: 'alpha query', status: 'completed' },
            { id: 'plan-2', type: 'search', description: 'beta query', status: 'running' },
            { id: 'plan-3', type: 'search', description: 'gamma query', status: 'pending' },
          ],
        })}
      />,
    );

    const steps = screen.getAllByTestId('research-plan-step');
    expect(steps.map((step) => step.getAttribute('data-status'))).toEqual([
      'completed',
      'running',
      'pending',
    ]);
    expect(screen.getByText('alpha query')).toBeInTheDocument();
    expect(screen.getByText('gamma query')).toBeInTheDocument();
  });

  it('renders no plan list when the run reported no steps', () => {
    render(<ResearchActivity isStreaming research={research()} />);
    expect(screen.queryByTestId('research-plan')).not.toBeInTheDocument();
  });

  it('keeps reporting the run-level header alongside the plan', () => {
    render(
      <ResearchActivity
        isStreaming
        research={research({
          steps: [{ id: 'plan-1', type: 'search', description: 'alpha', status: 'running' }],
        })}
      />,
    );
    expect(screen.getByTestId('research-activity')).toHaveTextContent('Searching the web');
    expect(screen.getByTestId('research-activity')).toHaveTextContent('2 searches · 5 sources');
  });
});

describe('ResearchActivity retry', () => {
  it('offers Retry for a failed run and dispatches it once', async () => {
    const onRetry = vi.fn();
    render(
      <ResearchActivity
        isStreaming={false}
        research={research({ phase: 'error', label: 'Research failed' })}
        onRetry={onRetry}
      />,
    );

    await userEvent.click(screen.getByTestId('research-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('offers Retry for an interrupted run', () => {
    render(
      <ResearchActivity
        isStreaming={false}
        research={research({ phase: 'interrupted' })}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByTestId('research-retry')).toBeInTheDocument();
  });

  it('never offers Retry for a run that succeeded or is still going', () => {
    const { rerender } = render(
      <ResearchActivity
        isStreaming={false}
        research={research({ phase: 'complete' })}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('research-retry')).not.toBeInTheDocument();

    rerender(
      <ResearchActivity
        isStreaming
        research={research({ phase: 'searching' })}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('research-retry')).not.toBeInTheDocument();
  });

  it('renders no Retry control when the surface cannot send', () => {
    render(<ResearchActivity isStreaming={false} research={research({ phase: 'error' })} />);
    expect(screen.queryByTestId('research-retry')).not.toBeInTheDocument();
  });

  it('disables the control while a retry is already in flight', async () => {
    const onRetry = vi.fn();
    render(
      <ResearchActivity
        isStreaming={false}
        research={research({ phase: 'error' })}
        onRetry={onRetry}
        isRetrying
      />,
    );

    const button = screen.getByTestId('research-retry');
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onRetry).not.toHaveBeenCalled();
  });
});
