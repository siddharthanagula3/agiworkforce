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
    expect(screen.getAllByText('Starting AGI Work')).toHaveLength(1);
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
    expect(trigger.textContent).toContain('Searching official sources');
    expect(trigger.textContent).not.toMatch(/Done in/i);
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
