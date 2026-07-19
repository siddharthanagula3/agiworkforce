import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentActivityTimeline } from '../AgentActivityTimeline';
import type { AgentActivityState } from '@agiworkforce/client-runtime';

afterEach(cleanup);

function activity(overrides: Partial<AgentActivityState> = {}): AgentActivityState {
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
        kind: 'tool',
        id: 'tool:search-1',
        toolCallId: 'search-1',
        name: 'web_search',
        category: 'web-search',
        summary: 'Searching official sources',
        status: 'running',
        input: { query: 'agent documentation' },
        startedAtMs: 1_100,
        query: 'agent documentation',
        sources: [
          {
            url: 'https://example.com/docs',
            title: 'Official agent documentation',
            snippet: 'Primary source',
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('AgentActivityTimeline', () => {
  it('auto-expands a running run live and collapses on a manual toggle', () => {
    // Claude/ChatGPT behaviour: while the run is active the timeline streams its
    // steps live (expanded), not a single collapsed summary line.
    render(<AgentActivityTimeline activity={activity()} nowMs={2_000} />);

    const trigger = screen.getByRole('button', { name: /hide agent activity/i });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.textContent).toContain('Searching official sources');
    expect(screen.getByText('Official agent documentation')).toBeTruthy();
    expect(screen.getByText('example.com')).toBeTruthy();

    // The user can still collapse it mid-run.
    fireEvent.click(trigger);
    const collapsed = screen.getByRole('button', { name: /show agent activity/i });
    expect(collapsed.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Official agent documentation')).toBeNull();
  });

  it('collapses a completed run to its summary pill', () => {
    render(
      <AgentActivityTimeline
        activity={activity({ status: 'completed', completedAtMs: 2_000 })}
        nowMs={3_000}
      />,
    );
    const trigger = screen.getByRole('button', { name: /show agent activity/i });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Official agent documentation')).toBeNull();
  });

  it('wires approval actions to the canonical tool call id', () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    const pending = activity({
      status: 'awaiting-approval',
      entries: [
        {
          kind: 'tool',
          id: 'tool:shell-1',
          toolCallId: 'shell-1',
          name: 'shell',
          category: 'shell',
          summary: 'Install the document library',
          status: 'awaiting-approval',
          input: { command: 'package-manager install document-library' },
          startedAtMs: 1_100,
          approval: { id: 'approval-1', riskLevel: 'medium' },
        },
      ],
    });

    render(
      <AgentActivityTimeline
        activity={pending}
        defaultExpanded
        onApprove={onApprove}
        onReject={onReject}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

    expect(onApprove).toHaveBeenCalledWith('shell-1');
    expect(onReject).toHaveBeenCalledWith('shell-1');
  });

  it('shows completed artifacts and context compaction in the same spine', () => {
    const completed = activity({
      status: 'completed',
      completedAtMs: 3_500,
      stopReason: 'end-turn',
      entries: [
        {
          kind: 'context',
          id: 'context:2',
          summary: 'Context automatically compacted',
          beforeTokens: 90_000,
          afterTokens: 28_000,
          emittedAtMs: 2_000,
        },
        {
          kind: 'artifact',
          id: 'artifact:report-1',
          artifactId: 'report-1',
          name: 'research-report.html',
          mimeType: 'text/html',
          uri: '/api/files/report-1',
          sizeBytes: 4_096,
          emittedAtMs: 3_000,
        },
      ],
    });

    render(<AgentActivityTimeline activity={completed} defaultExpanded />);

    expect(screen.getByText('Context automatically compacted')).toBeTruthy();
    expect(screen.getByRole('link', { name: /research-report\.html/i }).getAttribute('href')).toBe(
      '/api/files/report-1',
    );
    expect(screen.getByText(/Done in 2\.5s/i)).toBeTruthy();
  });

  it('reveals long runs in bounded inline pages instead of mounting every step', () => {
    const entries: AgentActivityState['entries'] = Array.from({ length: 55 }, (_, index) => ({
      kind: 'progress' as const,
      id: `progress:${index + 1}`,
      progressId: `progress-${index + 1}`,
      summary: `Progress step ${index + 1}`,
      status: 'completed' as const,
      startedAtMs: 1_000 + index,
      completedAtMs: 1_100 + index,
    }));

    render(
      <AgentActivityTimeline
        activity={activity({ status: 'completed', completedAtMs: 4_000, entries })}
        defaultExpanded
      />,
    );

    expect(screen.queryByText('Progress step 1')).toBeNull();
    expect(screen.getByText('Progress step 55')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /show 15 earlier steps/i }));

    expect(screen.getByText('Progress step 1')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /show .* earlier steps/i })).toBeNull();
  });
});
