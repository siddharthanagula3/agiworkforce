/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type { AgentActivityState } from '@agiworkforce/client-runtime';

jest.mock('@/src/ui/theme', () => {
  const actual = jest.requireActual('@/src/ui/theme/tokens');
  return { ...actual, useThemeColors: () => actual.lightColors };
});

jest.mock('@/components/ui/text', () => {
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

import { AgentActivityTimeline } from '@/src/features/chat/components/AgentActivityTimeline';

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
  it('keeps safe activity inline and collapsed until the user expands it', () => {
    const view = render(
      <AgentActivityTimeline messageId="message-1" activity={activity()} nowMs={2_500} />,
    );

    const trigger = view.getByLabelText(/show agent activity/i);
    expect(trigger.props.accessibilityState).toEqual({ expanded: false });
    expect(view.getByText(/Searching official sources/)).toBeTruthy();
    expect(view.queryByText('Official agent documentation')).toBeNull();

    fireEvent.press(trigger);

    expect(view.getByLabelText(/hide agent activity/i).props.accessibilityState).toEqual({
      expanded: true,
    });
    fireEvent.press(view.getByLabelText('Show details for Searching official sources'));
    expect(view.getByText('Official agent documentation')).toBeTruthy();
    expect(view.getByText('example.com')).toBeTruthy();
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

    fireEvent.press(view.getByLabelText('Allow Install the document library'));
    fireEvent.press(view.getByLabelText('Deny Install the document library'));

    expect(onResolveApproval).toHaveBeenNthCalledWith(1, 'shell-1', 'approved');
    expect(onResolveApproval).toHaveBeenNthCalledWith(2, 'shell-1', 'rejected');
  });
});
