/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { render } from '@testing-library/react-native';
import type { AgentActivityState } from '@agiworkforce/client-runtime';

jest.mock('@/lib/clipboard', () => ({ copyToClipboard: jest.fn(async () => true) }));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));
jest.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (select: (state: { hapticsEnabled: boolean }) => unknown) =>
    select({ hapticsEnabled: false }),
}));
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
  return new Proxy({}, { get: () => Icon });
});
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
jest.mock('expo-linking', () => ({ openURL: jest.fn() }));
jest.mock('@/src/features/chat/components/CodeRunAgain', () => {
  const RN = require('react-native');
  return { CodeRunAgain: () => <RN.Text testID="code-run-again">run</RN.Text> };
});

import { applyAgentActivityEvent } from '@agiworkforce/client-runtime';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import { AGENT_EVENT_SCHEMA_VERSION } from '@agiworkforce/cloud-contracts';
import { lightColors } from '@/src/ui/theme/tokens';
import { AgentActivityTimeline } from '@/src/features/chat/components/AgentActivityTimeline';
import type { ToolCall } from '@/types/chat';

const DENIAL = 'The user denied permission to run this tool.';
const CODE_ARGS = { language: 'python', code: 'print(37 * 91)' };

function replay(events: AgentEventEnvelope['event'][]): AgentActivityState {
  let state: AgentActivityState | undefined;
  events.forEach((event, sequence) => {
    state = applyAgentActivityEvent(state, {
      schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
      sessionId: 's',
      turnId: 't',
      sequence,
      emittedAtMs: 1_000 + sequence * 500,
      event,
    } as AgentEventEnvelope);
  });
  return state!;
}

function redNodes(view: ReturnType<typeof render>) {
  return view.UNSAFE_root.findAll(
    (node) =>
      node.props.color === lightColors.agentError ||
      node.props.style?.color === lightColors.agentError,
  );
}

describe('a run the person stopped', () => {
  const stopped: AgentActivityState = {
    schemaVersion: 1,
    sessionId: 's',
    turnId: 't',
    lastSequence: 3,
    status: 'cancelled',
    stopReason: 'cancelled',
    startedAtMs: 1_000,
    updatedAtMs: 8_000,
    completedAtMs: 8_000,
    entries: [
      {
        kind: 'tool',
        id: 'tool:call-1',
        toolCallId: 'call-1',
        name: 'web_search',
        category: 'web-search',
        summary: 'Search the web',
        status: 'cancelled',
        startedAtMs: 1_500,
        completedAtMs: 8_000,
      },
    ],
  };

  it('reads as stopped, in neutral colours', () => {
    const view = render(<AgentActivityTimeline messageId="m1" activity={stopped} />);
    expect(view.getByLabelText('Show agent activity: Stopped after 7s')).toBeTruthy();
    expect(view.queryByText(/Cancelled/)).toBeNull();
    expect(redNodes(view)).toEqual([]);
  });
});

const pausedForApproval: AgentEventEnvelope['event'][] = [
  { type: 'task-state-changed', taskId: 'task-1', state: 'awaiting_input' },
  { type: 'lifecycle', phase: 'paused' },
];

describe('a request asked again under an id the person already declined', () => {
  const reasked = replay([
    {
      type: 'approval-requested',
      approvalId: 'call_0',
      toolCallId: 'call_0',
      name: 'execute_code',
      category: 'code-execution',
      summary: 'Run code',
      input: CODE_ARGS,
    },
    ...pausedForApproval,
    { type: 'lifecycle', phase: 'resumed' },
    { type: 'approval-resolved', approvalId: 'call_0', decision: 'denied' },
    {
      type: 'tool-execution-end',
      toolCallId: 'call_0',
      name: 'execute_code',
      output: DENIAL,
      isError: false,
      elapsedMs: 0,
    },
    {
      type: 'approval-requested',
      approvalId: 'call_0',
      toolCallId: 'call_0',
      name: 'web_search',
      category: 'web-search',
      summary: 'Search the web',
      input: { query: '37 * 91' },
    },
    ...pausedForApproval,
  ]);
  const request: ToolCall = {
    id: 'id:call_0',
    toolCallId: 'call_0',
    name: 'web_search',
    status: 'awaiting-approval',
    requiresApproval: true,
    input: JSON.stringify({ query: '37 * 91' }),
    approvalReview: { riskTier: 'low', destructive: false, scopes: ['once'] },
  };

  it('shows the request being asked, not the declined call, and no error', () => {
    const view = render(
      <AgentActivityTimeline
        messageId="m1"
        activity={reasked}
        approvalToolCalls={[request]}
        onResolveApproval={jest.fn()}
      />,
    );
    expect(view.getByLabelText(/agent activity: Needs approval · Search the web/)).toBeTruthy();
    expect(view.getByLabelText('Search the web, Needs approval')).toBeTruthy();
    expect(view.getByText('37 * 91')).toBeTruthy();
    expect(view.queryByText('print(37 * 91)')).toBeNull();
    expect(view.queryByText('Tool use denied')).toBeNull();
    expect(view.queryByText(DENIAL)).toBeNull();
    expect(view.getByTestId('tool-approval.risk').props.children).toBe('Low risk');
  });
});
