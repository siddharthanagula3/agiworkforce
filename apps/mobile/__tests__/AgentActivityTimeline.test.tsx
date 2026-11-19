/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type { AgentActivityState } from '@agiworkforce/client-runtime';

jest.mock('@/src/ui/theme', () => {
  const actual = jest.requireActual('@/src/ui/theme/tokens');
  return { ...actual, useThemeColors: () => actual.lightColors };
});

jest.mock('@/components/ui/Text', () => {
  const RN = require('react-native');
  const Text = (props: Record<string, unknown>) => <RN.Text {...props} />;
  Text.displayName = 'Text';
  return { Text };
});

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const Icon = (props: Record<string, unknown>) => <RN.View {...props} />;
  return new Proxy(
    {},
    {
      get: () => Icon,
    },
  );
});

import {
  AgentActivityTimeline,
  buildAgentActivitySummary,
} from '@/src/features/chat/components/AgentActivityTimeline';

function activity(overrides: Partial<AgentActivityState> = {}): AgentActivityState {
  return {
    schemaVersion: 1,
    sessionId: 'session-1',
    turnId: 'turn-1',
    lastSequence: 3,
    status: 'running',
    startedAtMs: 1_000,
    updatedAtMs: 2_000,
    entries: [
      {
        kind: 'tool',
        id: 'tool:search-1',
        toolCallId: 'search-1',
        name: 'web_search',
        category: 'web-search',
        summary: 'Searching official sources',
        status: 'running',
        input: { query: 'official agent documentation' },
        startedAtMs: 1_200,
        query: 'official agent documentation',
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
  it('rests running work as one closed line, opens on a tap, and keeps details deliberate', () => {
    const view = render(
      <AgentActivityTimeline messageId="message-1" activity={activity()} nowMs={2_500} />,
    );

    const trigger = view.getByLabelText(/show agent activity/i);
    expect(trigger.props.accessibilityState).toEqual({ expanded: false });
    expect(view.getByTestId('agent-activity.running-label')).toBeTruthy();
    expect(view.queryByLabelText(/^Searching official sources, /)).toBeNull();

    fireEvent.press(trigger);

    expect(view.getByLabelText(/hide agent activity/i).props.accessibilityState).toEqual({
      expanded: true,
    });
    expect(view.queryByText('Official agent documentation')).toBeNull();
    fireEvent.press(view.getByLabelText(/^Searching official sources, /));
    expect(view.getByText('Official agent documentation')).toBeTruthy();
    expect(view.getByText('example.com')).toBeTruthy();

    fireEvent.press(view.getByLabelText(/hide agent activity/i));

    expect(view.getByLabelText(/show agent activity/i).props.accessibilityState).toEqual({
      expanded: false,
    });
    expect(view.queryByLabelText(/^Searching official sources, /)).toBeNull();
  });

  it('carries the reasoning inside its one line instead of a second status row', () => {
    const { Text: RNText } = require('react-native');
    const view = render(
      <AgentActivityTimeline
        messageId="message-1"
        activity={activity()}
        nowMs={2_500}
        reasoning={<RNText>Reasoning entry</RNText>}
      />,
    );

    expect(view.queryByText('Reasoning entry')).toBeNull();

    fireEvent.press(view.getByLabelText(/show agent activity/i));

    expect(view.getByText('Reasoning entry')).toBeTruthy();
  });

  it('opens by itself when a step waits for the person to answer', () => {
    const view = render(
      <AgentActivityTimeline
        messageId="message-1"
        activity={activity({ status: 'awaiting-approval' })}
        nowMs={2_500}
      />,
    );

    expect(view.getByLabelText(/hide agent activity/i).props.accessibilityState).toEqual({
      expanded: true,
    });
  });

  it('keeps active summaries semantic and shows a fixed duration after completion', () => {
    expect(buildAgentActivitySummary(activity(), 60_000)).toBe('Searching official sources · 59s');
    expect(
      buildAgentActivitySummary(activity({ status: 'completed', completedAtMs: 50_000 }), 60_000),
    ).toBe('Worked for 49s · 1 tool');
    expect(buildAgentActivitySummary(activity({ status: 'failed' }), 60_000)).toBe(
      'Failed after 1s',
    );
  });

  it('caps expanded source previews and exposes the remaining count', () => {
    const sources = Array.from({ length: 8 }, (_, index) => ({
      url: `https://source-${index}.example.com`,
      title: `Source ${index}`,
    }));
    const view = render(
      <AgentActivityTimeline
        messageId="message-sources"
        defaultExpanded
        activity={activity({
          status: 'completed',
          completedAtMs: 3_000,
          entries: [
            {
              kind: 'sources',
              id: 'sources:1',
              sources,
              emittedAtMs: 2_000,
            },
          ],
        })}
      />,
    );

    expect(view.getByText('+3 more sources')).toBeTruthy();
    expect(view.queryByText('Source 5')).toBeNull();
  });

  it('reveals long runs in bounded pages and wires approval to the tool call id', () => {
    const onResolveApproval = jest.fn();
    const earlier = Array.from({ length: 24 }, (_, index) => ({
      kind: 'progress' as const,
      id: `progress:${index}`,
      progressId: `progress-${index}`,
      summary: `Step ${index + 1}`,
      status: 'completed' as const,
      startedAtMs: 1_000 + index,
      completedAtMs: 1_050 + index,
    }));
    const pending = {
      kind: 'tool' as const,
      id: 'tool:shell-1',
      toolCallId: 'shell-1',
      name: 'shell',
      category: 'shell' as const,
      summary: 'Install the document library',
      status: 'awaiting-approval' as const,
      input: { command: 'package-manager install document-library' },
      startedAtMs: 2_000,
      approval: { id: 'approval-1', riskLevel: 'medium' as const },
    };
    const view = render(
      <AgentActivityTimeline
        messageId="message-2"
        activity={activity({ status: 'awaiting-approval', entries: [...earlier, pending] })}
        defaultExpanded
        onResolveApproval={onResolveApproval}
      />,
    );

    expect(view.queryByText('Step 1')).toBeNull();
    fireEvent.press(view.getByLabelText(/show 5 earlier steps/i));
    expect(view.getByText('Step 1')).toBeTruthy();

    fireEvent.press(view.getByLabelText('Allow once: Install the document library'));
    fireEvent.press(view.getByLabelText('Deny: Install the document library'));

    expect(onResolveApproval).toHaveBeenNthCalledWith(1, 'shell-1', 'approved', undefined);
    expect(onResolveApproval).toHaveBeenNthCalledWith(2, 'shell-1', 'rejected', undefined);
  });

  it('counts the seconds of a running turn in its one line', () => {
    expect(buildAgentActivitySummary(activity({ startedAtMs: 1_000 }), 13_000)).toBe(
      'Searching official sources · 12s',
    );
    expect(buildAgentActivitySummary(activity({ startedAtMs: 1_000 }), 1_200)).toBe(
      'Searching official sources',
    );
    const view = render(
      <AgentActivityTimeline
        messageId="message-ticking"
        activity={activity({ startedAtMs: 1_000 })}
        nowMs={13_000}
      />,
    );
    expect(view.getByLabelText(/show agent activity: .*· 12s$/i)).toBeTruthy();
    view.rerender(
      <AgentActivityTimeline
        messageId="message-ticking"
        activity={activity({ startedAtMs: 1_000 })}
        nowMs={14_000}
      />,
    );
    expect(view.getByLabelText(/show agent activity: .*· 13s$/i)).toBeTruthy();
  });

  it('keeps a stop label without seconds and adds none once the run settles', () => {
    expect(
      buildAgentActivitySummary(activity({ status: 'completed', completedAtMs: 13_000 }), 20_000),
    ).toBe('Worked for 12s · 1 tool');
    const view = render(
      <AgentActivityTimeline
        messageId="message-stopping"
        activity={activity({ startedAtMs: 1_000 })}
        nowMs={13_000}
        statusLabel="Stopping"
      />,
    );
    expect(view.getByLabelText('Show agent activity: Stopping')).toBeTruthy();
  });

  it('reads a turn paused on an undecided approval as waiting for the person', () => {
    const pending = {
      kind: 'tool' as const,
      id: 'tool:send-1',
      toolCallId: 'send-1',
      name: 'mcp__gmail__send_email',
      category: 'connector' as const,
      summary: 'Review Gmail action',
      status: 'awaiting-approval' as const,
      input: { to: 'team@example.com' },
      startedAtMs: 2_000,
      approval: { id: 'approval-send', riskLevel: 'high' as const },
    };
    const paused = activity({ status: 'paused', entries: [pending] });
    expect(buildAgentActivitySummary(paused, 9_000)).toBe('Needs approval · Review Gmail action');
    const view = render(<AgentActivityTimeline messageId="message-paused" activity={paused} />);
    expect(view.getByLabelText(/hide agent activity/i).props.accessibilityState).toEqual({
      expanded: true,
    });
    expect(view.getByLabelText('Allow once: Review Gmail action')).toBeTruthy();
  });

  it('names a connector step in plain words and gives a failed one its reason', () => {
    const running = {
      kind: 'tool' as const,
      id: 'tool:issues-1',
      toolCallId: 'issues-1',
      name: 'mcp__github__search_issues',
      category: 'connector' as const,
      summary: 'Using GitHub connector',
      status: 'running' as const,
      input: { query: 'is:open' },
      startedAtMs: 1_100,
    };
    expect(buildAgentActivitySummary(activity({ entries: [running] }), 1_200)).toBe(
      'Searching GitHub',
    );
    const failed = {
      ...running,
      status: 'failed' as const,
      error: 'The provider refused the request (429).',
      completedAtMs: 1_900,
      elapsedMs: 800,
    };
    const view = render(
      <AgentActivityTimeline
        messageId="message-connector"
        defaultExpanded
        activity={activity({ status: 'failed', entries: [failed] })}
      />,
    );
    expect(view.getByText('Could not search GitHub')).toBeTruthy();
    expect(view.getByTestId('agent-activity.failure-reason').props.children).toBe(
      'Rate limited, try again in a minute.',
    );
  });

  it('shows a failed step error without the tool label, trust fence or stack frames', () => {
    const failed = {
      kind: 'tool' as const,
      id: 'tool:fetch-1',
      toolCallId: 'fetch-1',
      name: 'web_fetch',
      category: 'web-fetch' as const,
      summary: 'Reading the page',
      status: 'failed' as const,
      input: { url: 'https://example.com' },
      error: 'Tool error: The page could not be read.\n    at fetchPage (fetch.js:10:3)',
      startedAtMs: 1_100,
      completedAtMs: 1_900,
    };
    const view = render(
      <AgentActivityTimeline
        messageId="message-failed-fetch"
        defaultExpanded
        activity={activity({ status: 'failed', entries: [failed] })}
      />,
    );
    fireEvent.press(view.getByLabelText(/^Reading the page, /));
    expect(view.getByText('The page could not be read.')).toBeTruthy();
    expect(view.queryByText(/fetch\.js/)).toBeNull();
  });
});
