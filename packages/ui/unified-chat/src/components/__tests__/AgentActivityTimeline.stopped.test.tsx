import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentActivityTimeline } from '../AgentActivityTimeline';
import type { AgentActivityEntry, AgentActivityState } from '@agiworkforce/client-runtime';

afterEach(cleanup);

const PREPARING_PLACEHOLDER: AgentActivityEntry = {
  kind: 'progress',
  id: 'progress:preparing',
  progressId: 'preparing',
  summary: 'Preparing',
  status: 'cancelled',
  startedAtMs: 1_100,
  completedAtMs: 1_500,
};

function stoppedRun(entries: AgentActivityEntry[]): AgentActivityState {
  return {
    schemaVersion: 1,
    sessionId: 'session-1',
    turnId: 'turn-1',
    lastSequence: 2,
    status: 'cancelled',
    startedAtMs: 1_000,
    updatedAtMs: 1_500,
    completedAtMs: 1_500,
    entries,
  };
}

describe('a run the user stopped', () => {
  it('renders nothing when the turn was stopped before it did any work', () => {
    const { container } = render(
      <AgentActivityTimeline activity={stoppedRun([PREPARING_PLACEHOLDER])} />,
    );

    expect(container.querySelector('section')).toBeNull();
    expect(screen.queryByText('Preparing')).toBeNull();
  });

  it('never labels a stopped run with the placeholder it was started under', () => {
    render(
      <AgentActivityTimeline
        activity={stoppedRun([
          {
            kind: 'progress',
            id: 'progress:reading',
            progressId: 'reading',
            summary: 'Reading the brief',
            status: 'completed',
            startedAtMs: 1_050,
            completedAtMs: 1_200,
          },
          PREPARING_PLACEHOLDER,
        ])}
      />,
    );

    const trigger = screen.getByRole('button', { name: /show agent activity/i });
    expect(trigger.textContent).toContain('Reading the brief');
    expect(trigger.textContent).not.toContain('Preparing');
  });

  it('falls back to Stopped when no entry carries a summary of its own', () => {
    render(
      <AgentActivityTimeline
        activity={stoppedRun([
          PREPARING_PLACEHOLDER,
          {
            kind: 'error',
            id: 'error:local:1500',
            message: 'The connection closed.',
            emittedAtMs: 1_500,
          },
        ])}
      />,
    );

    const trigger = screen.getByRole('button', { name: /show agent activity/i });
    expect(trigger.textContent).toContain('Stopped');
    expect(trigger.textContent).not.toContain('Preparing');
  });

  it('draws a stopped run with the neutral glyph, never the danger one', () => {
    const { container } = render(
      <AgentActivityTimeline
        activity={stoppedRun([
          {
            kind: 'progress',
            id: 'progress:reading',
            progressId: 'reading',
            summary: 'Reading the brief',
            status: 'completed',
            startedAtMs: 1_050,
            completedAtMs: 1_200,
          },
          PREPARING_PLACEHOLDER,
        ])}
      />,
    );

    expect(container.querySelector('.text-danger')).toBeNull();
    expect(container.querySelector('.text-muted-foreground')).not.toBeNull();
  });
});
