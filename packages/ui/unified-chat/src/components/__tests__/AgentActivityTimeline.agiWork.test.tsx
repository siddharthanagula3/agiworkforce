import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentActivityTimeline } from '../AgentActivityTimeline';
import type { AgentActivityState } from '@agiworkforce/client-runtime';

afterEach(cleanup);

function runningRun(overrides: Partial<AgentActivityState> = {}): AgentActivityState {
  return {
    schemaVersion: 1,
    sessionId: 'session-1',
    turnId: 'turn-1',
    lastSequence: 4,
    status: 'running',
    startedAtMs: 1_000,
    updatedAtMs: 1_900,
    entries: [
      {
        kind: 'progress',
        id: 'progress:agiwork:plan:agiwork-plan-1',
        progressId: 'agiwork:plan:agiwork-plan-1',
        summary: '1. I will check each vendor pricing page and summarise the tiers.',
        status: 'completed',
        startedAtMs: 1_050,
      },
      {
        kind: 'progress',
        id: 'progress:agiwork:plan:agiwork-plan-2',
        progressId: 'agiwork:plan:agiwork-plan-2',
        summary: '2. Draft the comparison table.',
        status: 'completed',
        startedAtMs: 1_060,
      },
      {
        kind: 'tool',
        id: 'tool:search-1',
        toolCallId: 'search-1',
        name: 'web_search',
        category: 'web-search',
        summary: 'Searching official sources',
        status: 'running',
        startedAtMs: 1_100,
      },
    ],
    ...overrides,
  };
}

function triggerText(): string {
  return screen.getByRole('button', { name: /agent activity/i }).textContent ?? '';
}

// ChatGPT Work and Claude Cowork both report an autonomous run as elapsed time,
// not as the latest step label; ours only had the completed half of that.
describe('AgentActivityTimeline in AGI Work', () => {
  it('counts the run up live, one second at a time, with no spinner glyph', () => {
    vi.useFakeTimers();
    vi.setSystemTime(4_000);
    try {
      render(<AgentActivityTimeline activity={runningRun()} workMode="agiwork" />);

      expect(triggerText()).toContain('Working for 3s');
      expect(
        screen.getByRole('button', { name: /agent activity/i }).querySelector('.animate-spin'),
      ).toBeNull();

      act(() => {
        vi.advanceTimersByTime(2_000);
      });
      expect(triggerText()).toContain('Working for 5s');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the latest step label and its spinner for an ordinary chat turn', () => {
    vi.useFakeTimers();
    vi.setSystemTime(4_000);
    try {
      render(<AgentActivityTimeline activity={runningRun()} />);

      expect(triggerText()).not.toContain('Working for');
      expect(triggerText()).toContain('Searching official sources');
      expect(
        screen.getByRole('button', { name: /agent activity/i }).querySelector('.animate-spin'),
      ).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the model's plan sentence under the counter, without its ordinal", () => {
    render(<AgentActivityTimeline activity={runningRun()} workMode="agiwork" />);

    const plan = screen.getByTestId('agi-work-plan-sentence');
    expect(plan.textContent).toBe('I will check each vendor pricing page and summarise the tiers.');
  });

  it('prints the plan sentence once, not again as an activity row', () => {
    render(<AgentActivityTimeline activity={runningRun()} workMode="agiwork" />);

    expect(
      screen.getAllByText(/I will check each vendor pricing page and summarise the tiers\./),
    ).toHaveLength(1);
    expect(screen.getByText('2. Draft the comparison table.')).not.toBeNull();
  });

  it('shows no plan line when the run streamed no plan', () => {
    render(
      <AgentActivityTimeline
        activity={runningRun({ entries: [runningRun().entries[2]!] })}
        workMode="agiwork"
      />,
    );

    expect(screen.queryByTestId('agi-work-plan-sentence')).toBeNull();
  });

  it('settles on the elapsed total when the run completes, even for a search-only run', () => {
    render(
      <AgentActivityTimeline
        activity={runningRun({
          status: 'completed',
          completedAtMs: 76_000,
          entries: [
            {
              kind: 'tool',
              id: 'tool:search-1',
              toolCallId: 'search-1',
              name: 'web_search',
              category: 'web-search',
              summary: 'Searched the web',
              status: 'completed',
              startedAtMs: 1_100,
            },
          ],
        })}
        workMode="agiwork"
      />,
    );

    expect(triggerText()).toContain('Worked for 1m 15s');
  });
});
