/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type {
  AgentActivityEntry,
  AgentActivityState,
  AgentActivityToolEntry,
} from '@agiworkforce/client-runtime';

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
import {
  AGENT_EVENT_SCHEMA_VERSION,
  DECLINED_WEB_SEARCH_ANSWER,
  WEB_SEARCH_NOT_PERFORMED_CODE,
} from '@agiworkforce/cloud-contracts';
import { AgentActivityTimeline } from '@/src/features/chat/components/AgentActivityTimeline';
import { ToolCallTimeline } from '@/src/features/chat/components/ToolCallTimeline';
import { activityEndedByDecline } from '@/src/features/chat/utils/declinedToolSteps';
import type { ToolCall } from '@/types/chat';

const DENIAL = 'The user denied permission to run this tool.';
const CODE_INPUT = { language: 'python', code: 'print(1)' };

function deniedStep(overrides: Partial<AgentActivityToolEntry> = {}): AgentActivityToolEntry {
  return {
    kind: 'tool',
    id: 'tool:call-1',
    toolCallId: 'call-1',
    name: 'mcp__github__create_issue',
    category: 'connector',
    summary: 'The tool failed',
    status: 'failed',
    input: { repo: 'agi/web' },
    output: DENIAL,
    error: DENIAL,
    approval: { id: 'approval-1', decision: 'denied' },
    elapsedMs: 0,
    startedAtMs: 1_100,
    completedAtMs: 1_100,
    ...overrides,
  };
}

function run(entries: AgentActivityEntry[]): AgentActivityState {
  return {
    schemaVersion: 1,
    sessionId: 's',
    turnId: 't',
    lastSequence: entries.length,
    status: 'failed',
    startedAtMs: 1_000,
    updatedAtMs: 34_900,
    completedAtMs: 34_900,
    entries,
  };
}

describe('a declined approval in the activity timeline', () => {
  it('reads as declined in the header, with no failure timing', () => {
    const view = render(<AgentActivityTimeline messageId="m1" activity={run([deniedStep()])} />);
    expect(view.getByLabelText('Show agent activity: You declined Create Issue')).toBeTruthy();
    expect(view.queryByText(/Failed after/)).toBeNull();
  });

  it('draws the step once as Declined, without the denial sentence or a duration', () => {
    const view = render(
      <AgentActivityTimeline messageId="m1" defaultExpanded activity={run([deniedStep()])} />,
    );
    const row = view.getByLabelText('Create Issue, Declined');
    expect(view.getByText('Declined')).toBeTruthy();
    expect(view.queryByText('The tool failed')).toBeNull();
    expect(view.queryByText(/0ms/)).toBeNull();
    fireEvent.press(row);
    expect(view.queryByText(DENIAL)).toBeNull();
  });

  it('uses the decision saved on the tool call when the event carries none', () => {
    const view = render(
      <AgentActivityTimeline
        messageId="m1"
        activity={run([deniedStep({ approval: undefined })])}
        approvalToolCalls={[
          {
            id: 'id:call-1',
            toolCallId: 'call-1',
            name: 'x',
            status: 'failed',
            approvalDecision: 'rejected',
          },
        ]}
      />,
    );
    expect(view.getByLabelText('Show agent activity: You declined Create Issue')).toBeTruthy();
  });

  it('offers no Run again for code the person declined', () => {
    const view = render(
      <AgentActivityTimeline
        messageId="m1"
        defaultExpanded
        codeRunConversationId="conv-1"
        activity={run([deniedStep({ name: 'execute_code', input: CODE_INPUT })])}
      />,
    );
    expect(view.queryByTestId('code-run-again')).toBeNull();
  });

  it('still reports a real failure as a failure', () => {
    const failed = run([deniedStep({ approval: undefined, error: 'HTTP 500' })]);
    expect(activityEndedByDecline(failed)).toBe(false);
    const view = render(<AgentActivityTimeline messageId="m1" activity={failed} />);
    expect(view.getByLabelText(/Show agent activity: Failed after/)).toBeTruthy();
  });

  it('keeps the failure when a decline is followed by an error', () => {
    const withError = run([
      deniedStep(),
      { kind: 'error', id: 'error:1', message: 'The model stopped.', emittedAtMs: 2_000 },
    ]);
    expect(activityEndedByDecline(withError)).toBe(false);
  });
});

describe('a declined approval in the tool call timeline', () => {
  const declinedTool: ToolCall = {
    id: 'tool-1',
    toolCallId: 'call-1',
    name: 'mcp__github__create_issue',
    status: 'failed',
    requiresApproval: false,
    approvalDecision: 'rejected',
    input: JSON.stringify({ repo: 'agi/web' }),
    output: 'You denied permission to run this tool.',
    duration: 0,
  };

  it('says the person declined, once, in neutral words', () => {
    const view = render(
      <ToolCallTimeline messageId="m1" summary="1 tool failed" toolCalls={[declinedTool]} />,
    );
    fireEvent.press(view.getByLabelText('You declined Create Issue, collapsed'));
    fireEvent.press(view.getByLabelText('Create Issue, declined'));
    expect(view.getByText('Declined')).toBeTruthy();
    expect(view.queryByText('You denied permission to run this tool.')).toBeNull();
    expect(view.queryByText(/1 tool failed/)).toBeNull();
  });

  it('offers no Run again for declined code', () => {
    const view = render(
      <ToolCallTimeline
        messageId="m1"
        summary="1 tool failed"
        codeRunConversationId="conv-1"
        toolCalls={[{ ...declinedTool, name: 'execute_code', input: JSON.stringify(CODE_INPUT) }]}
      />,
    );
    fireEvent.press(view.getByLabelText('You declined Run code, collapsed'));
    expect(view.queryByTestId('code-run-again')).toBeNull();
  });
});

describe('a declined required web search', () => {
  const searchInput = { query: 'weather in Paris' };

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

  const asked: AgentEventEnvelope['event'][] = [
    {
      type: 'approval-requested',
      approvalId: 'approval-1',
      toolCallId: 'call-1',
      name: 'web_search',
      category: 'web-search',
      summary: 'Look up the weather',
      input: searchInput,
    },
    { type: 'approval-resolved', approvalId: 'approval-1', decision: 'denied' },
  ];

  const decidedShape = replay([
    ...asked,
    {
      type: 'tool-execution-end',
      toolCallId: 'call-1',
      name: 'web_search',
      output: DENIAL,
      isError: false,
      elapsedMs: 0,
    },
    { type: 'text-delta', delta: DECLINED_WEB_SEARCH_ANSWER },
    { type: 'stop', reason: 'end-turn' },
  ]);

  const legacyShape = replay([
    ...asked,
    {
      type: 'tool-execution-end',
      toolCallId: 'call-1',
      name: 'web_search',
      output: DENIAL,
      isError: true,
      elapsedMs: 0,
    },
    {
      type: 'error',
      code: WEB_SEARCH_NOT_PERFORMED_CODE,
      message: 'Web search was not approved or available, so this answer could not be verified.',
      retryable: false,
    },
    { type: 'stop', reason: 'error' },
  ]);

  it.each([
    ['the decided shape', decidedShape],
    ['the legacy error shape', legacyShape],
  ])('reads as declined, never failed, from %s', (_shape, activity) => {
    expect(activityEndedByDecline(activity)).toBe(true);
    const onRetry = jest.fn();
    const view = render(
      <AgentActivityTimeline
        messageId="m1"
        defaultExpanded
        activity={activity}
        onRetry={onRetry}
      />,
    );
    expect(view.getByLabelText('Hide agent activity: You declined Search the web')).toBeTruthy();
    expect(view.queryByText(/Failed after/)).toBeNull();
    expect(view.queryByText(/could not be verified/)).toBeNull();
    expect(view.queryByTestId('agent-activity.retry')).toBeNull();
    expect(view.getByLabelText('Search the web, Declined')).toBeTruthy();
  });

  it('keeps the failure when an approved search could not run', () => {
    const unavailable = replay([
      asked[0]!,
      { type: 'approval-resolved', approvalId: 'approval-1', decision: 'approved' },
      {
        type: 'tool-execution-end',
        toolCallId: 'call-1',
        name: 'web_search',
        output: 'Tool "web_search" is not available and was not executed.',
        isError: true,
        elapsedMs: 0,
      },
      {
        type: 'error',
        code: WEB_SEARCH_NOT_PERFORMED_CODE,
        message: 'Web search was not approved or available, so this answer could not be verified.',
        retryable: false,
      },
      { type: 'stop', reason: 'error' },
    ]);
    expect(activityEndedByDecline(unavailable)).toBe(false);
  });

  it('keeps the usual summary when other steps of a completed turn ran', () => {
    const mixed = replay([
      ...asked,
      {
        type: 'tool-execution-end',
        toolCallId: 'call-1',
        name: 'web_search',
        output: DENIAL,
        isError: false,
        elapsedMs: 0,
      },
      {
        type: 'tool-execution-start',
        toolCallId: 'call-2',
        name: 'execute_code',
        category: 'code-execution',
        summary: 'Run code',
        input: CODE_INPUT,
      },
      {
        type: 'tool-execution-end',
        toolCallId: 'call-2',
        name: 'execute_code',
        output: '1',
        isError: false,
        elapsedMs: 10,
      },
      { type: 'stop', reason: 'end-turn' },
    ]);
    expect(activityEndedByDecline(mixed)).toBe(false);
  });
});
