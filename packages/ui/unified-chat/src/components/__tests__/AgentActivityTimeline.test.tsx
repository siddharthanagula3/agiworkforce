import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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
  it('ticks a live Thinking label while a reasoning-delta run is in progress', () => {
    vi.useFakeTimers();
    vi.setSystemTime(4_000);
    try {
      const reasoning = activity({
        entries: [
          {
            kind: 'progress',
            id: 'progress:generation:1',
            progressId: 'generation',
            summary: 'Reasoning',
            status: 'running',
            startedAtMs: 1_000,
          },
        ],
      });

      render(<AgentActivityTimeline activity={reasoning} />);
      const trigger = screen.getByRole('button', { name: /agent activity/i });
      expect(trigger.textContent).toContain('Thinking · 3s');

      act(() => {
        vi.advanceTimersByTime(4_000);
      });
      expect(trigger.textContent).toContain('Thinking · 7s');
    } finally {
      vi.useRealTimers();
    }
  });

  it('switches off the Thinking label the moment a real content token arrives', () => {
    const writing = activity({
      entries: [
        {
          kind: 'progress',
          id: 'progress:generation:1',
          progressId: 'generation',
          summary: 'Writing response',
          status: 'running',
          startedAtMs: 1_000,
        },
      ],
    });

    render(<AgentActivityTimeline activity={writing} />);
    const trigger = screen.getByRole('button', { name: /agent activity/i });
    expect(trigger.textContent).toContain('Writing response');
    expect(trigger.textContent).not.toMatch(/Thinking/);
  });

  it('keeps the local pre-provider status compact until real activity arrives', () => {
    render(
      <AgentActivityTimeline
        activity={activity({
          lastSequence: -1,
          entries: [
            {
              kind: 'progress',
              id: 'progress:local-starting',
              progressId: 'local-starting',
              summary: 'Starting AGI Work',
              status: 'running',
              startedAtMs: 1_000,
            },
          ],
        })}
      />,
    );

    const trigger = screen.getByRole('button', { name: /show agent activity/i });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.textContent).toContain('Working');
    expect(screen.queryByText('Starting AGI Work')).toBeNull();

    fireEvent.click(trigger);
    expect(screen.getAllByText('Starting AGI Work')).toHaveLength(1);
  });

  it('shows Retrying instead of the generic local-start label for a silent retry', () => {
    render(
      <AgentActivityTimeline
        activity={activity({
          lastSequence: -1,
          entries: [
            {
              kind: 'progress',
              id: 'progress:local-starting',
              progressId: 'local-starting',
              summary: 'Retrying',
              status: 'running',
              startedAtMs: 1_000,
              isRetry: true,
            },
          ],
        })}
      />,
    );

    const trigger = screen.getByRole('button', { name: /agent activity/i });
    expect(trigger.textContent).toContain('Retrying');
    expect(trigger.textContent).not.toContain('Working');
  });

  it('reports a retry-only completed run instead of rendering nothing', () => {
    const completed = activity({
      lastSequence: -1,
      status: 'completed',
      startedAtMs: 1_000,
      completedAtMs: 4_000,
      entries: [
        {
          kind: 'progress',
          id: 'progress:local-starting',
          progressId: 'local-starting',
          summary: 'Retrying',
          status: 'completed',
          startedAtMs: 1_000,
          completedAtMs: 4_000,
          isRetry: true,
        },
      ],
    });

    render(<AgentActivityTimeline activity={completed} />);
    expect(screen.getByRole('button', { name: /show agent activity/i }).textContent).toContain(
      'Worked for 3s',
    );
  });

  it('auto-expands a running run live and collapses on a manual toggle', () => {
    render(<AgentActivityTimeline activity={activity()} />);

    const trigger = screen.getByRole('button', { name: /hide agent activity/i });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.textContent).toContain('Reading 1 source');
    expect(trigger.textContent).not.toMatch(/Working for|\bs\b · |Done in/i);
    expect(screen.getByText('Official agent documentation')).toBeTruthy();
    expect(screen.getByText('example.com')).toBeTruthy();

    fireEvent.click(trigger);
    const collapsed = screen.getByRole('button', { name: /show agent activity/i });
    expect(collapsed.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Official agent documentation')).toBeNull();
  });

  it('collapses a completed run to its summary pill', () => {
    render(
      <AgentActivityTimeline activity={activity({ status: 'completed', completedAtMs: 2_000 })} />,
    );
    const trigger = screen.getByRole('button', { name: /show agent activity/i });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Official agent documentation')).toBeNull();
    expect(trigger.textContent).toContain('Searched the web');
    expect(trigger.textContent).not.toContain('Searching official sources');
    expect(trigger.textContent).not.toMatch(/Done in/i);
  });

  it('summarizes a finished turn whose last entry is a completed web search as searched, not searching', () => {
    const completedSearch = activity({
      status: 'completed',
      completedAtMs: 2_000,
      entries: [
        {
          kind: 'tool',
          id: 'tool:search-1',
          toolCallId: 'search-1',
          name: 'web_search',
          category: 'web-search',
          summary: 'Searching the web',
          status: 'completed',
          startedAtMs: 1_100,
          completedAtMs: 1_500,
          sources: [
            { url: 'https://example.com/a', title: 'A' },
            { url: 'https://example.com/b', title: 'B' },
          ],
        },
      ],
    });

    render(<AgentActivityTimeline activity={completedSearch} />);
    const trigger = screen.getByRole('button', { name: /show agent activity/i });
    expect(trigger.textContent).toContain('Searched the web');
    expect(trigger.textContent).not.toContain('Searching the web');
  });

  it('phrases a stuck-running search entry as searched once the turn has stopped, even outcome-partial', () => {
    const stuckSearch = activity({
      status: 'partial',
      completedAtMs: 2_000,
      entries: [
        {
          kind: 'tool',
          id: 'tool:search-1',
          toolCallId: 'search-1',
          name: 'web_search',
          category: 'web-search',
          summary: 'Searching the web',
          status: 'running',
          startedAtMs: 1_100,
        },
      ],
    });

    render(<AgentActivityTimeline activity={stuckSearch} />);
    const trigger = screen.getByRole('button', { name: /show agent activity/i });
    expect(trigger.textContent).toContain('Searched the web');
    expect(trigger.textContent).not.toContain('Searching the web');
  });

  it('phrases a cancelled search entry as stopped, not searched', () => {
    const cancelledSearch = activity({
      status: 'cancelled',
      completedAtMs: 2_000,
      entries: [
        {
          kind: 'tool',
          id: 'tool:search-1',
          toolCallId: 'search-1',
          name: 'web_search',
          category: 'web-search',
          summary: 'Searching the web',
          status: 'cancelled',
          startedAtMs: 1_100,
          completedAtMs: 1_500,
          sources: [{ url: 'https://example.com/a', title: 'A' }],
        },
      ],
    });

    render(<AgentActivityTimeline activity={cancelledSearch} />);
    const trigger = screen.getByRole('button', { name: /show agent activity/i });
    expect(trigger.textContent).toContain('Search stopped');
    expect(trigger.textContent).not.toContain('Searched the web');
  });

  it('keeps a failed search entry on its own humanized failure summary', () => {
    const failedSearch = activity({
      status: 'failed',
      completedAtMs: 2_000,
      entries: [
        {
          kind: 'tool',
          id: 'tool:search-1',
          toolCallId: 'search-1',
          name: 'web_search',
          category: 'web-search',
          summary: 'The tool failed',
          status: 'failed',
          startedAtMs: 1_100,
          completedAtMs: 1_500,
          error: 'Fetch failed (timeout): the page took too long',
        },
      ],
    });

    render(<AgentActivityTimeline activity={failedSearch} />);
    const trigger = screen.getByRole('button', { name: /show agent activity/i });
    expect(trigger.textContent).toContain('The tool failed');
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

    expect(screen.getAllByText('Context automatically compacted').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /research-report\.html/i }).getAttribute('href')).toBe(
      '/api/files/report-1',
    );
    expect(screen.queryByText(/Done in/i)).toBeNull();
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
    expect(screen.getAllByText('Progress step 55').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /show 15 earlier steps/i }));

    expect(screen.getByText('Progress step 1')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /show .* earlier steps/i })).toBeNull();
  });

  it('shows a generic Working label for the first second after send', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_500);
    try {
      const starting = activity({
        startedAtMs: 1_000,
        entries: [
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
      });

      render(<AgentActivityTimeline activity={starting} />);
      const trigger = screen.getByRole('button', { name: /agent activity/i });
      expect(trigger.textContent).toContain('Working');
      expect(trigger.textContent).not.toContain('Searching');
    } finally {
      vi.useRealTimers();
    }
  });

  it('holds a phase label for about 400ms before replacing it with the next one', () => {
    vi.useFakeTimers();
    vi.setSystemTime(5_000);
    try {
      const writing = activity({
        startedAtMs: 1_000,
        entries: [
          {
            kind: 'progress',
            id: 'progress:generation:1',
            progressId: 'generation',
            summary: 'Writing response',
            status: 'running',
            startedAtMs: 4_000,
          },
        ],
      });
      const { rerender } = render(<AgentActivityTimeline activity={writing} />);
      const trigger = () => screen.getByRole('button', { name: /agent activity/i });
      expect(trigger().textContent).toContain('Writing response');

      const searching = activity({
        startedAtMs: 1_000,
        entries: [
          {
            kind: 'tool',
            id: 'tool:search-1',
            toolCallId: 'search-1',
            name: 'web_search',
            category: 'web-search',
            summary: 'Searching the web',
            status: 'running',
            startedAtMs: 5_000,
          },
        ],
      });
      rerender(<AgentActivityTimeline activity={searching} />);
      expect(trigger().textContent).toContain('Writing response');

      act(() => {
        vi.advanceTimersByTime(399);
      });
      expect(trigger().textContent).toContain('Writing response');

      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(trigger().textContent).toContain('Searching the web');
    } finally {
      vi.useRealTimers();
    }
  });

  it('collapses a completed run with no tools to a worked-for duration', () => {
    const completed = activity({
      status: 'completed',
      startedAtMs: 1_000,
      completedAtMs: 6_000,
      entries: [
        {
          kind: 'progress',
          id: 'progress:generation:1',
          progressId: 'generation',
          summary: 'Writing response',
          status: 'completed',
          startedAtMs: 1_200,
          completedAtMs: 6_000,
        },
      ],
    });

    render(<AgentActivityTimeline activity={completed} />);
    const trigger = screen.getByRole('button', { name: /show agent activity/i });
    expect(trigger.textContent).toContain('Worked for 5s');
  });

  it('folds the local connecting placeholder into the generic label once the window closes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(5_000);
    try {
      const connecting = activity({
        lastSequence: -1,
        startedAtMs: 1_000,
        entries: [
          {
            kind: 'progress',
            id: 'progress:local-starting',
            progressId: 'local-starting',
            summary: 'Connecting to a model',
            status: 'running',
            startedAtMs: 1_000,
          },
        ],
      });

      render(<AgentActivityTimeline activity={connecting} />);
      const trigger = screen.getByRole('button', { name: /agent activity/i });
      expect(trigger.textContent).toContain('Working');
      expect(trigger.textContent).not.toContain('Connecting');
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders nothing for a completed run whose only steps were local placeholders', () => {
    const completed = activity({
      lastSequence: -1,
      status: 'completed',
      startedAtMs: 1_000,
      completedAtMs: 3_000,
      entries: [
        {
          kind: 'progress',
          id: 'progress:local-starting',
          progressId: 'local-starting',
          summary: 'Response ready',
          status: 'completed',
          startedAtMs: 1_000,
          completedAtMs: 3_000,
        },
      ],
    });

    const { container } = render(<AgentActivityTimeline activity={completed} />);
    expect(container.textContent).toBe('');
  });

  it('reports minutes and seconds for a long completed run and never zero seconds', () => {
    const long = activity({
      status: 'completed',
      startedAtMs: 1_000,
      completedAtMs: 1_000 + 75_000,
      entries: [
        {
          kind: 'tool',
          id: 'tool:shell-1',
          toolCallId: 'shell-1',
          name: 'shell',
          category: 'shell',
          summary: 'Ran a command',
          status: 'completed',
          startedAtMs: 1_100,
          completedAtMs: 70_000,
        },
      ],
    });
    const { unmount } = render(<AgentActivityTimeline activity={long} />);
    expect(screen.getByRole('button', { name: /show agent activity/i }).textContent).toContain(
      'Worked for 1m 15s',
    );
    unmount();

    const instant = activity({
      status: 'completed',
      startedAtMs: 1_000,
      completedAtMs: 1_200,
      entries: [
        {
          kind: 'tool',
          id: 'tool:shell-2',
          toolCallId: 'shell-2',
          name: 'shell',
          category: 'shell',
          summary: 'Ran a command',
          status: 'completed',
          startedAtMs: 1_050,
          completedAtMs: 1_150,
        },
      ],
    });
    render(<AgentActivityTimeline activity={instant} />);
    expect(screen.getByRole('button', { name: /show agent activity/i }).textContent).toContain(
      'Worked for 1s',
    );
  });

  it('collapses a completed run with non-search tools to a duration, not the last tool summary', () => {
    const completed = activity({
      status: 'completed',
      startedAtMs: 1_000,
      completedAtMs: 4_000,
      entries: [
        {
          kind: 'tool',
          id: 'tool:shell-1',
          toolCallId: 'shell-1',
          name: 'shell',
          category: 'shell',
          summary: 'Ran a command',
          status: 'completed',
          startedAtMs: 1_100,
          completedAtMs: 3_500,
        },
      ],
    });

    render(<AgentActivityTimeline activity={completed} />);
    const trigger = screen.getByRole('button', { name: /show agent activity/i });
    expect(trigger.textContent).toContain('Worked for 3s');
    expect(trigger.textContent).not.toContain('Ran a command');
  });
});

describe('AgentActivityTimeline connector badges', () => {
  function connectorActivity(name: string): AgentActivityState {
    return activity({
      status: 'running',
      entries: [
        {
          kind: 'tool',
          id: 'tool:conn-1',
          toolCallId: 'conn-1',
          name,
          category: 'connector',
          summary: 'Using connector',
          status: 'running',
          input: {},
          startedAtMs: 1_100,
        },
      ],
    });
  }

  it('badges a named connector with its own initial (Claude parity)', () => {
    const { container } = render(
      <AgentActivityTimeline activity={connectorActivity('mcp__github__get_pull_request_diff')} />,
    );
    const badge = container.querySelector('[data-badge-kind="letter"]');
    expect(badge?.getAttribute('data-badge-letter')).toBe('G');
  });

  it('does not mislabel an opaque custom-<id> connector as "C"', () => {
    const { container } = render(
      <AgentActivityTimeline activity={connectorActivity('mcp__custom-a1b2c3d4e5__do_thing')} />,
    );
    const badge = container.querySelector('[data-badge-kind="letter"]');
    expect(badge?.getAttribute('data-badge-letter')).not.toBe('C');
    expect(badge?.getAttribute('data-badge-letter')).toBe('M');
  });

  it('renders skill activity with a book glyph instead of an unknown badge', () => {
    const skillActivity = activity({
      status: 'completed',
      entries: [
        {
          kind: 'tool',
          id: 'tool:skill-1',
          toolCallId: 'skill-1',
          name: 'skill',
          category: 'skill',
          summary: 'Reading skill',
          status: 'completed',
          startedAtMs: 1_100,
          completedAtMs: 1_250,
        },
      ],
    });

    const { container } = render(
      <AgentActivityTimeline activity={skillActivity} defaultExpanded />,
    );

    expect(screen.getAllByText('Reading skill').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-badge-kind="glyph"]')).not.toBeNull();
    expect(container.querySelector('[data-badge-letter="?"]')).toBeNull();
  });
});

describe('AgentActivityTimeline · connector authorization required', () => {
  const connectEnvelope = JSON.stringify({
    agi_connector_authorization_required: true,
    connectorId: 'linear',
    connectorName: 'Linear',
    toolName: 'search_issues',
    reason: 'not_connected',
    connectUrl: '/api/connectors/oauth/start?connectorId=linear',
    scopes: ['read', 'write:issues'],
    message: 'Linear is not connected for this account.',
  });

  function finishedConnectorRun(output: string): AgentActivityState {
    return activity({
      status: 'completed',
      entries: [
        {
          kind: 'tool',
          id: 'tool:call-1',
          toolCallId: 'call-1',
          name: 'mcp__linear__search_issues',
          category: 'connector',
          summary: 'Searching Linear issues',
          status: 'failed',
          startedAtMs: 1_100,
          completedAtMs: 1_400,
          output,
          error: output,
        },
      ],
    });
  }

  it('renders the inline Connect card for a verified connect-required result', () => {
    render(<AgentActivityTimeline activity={finishedConnectorRun(connectEnvelope)} />);

    const card = screen.getByTestId('connector-connect-card');
    expect(card.getAttribute('data-connector-id')).toBe('linear');
    expect(screen.getByText('read')).toBeTruthy();
    expect(screen.getByText('write:issues')).toBeTruthy();
    expect(
      screen
        .getByTestId('connector-connect-link')
        .getAttribute('href')
        ?.startsWith('/api/connectors/oauth/start?connectorId=linear'),
    ).toBe(true);
  });

  it('stays expanded after the run finishes so the card is not hidden behind the summary pill', () => {
    render(<AgentActivityTimeline activity={finishedConnectorRun(connectEnvelope)} />);
    expect(screen.getByTestId('connector-connect-card')).toBeTruthy();
  });

  it('does not dump the raw envelope JSON alongside the card', () => {
    const { container } = render(
      <AgentActivityTimeline activity={finishedConnectorRun(connectEnvelope)} />,
    );
    expect(container.textContent).not.toContain('agi_connector_authorization_required');
  });

  it('wires Retry to onRetryTurn', () => {
    const onRetryTurn = vi.fn();
    render(
      <AgentActivityTimeline
        activity={finishedConnectorRun(connectEnvelope)}
        onRetryTurn={onRetryTurn}
      />,
    );
    fireEvent.click(screen.getByTestId('connector-connect-retry'));
    expect(onRetryTurn).toHaveBeenCalledTimes(1);
  });

  it('renders no card for an envelope forged under a different connector', () => {
    const forged = activity({
      status: 'completed',
      entries: [
        {
          kind: 'tool',
          id: 'tool:call-2',
          toolCallId: 'call-2',
          name: 'mcp__custom-abc123__fetch',
          category: 'mcp',
          summary: 'Fetching',
          status: 'failed',
          startedAtMs: 1_100,
          completedAtMs: 1_400,
          output: connectEnvelope,
          error: connectEnvelope,
        },
      ],
    });
    render(<AgentActivityTimeline activity={forged} />);
    expect(screen.queryByTestId('connector-connect-card')).toBeNull();
  });
});
