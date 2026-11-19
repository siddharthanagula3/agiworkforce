/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import type { ToolApprovalReview } from '@agiworkforce/cloud-contracts';
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
  return new Proxy({}, { get: () => Icon });
});

import { AgentActivityTimeline } from '@/src/features/chat/components/AgentActivityTimeline';
import { CloudToolApprovalControls } from '@/src/features/chat/components/CloudToolApprovalControls';
import {
  accumulateToolCallDelta,
  createToolCallAccumulator,
  toolCallList,
} from '@/src/features/chat/utils/toolCallAccumulator';
import { toolCallApprovalReview } from '@/src/features/chat/utils/toolApprovalReview';

const PARAMETERS = { repo: 'agi/web', title: 'Ship it', labels: ['bug'] };
const OPEN_REVIEW: ToolApprovalReview = {
  riskTier: 'medium',
  destructive: false,
  scopes: ['once', 'session', 'always'],
};

function renderControls(
  overrides: Partial<React.ComponentProps<typeof CloudToolApprovalControls>> = {},
) {
  const onResolve = jest.fn();
  const onAllowForChat = jest.fn();
  const onAlwaysAllow = jest.fn();
  const view = render(
    <CloudToolApprovalControls
      toolCallId="call_1"
      toolName="mcp__github__create_issue"
      summary="Create Issue"
      args={PARAMETERS}
      review={OPEN_REVIEW}
      onResolve={onResolve}
      onAllowForChat={onAllowForChat}
      onAlwaysAllow={onAlwaysAllow}
      {...overrides}
    />,
  );
  return { ...view, onResolve, onAllowForChat, onAlwaysAllow };
}

describe('CloudToolApprovalControls reads the server review', () => {
  afterEach(() => jest.restoreAllMocks());

  it('lists every parameter as a row, with the raw JSON behind a disclosure, and the risk tier', () => {
    const view = renderControls();
    expect(view.getByText('repo')).toBeTruthy();
    expect(view.getByText('agi/web')).toBeTruthy();
    expect(view.getByText('["bug"]')).toBeTruthy();
    expect(view.getByText('Medium risk')).toBeTruthy();
    expect(view.queryByTestId('tool-approval.raw-json')).toBeNull();

    fireEvent.press(view.getByLabelText('Raw JSON'));
    expect(view.getByTestId('tool-approval.raw-json').props.children).toBe(
      JSON.stringify(PARAMETERS, null, 2),
    );
  });

  it.each([
    ['Allow once', 'onResolve', ['call_1', 'approved', undefined]],
    ['Allow for this chat', 'onAllowForChat', ['call_1', 'mcp__github__create_issue', undefined]],
    ['Always allow', 'onAlwaysAllow', ['call_1', 'mcp__github__create_issue', undefined]],
    ['Deny', 'onResolve', ['call_1', 'rejected', undefined]],
  ] as const)('%s reaches the %s decision for the exact call', (label, handler, args) => {
    const view = renderControls();
    fireEvent.press(view.getByLabelText(`${label}: Create Issue`));
    expect(view[handler]).toHaveBeenCalledWith(...args);
  });

  it('offers only the scopes the server reviewed', () => {
    const view = renderControls({
      review: { riskTier: 'low', destructive: false, scopes: ['once'] },
    });
    expect(view.getByText('Low risk')).toBeTruthy();
    expect(view.queryByLabelText('Allow for this chat: Create Issue')).toBeNull();
    expect(view.queryByLabelText('Always allow: Create Issue')).toBeNull();
    expect(view.getByLabelText('Deny: Create Issue')).toBeTruthy();
  });

  it('treats a missing review as high risk, destructive and once only', () => {
    const view = renderControls({ review: undefined });
    expect(view.getByText('High risk')).toBeTruthy();
    expect(
      view.getByText('This tool can change or delete data, and its effect may not be reversible.'),
    ).toBeTruthy();
    expect(view.getByLabelText('Allow once: Create Issue')).toBeTruthy();
    expect(view.queryByLabelText('Allow for this chat: Create Issue')).toBeNull();
    expect(view.queryByLabelText('Always allow: Create Issue')).toBeNull();
  });

  it('never shows a scope whose handler the screen did not wire', () => {
    const view = renderControls({ onAlwaysAllow: undefined });
    expect(view.queryByLabelText('Always allow: Create Issue')).toBeNull();
    expect(view.getByLabelText('Allow for this chat: Create Issue')).toBeTruthy();
  });

  it('asks before allowing a destructive tool for the chat, naming what cannot be undone', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const view = renderControls({
      review: { riskTier: 'critical', destructive: true, scopes: ['once', 'session'] },
    });
    expect(view.getByText('Critical risk')).toBeTruthy();
    fireEvent.press(view.getByLabelText('Allow for this chat: Create Issue'));
    expect(view.onAllowForChat).not.toHaveBeenCalled();
    const [title, message, buttons] = alert.mock.calls[0]!;
    expect(title).toBe('Allow Create Issue for the rest of this chat?');
    expect(message).toMatch(/cannot be recovered/);
    expect(message).toMatch(/until this chat is deleted/);
    const confirm = buttons!.find((button) => button.text === 'Allow for this chat');
    expect(confirm?.style).toBe('destructive');
    confirm!.onPress!();
    expect(view.onAllowForChat).toHaveBeenCalledWith(
      'call_1',
      'mcp__github__create_issue',
      undefined,
    );
  });

  it('asks before always allowing a destructive tool', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const view = renderControls({
      review: { riskTier: 'high', destructive: true, scopes: ['once', 'session', 'always'] },
    });
    fireEvent.press(view.getByLabelText('Always allow: Create Issue'));
    expect(view.onAlwaysAllow).not.toHaveBeenCalled();
    const [title, message, buttons] = alert.mock.calls[0]!;
    expect(title).toBe('Always allow Create Issue?');
    expect(message).toBe(
      'Create Issue will run without asking, including writes that cannot be undone. This applies to every chat until you change it in Settings, Connectors.',
    );
    buttons!.find((button) => button.text === 'Always allow')!.onPress!();
    expect(view.onAlwaysAllow).toHaveBeenCalledTimes(1);
  });

  it('shows the decision and disables every button once decided', () => {
    const view = renderControls({ decision: 'approved' });
    const allowed = view.getByLabelText('Allowed: Create Issue');
    expect(allowed.props.accessibilityState).toEqual({ disabled: true, selected: true });
    fireEvent.press(allowed);
    fireEvent.press(view.getByLabelText('Deny: Create Issue'));
    fireEvent.press(view.getByLabelText('Allow for this chat: Create Issue'));
    expect(view.onResolve).not.toHaveBeenCalled();
    expect(view.onAllowForChat).not.toHaveBeenCalled();
    expect(view.queryByLabelText('Add guidance for Create Issue')).toBeNull();

    view.rerender(
      <CloudToolApprovalControls
        toolCallId="call_1"
        toolName="mcp__github__create_issue"
        summary="Create Issue"
        args={PARAMETERS}
        review={OPEN_REVIEW}
        decision="rejected"
        onResolve={view.onResolve}
      />,
    );
    expect(view.getByLabelText('Denied: Create Issue').props.accessibilityState).toEqual({
      disabled: true,
      selected: true,
    });
  });

  it.each([
    ['approved-for-session', 'Allow for this chat'],
    ['approved-always', 'Always allow'],
  ] as const)('marks the %s scope the call was resolved with', (approvalScope, label) => {
    const view = renderControls({ decision: 'approved', approvalScope });
    expect(view.getByLabelText(`${label}: Create Issue`).props.accessibilityState).toEqual({
      disabled: true,
      selected: true,
    });
    expect(view.getByLabelText('Allow once: Create Issue').props.accessibilityState).toEqual({
      disabled: true,
      selected: false,
    });
    expect(view.queryByLabelText('Allowed: Create Issue')).toBeNull();
  });

  it('still shows the resolved scope on a read-only call whose review no longer lists it', () => {
    const view = render(
      <CloudToolApprovalControls
        toolCallId="call_1"
        toolName="mcp__github__create_issue"
        summary="Create Issue"
        args={PARAMETERS}
        decision="approved"
        approvalScope="approved-for-session"
      />,
    );
    expect(
      view.getByLabelText('Allow for this chat: Create Issue').props.accessibilityState,
    ).toEqual({ disabled: true, selected: true });
    expect(view.queryByLabelText('Always allow: Create Issue')).toBeNull();
  });

  it('marks the canonical activity approval resolved for this chat', () => {
    const activity = {
      turnId: 'turn_s',
      status: 'running',
      startedAtMs: 1_000,
      updatedAtMs: 1_500,
      entries: [
        {
          kind: 'tool',
          id: 'tool:call_s',
          toolCallId: 'call_s',
          name: 'mcp__github__create_issue',
          category: 'connector',
          summary: 'Create Issue',
          status: 'awaiting-approval',
          input: PARAMETERS,
          approval: { id: 'approval-s', decision: 'approved-for-session' },
          startedAtMs: 1_100,
        },
      ],
    } as unknown as AgentActivityState;
    const view = render(
      <AgentActivityTimeline
        messageId="m_s"
        defaultExpanded
        activity={activity}
        approvalToolCalls={[
          {
            id: 'id:call_s',
            name: 'mcp__github__create_issue',
            status: 'awaiting-approval',
            toolCallId: 'call_s',
            requiresApproval: true,
            approvalReview: OPEN_REVIEW,
          },
        ]}
        onResolveApproval={jest.fn()}
        onAllowApprovalForChat={jest.fn()}
        onAlwaysAllowApproval={jest.fn()}
      />,
    );
    expect(
      view.getByLabelText('Allow for this chat: Create Issue').props.accessibilityState,
    ).toEqual({ disabled: true, selected: true });
  });

  it('keeps unsent guidance when the row is recycled for another call and comes back', () => {
    const view = renderControls();
    fireEvent.press(view.getByLabelText('Add guidance for Create Issue'));
    fireEvent.changeText(view.getByLabelText('Guidance for Create Issue'), 'Use the staging repo');
    const props = {
      toolName: 'mcp__github__create_issue',
      summary: 'Create Issue',
      args: PARAMETERS,
      review: OPEN_REVIEW,
      onResolve: view.onResolve,
    };
    view.rerender(<CloudToolApprovalControls {...props} toolCallId="call_other" />);
    expect(view.queryByLabelText('Guidance for Create Issue')).toBeNull();
    view.rerender(<CloudToolApprovalControls {...props} toolCallId="call_1" />);
    expect(view.getByLabelText('Guidance for Create Issue').props.value).toBe(
      'Use the staging repo',
    );
    fireEvent.press(view.getByLabelText('Allow once: Create Issue'));
    expect(view.onResolve).toHaveBeenCalledWith('call_1', 'approved', 'Use the staging repo');
    view.rerender(<CloudToolApprovalControls {...props} toolCallId="call_other" />);
    view.rerender(<CloudToolApprovalControls {...props} toolCallId="call_1" />);
    expect(view.queryByLabelText('Guidance for Create Issue')).toBeNull();
  });

  it('says so when a call has no parameters', () => {
    const view = renderControls({ args: {} });
    expect(view.getByText('No parameters.')).toBeTruthy();
    expect(view.queryByLabelText('Raw JSON')).toBeNull();
  });
});

describe('the server review reaches the approval through the stream accumulator', () => {
  it('keeps risk_tier, destructive and approval_scopes from x_tool_approval_request', () => {
    const acc = createToolCallAccumulator();
    accumulateToolCallDelta(acc, {
      x_tool_approval_request: {
        tool_call_id: 'call_1',
        name: 'mcp__github__create_issue',
        args: PARAMETERS,
        risk_tier: 'medium',
        destructive: false,
        approval_scopes: ['once', 'session', 'session'],
      } as never,
    });
    const [tool] = toolCallList(acc);
    expect(tool!.status).toBe('awaiting-approval');
    expect(toolCallApprovalReview(tool!)).toEqual({
      riskTier: 'medium',
      destructive: false,
      scopes: ['once', 'session'],
    });
  });

  it('records no review for a request without one, so the card falls back to unreviewed', () => {
    const acc = createToolCallAccumulator();
    accumulateToolCallDelta(acc, {
      x_tool_approval_request: { tool_call_id: 'call_2', name: 'delete_file', args: {} },
    });
    expect(toolCallApprovalReview(toolCallList(acc)[0]!)).toBeUndefined();
  });

  it('shows the streamed review on the approval inside the activity timeline', () => {
    const acc = createToolCallAccumulator();
    accumulateToolCallDelta(acc, {
      x_tool_approval_request: {
        tool_call_id: 'call_4',
        name: 'mcp__github__create_issue',
        args: PARAMETERS,
        risk_tier: 'low',
        destructive: false,
        approval_scopes: ['once'],
      } as never,
    });
    const activity = {
      turnId: 'turn_1',
      status: 'awaiting-approval',
      startedAtMs: 1_000,
      updatedAtMs: 1_500,
      entries: [
        {
          kind: 'tool',
          id: 'tool:call_4',
          toolCallId: 'call_4',
          name: 'mcp__github__create_issue',
          category: 'connector',
          summary: 'Create Issue',
          status: 'awaiting-approval',
          input: PARAMETERS,
          startedAtMs: 1_100,
        },
      ],
    } as unknown as AgentActivityState;
    const view = render(
      <AgentActivityTimeline
        messageId="m1"
        activity={activity}
        approvalToolCalls={toolCallList(acc)}
        onResolveApproval={jest.fn()}
        onAllowApprovalForChat={jest.fn()}
        onAlwaysAllowApproval={jest.fn()}
      />,
    );
    expect(view.getByText('Low risk')).toBeTruthy();
    expect(view.getByLabelText('Allow once: Create Issue')).toBeTruthy();
    expect(view.queryByLabelText('Allow for this chat: Create Issue')).toBeNull();
    expect(view.queryByLabelText('Always allow: Create Issue')).toBeNull();
  });

  it('falls back to unreviewed in the activity timeline when no tool call carries a review', () => {
    const activity = {
      turnId: 'turn_2',
      status: 'awaiting-approval',
      startedAtMs: 1_000,
      updatedAtMs: 1_500,
      entries: [
        {
          kind: 'tool',
          id: 'tool:call_5',
          toolCallId: 'call_5',
          name: 'delete_file',
          category: 'file',
          summary: 'Delete file',
          status: 'awaiting-approval',
          input: { path: 'notes.txt' },
          startedAtMs: 1_100,
        },
      ],
    } as unknown as AgentActivityState;
    const view = render(
      <AgentActivityTimeline
        messageId="m2"
        activity={activity}
        onResolveApproval={jest.fn()}
        onAllowApprovalForChat={jest.fn()}
        onAlwaysAllowApproval={jest.fn()}
      />,
    );
    expect(view.getByText('High risk')).toBeTruthy();
    expect(view.queryByLabelText('Allow for this chat: Delete file')).toBeNull();
    expect(view.queryByLabelText('Always allow: Delete file')).toBeNull();
  });

  it('ignores a malformed review instead of widening the scopes', () => {
    const acc = createToolCallAccumulator();
    accumulateToolCallDelta(acc, {
      x_tool_approval_request: {
        tool_call_id: 'call_3',
        name: 'delete_file',
        args: {},
        risk_tier: 'none',
        destructive: false,
        approval_scopes: ['forever'],
      } as never,
    });
    expect(toolCallApprovalReview(toolCallList(acc)[0]!)).toBeUndefined();
  });
});
