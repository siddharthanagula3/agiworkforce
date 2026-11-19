/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import type { AgentActivityState, AgentActivityToolEntry } from '@agiworkforce/client-runtime';

const mockCopyToClipboard = jest.fn(async (_text: string) => true);
jest.mock('@/lib/clipboard', () => ({
  copyToClipboard: (text: string) => mockCopyToClipboard(text),
}));
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
  return {
    CodeRunAgain: (props: { language: string; code: string; conversationId: string }) => (
      <RN.Text testID="code-run-again">{`${props.conversationId}|${props.language}|${props.code}`}</RN.Text>
    ),
  };
});

import { ToolCallTimeline } from '@/src/features/chat/components/ToolCallTimeline';
import { AgentActivityTimeline } from '@/src/features/chat/components/AgentActivityTimeline';
import { TOOL_MONOSPACE } from '@/src/features/chat/components/ToolFileDiffBlock';
import type { ToolCall } from '@/types/chat';

const CODE = 'import math\nprint(math.pi)';
const UNIFIED_DIFF = [
  '--- a/src/app.ts',
  '+++ b/src/app.ts',
  '@@ -1,2 +1,2 @@',
  ' const keep = 1;',
  '-const old = 2;',
  '+const next = 3;',
].join('\n');

function legacyTool(overrides: Partial<ToolCall>): ToolCall {
  return { id: 'tool-1', name: 'execute_code', status: 'succeeded', ...overrides };
}

function activityWith(
  entry: Partial<AgentActivityToolEntry>,
  status: AgentActivityState['status'] = 'completed',
): AgentActivityState {
  return {
    schemaVersion: 1,
    sessionId: 's',
    turnId: 't',
    lastSequence: 2,
    status,
    startedAtMs: 1_000,
    updatedAtMs: 2_000,
    completedAtMs: 2_000,
    entries: [
      {
        kind: 'tool',
        id: 'tool:call-1',
        toolCallId: 'call-1',
        name: 'execute_code',
        category: 'code',
        summary: 'Ran code',
        status: 'completed',
        startedAtMs: 1_100,
        ...entry,
      } as AgentActivityToolEntry,
    ],
  };
}

describe('executed code in the legacy tool timeline', () => {
  beforeEach(() => mockCopyToClipboard.mockClear());

  it('shows the code as a code card with its language and a Copy that pastes exactly the code', async () => {
    const view = render(
      <ToolCallTimeline
        messageId="m1"
        summary="Used 1 tool"
        toolCalls={[
          legacyTool({ input: JSON.stringify({ language: 'python', code: CODE }), output: '3.14' }),
        ]}
      />,
    );
    fireEvent.press(view.getByLabelText('Used 1 tool, collapsed'));
    fireEvent.press(view.getByLabelText(/, done/i));
    expect(view.getByTestId('tool-code-card')).toBeTruthy();
    expect(view.getByText('python')).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getByLabelText('Copy code'));
    });
    expect(mockCopyToClipboard).toHaveBeenCalledWith(CODE);
    expect(view.getByText('Output')).toBeTruthy();
  });

  it('mounts Run again on a finished execute_code row with that exact code', () => {
    const view = render(
      <ToolCallTimeline
        messageId="m1"
        summary="Used 1 tool"
        codeRunConversationId="conv-1"
        toolCalls={[legacyTool({ input: JSON.stringify({ language: 'python', code: CODE }) })]}
      />,
    );
    fireEvent.press(view.getByLabelText('Used 1 tool, collapsed'));
    expect(view.getByTestId('code-run-again').props.children).toBe(`conv-1|python|${CODE}`);
  });

  it('offers no Run again without a conversation to run in', () => {
    const view = render(
      <ToolCallTimeline
        messageId="m1"
        summary="Used 1 tool"
        toolCalls={[legacyTool({ input: JSON.stringify({ code: CODE }) })]}
      />,
    );
    fireEvent.press(view.getByLabelText('Used 1 tool, collapsed'));
    expect(view.queryByTestId('code-run-again')).toBeNull();
  });

  it('renders a unified-diff result as a diff with add and remove fills and the file path', () => {
    const view = render(
      <ToolCallTimeline
        messageId="m1"
        summary="Used 1 tool"
        toolCalls={[
          legacyTool({
            name: 'apply_patch',
            input: JSON.stringify({ path: 'src/app.ts' }),
            output: UNIFIED_DIFF,
          }),
        ]}
      />,
    );
    fireEvent.press(view.getByLabelText('Used 1 tool, collapsed'));
    fireEvent.press(view.getByLabelText(/, done/i));
    const diff = view.getByTestId('tool-result-diff');
    expect(diff.props.accessibilityLabel).toBe('Changes to src/app.ts: 1 added, 1 removed');
    expect(view.getAllByTestId('tool-file-diff-line-meta')).toHaveLength(3);
    expect(view.getByTestId('tool-file-diff-line-add')).toHaveStyle({
      backgroundColor: require('@/src/ui/theme/tokens').lightColors.diffAddedFill,
    });
    expect(Platform.OS).toBe('ios');
    expect(TOOL_MONOSPACE).toBe('Menlo');
    expect(view.getByText('const next = 3;')).toHaveStyle({ fontFamily: 'Menlo' });
  });

  it('renders an edit request as a diff instead of raw JSON', () => {
    const view = render(
      <ToolCallTimeline
        messageId="m1"
        summary="Used 1 tool"
        toolCalls={[
          legacyTool({
            name: 'edit_file',
            input: JSON.stringify({ path: 'notes.md', old_text: 'old line', new_text: 'new line' }),
            output: 'ok',
          }),
        ]}
      />,
    );
    fireEvent.press(view.getByLabelText('Used 1 tool, collapsed'));
    fireEvent.press(view.getByLabelText(/, done/i));
    expect(view.getByTestId('tool-file-diff').props.accessibilityLabel).toBe(
      'Changes to notes.md: 1 added, 1 removed',
    );
  });
});

describe('a failed step in the legacy tool timeline', () => {
  it('shows the error without the tool label or stack frames, and keeps it whole in the full view', () => {
    const raw = 'Tool error: The page could not be read.\n    at fetchPage (fetch.js:10:3)';
    const view = render(
      <ToolCallTimeline
        messageId="m1"
        summary="Used 1 tool"
        toolCalls={[
          legacyTool({
            name: 'web_fetch',
            status: 'failed',
            input: JSON.stringify({ url: 'https://example.com' }),
            output: raw,
          }),
        ]}
      />,
    );
    fireEvent.press(view.getByLabelText('Used 1 tool, collapsed'));
    fireEvent.press(view.getByLabelText(/, failed/i));
    expect(view.getByText('The page could not be read.')).toBeTruthy();
    expect(view.queryByText(/fetch\.js/)).toBeNull();
  });

  it('keeps a failed code run output as written', () => {
    const traceback = 'Traceback (most recent call last):\n    at line 1\nZeroDivisionError';
    const view = render(
      <ToolCallTimeline
        messageId="m1"
        summary="Used 1 tool"
        toolCalls={[
          legacyTool({
            status: 'failed',
            input: JSON.stringify({ language: 'python', code: '1/0' }),
            output: traceback,
          }),
        ]}
      />,
    );
    fireEvent.press(view.getByLabelText('Used 1 tool, collapsed'));
    fireEvent.press(view.getByLabelText(/, failed/i));
    expect(view.getByText(traceback)).toBeTruthy();
  });
});

describe('executed code and approvals in the canonical activity timeline', () => {
  beforeEach(() => mockCopyToClipboard.mockClear());

  it('shows an execute_code step as a code card with Copy, under a Code heading', async () => {
    const view = render(
      <AgentActivityTimeline
        messageId="m1"
        defaultExpanded
        activity={activityWith({
          input: { language: 'javascript', code: 'console.log(1)' },
          output: '1',
        })}
      />,
    );
    fireEvent.press(view.getByLabelText(/^Ran code, /));
    expect(view.getByText('Code')).toBeTruthy();
    expect(view.getByText('javascript')).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getByLabelText('Copy code'));
    });
    expect(mockCopyToClipboard).toHaveBeenCalledWith('console.log(1)');
    expect(view.getByText('Output')).toBeTruthy();
  });

  it('shows a failed execute_code step error under its own Error heading in monospace', () => {
    const traceback = 'Traceback (most recent call last):\n  ZeroDivisionError: division by zero';
    const view = render(
      <AgentActivityTimeline
        messageId="m1"
        defaultExpanded
        activity={activityWith(
          {
            status: 'failed',
            input: { language: 'python', code: '1/0' },
            error: traceback,
          },
          'failed',
        )}
      />,
    );
    fireEvent.press(view.getByLabelText(/^Ran code, /));
    const block = view.getByTestId('tool-code-error');
    expect(view.getByText('Error')).toBeTruthy();
    const text = view.getByText(traceback);
    expect(StyleSheet.flatten(text.props.style).fontFamily).toBe(TOOL_MONOSPACE);
    expect(block).toBeTruthy();
  });

  it('shows the decision on the canonical approval and disables its buttons once decided', () => {
    const onResolve = jest.fn();
    const awaiting = activityWith(
      {
        name: 'mcp__github__create_issue',
        category: 'connector',
        summary: 'Create an issue',
        status: 'awaiting-approval',
        input: { title: 'Ship it' },
        approval: { id: 'approval-1' },
      },
      'awaiting-approval',
    );
    const view = render(
      <AgentActivityTimeline
        messageId="m1"
        activity={awaiting}
        onResolveApproval={onResolve}
        approvalToolCalls={[
          {
            id: 'id:call-1',
            name: 'mcp__github__create_issue',
            status: 'awaiting-approval',
            toolCallId: 'call-1',
            requiresApproval: true,
            approvalDecision: 'rejected',
          },
        ]}
      />,
    );
    const denied = view.getByLabelText('Denied: Create an issue');
    expect(denied.props.accessibilityState).toEqual({ disabled: true, selected: true });
    fireEvent.press(view.getByLabelText('Allow once: Create an issue'));
    expect(onResolve).not.toHaveBeenCalled();
  });

  it('reads the server review for the canonical approval from the streamed tool call', () => {
    const awaiting = activityWith(
      {
        name: 'mcp__github__create_issue',
        category: 'connector',
        summary: 'Create an issue',
        status: 'awaiting-approval',
        input: { title: 'Ship it' },
        approval: { id: 'approval-1' },
      },
      'awaiting-approval',
    );
    const reviewed = {
      id: 'id:call-1',
      name: 'mcp__github__create_issue',
      status: 'awaiting-approval' as const,
      toolCallId: 'call-1',
      requiresApproval: true,
      approvalReview: { riskTier: 'low', destructive: false, scopes: ['once', 'session'] },
    } as ToolCall;
    const view = render(
      <AgentActivityTimeline
        messageId="m1"
        activity={awaiting}
        onResolveApproval={jest.fn()}
        onAllowApprovalForChat={jest.fn()}
        approvalToolCalls={[reviewed]}
      />,
    );
    expect(view.getByText('Low risk')).toBeTruthy();
    expect(view.getByLabelText('Allow for this chat: Create an issue')).toBeTruthy();
  });

  it('turns a retryable error into a Retry control only when the screen can retry', () => {
    const failed: AgentActivityState = {
      ...activityWith({}, 'failed'),
      entries: [
        { kind: 'error', id: 'error-1', message: 'The run stopped.', retryable: true } as never,
      ],
    };
    const onRetry = jest.fn();
    const view = render(
      <AgentActivityTimeline messageId="m1" defaultExpanded activity={failed} onRetry={onRetry} />,
    );
    fireEvent.press(view.getByLabelText('Retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);

    view.rerender(<AgentActivityTimeline messageId="m1" defaultExpanded activity={failed} />);
    expect(view.queryByLabelText('Retry')).toBeNull();
  });
});
