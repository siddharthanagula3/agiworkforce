/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { AgentActivityState } from '@agiworkforce/client-runtime';

const mockGet = jest.fn();
const mockDelete = jest.fn();

jest.mock('@/services/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
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

import { ApiHttpError } from '@/services/apiErrors';
import { AgentActivityTimeline } from '@/src/features/chat/components/AgentActivityTimeline';
import { ToolCallTimeline } from '@/src/features/chat/components/ToolCallTimeline';
import { stopAllowingChatTool } from '@/src/features/chat/services/chatToolGrants';
import type { ToolCall } from '@/types/chat';

const CONVERSATION = '11111111-2222-4333-8444-555555555555';
const GRANT = '66666666-7777-4888-9999-000000000000';
const OTHER_GRANT = '66666666-7777-4888-9999-000000000001';
const TOOL = 'mcp__notion__search_pages';
const GRANTS_PATH = `/api/chat/conversations/${CONVERSATION}/tool-grants`;
const GRANT_PATH = `${GRANTS_PATH}/${GRANT}`;

function grant(id: string, connectorId: string, toolName: string) {
  return {
    id,
    connectorId,
    toolName,
    riskTier: 'medium',
    destructive: false,
    grantedAt: '2026-11-15T09:00:00.000Z',
  };
}

function activityWith(decision: 'approved' | 'approved-for-session'): AgentActivityState {
  return {
    turnId: 'turn-1',
    status: 'completed',
    startedAtMs: 1_000,
    updatedAtMs: 2_000,
    entries: [
      {
        kind: 'tool',
        id: 'tool:call-1',
        toolCallId: 'call-1',
        name: TOOL,
        category: 'connector',
        summary: 'Search Notion',
        status: 'completed',
        input: { query: 'roadmap' },
        output: 'Found 2 pages',
        approval: { id: 'call-1', decision },
        startedAtMs: 1_100,
        completedAtMs: 1_900,
        elapsedMs: 800,
      },
    ],
  } as unknown as AgentActivityState;
}

type AlertButtons = { text?: string; style?: string; onPress?: () => void }[];

beforeEach(() => {
  mockGet.mockReset();
  mockDelete.mockReset();
  jest.restoreAllMocks();
});

describe('stopAllowingChatTool', () => {
  it('revokes only the grant for this connector tool in this chat', async () => {
    mockGet.mockResolvedValue({
      grants: [grant(OTHER_GRANT, 'notion', 'create_page'), grant(GRANT, 'notion', 'search_pages')],
    });
    mockDelete.mockResolvedValue({ success: true, removed: 1 });

    await expect(stopAllowingChatTool(CONVERSATION, TOOL)).resolves.toBe('stopped');
    expect(mockGet).toHaveBeenCalledWith(GRANTS_PATH);
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledWith(GRANT_PATH);
  });

  it('reports a grant that is already gone without deleting anything else', async () => {
    mockGet.mockResolvedValue({ grants: [grant(OTHER_GRANT, 'notion', 'create_page')] });
    await expect(stopAllowingChatTool(CONVERSATION, TOOL)).resolves.toBe('gone');
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('treats a grant removed meanwhile as gone', async () => {
    mockGet.mockResolvedValue({ grants: [grant(GRANT, 'notion', 'search_pages')] });
    mockDelete.mockRejectedValue(
      new ApiHttpError('This tool is no longer allowed in this chat', 404),
    );
    await expect(stopAllowingChatTool(CONVERSATION, TOOL)).resolves.toBe('gone');
  });

  it('never asks the server about a tool that is not a connector tool', async () => {
    await expect(stopAllowingChatTool(CONVERSATION, 'web_search')).resolves.toBe('gone');
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('Stop allowing from the chat', () => {
  it('asks first, then revokes the chat grant and says the tool will ask again', async () => {
    mockGet.mockResolvedValue({ grants: [grant(GRANT, 'notion', 'search_pages')] });
    mockDelete.mockResolvedValue({ success: true, removed: 1 });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const view = render(
      <AgentActivityTimeline
        messageId="m1"
        defaultExpanded
        activity={activityWith('approved-for-session')}
        codeRunConversationId={CONVERSATION}
      />,
    );

    await waitFor(() => expect(view.getByText('Allowed for this chat')).toBeTruthy());
    fireEvent.press(view.getByLabelText('Stop allowing Search Pages in this chat'));

    expect(mockDelete).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledTimes(1);
    const [title, message, buttons] = alert.mock.calls[0]! as [string, string, AlertButtons];
    expect(title).toBe('Stop allowing Search Pages?');
    expect(message).toBe(
      'Search Pages will ask for your approval again the next time this chat uses it.',
    );
    const confirm = buttons.find((button) => button.text === 'Stop allowing');
    expect(confirm?.style).toBe('destructive');
    act(() => confirm!.onPress!());

    await waitFor(() =>
      expect(
        view.getByText(
          'Search Pages will ask for your approval again the next time this chat uses it.',
        ),
      ).toBeTruthy(),
    );
    expect(mockDelete).toHaveBeenCalledWith(GRANT_PATH);
    expect(view.queryByText('Allowed for this chat')).toBeNull();
  });

  it('does nothing when the person cancels', async () => {
    mockGet.mockResolvedValue({ grants: [grant(GRANT, 'notion', 'search_pages')] });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const view = render(
      <AgentActivityTimeline
        messageId="m1"
        defaultExpanded
        activity={activityWith('approved-for-session')}
        codeRunConversationId={CONVERSATION}
      />,
    );
    await waitFor(() => expect(view.getByText('Allowed for this chat')).toBeTruthy());
    fireEvent.press(view.getByLabelText('Stop allowing Search Pages in this chat'));
    const buttons = alert.mock.calls[0]![2] as AlertButtons;
    buttons.find((button) => button.text === 'Cancel')?.onPress?.();
    expect(mockDelete).not.toHaveBeenCalled();
    expect(view.getByText('Allowed for this chat')).toBeTruthy();
  });

  it('keeps Stop allowing and says so when the revoke fails', async () => {
    mockGet.mockResolvedValue({ grants: [grant(GRANT, 'notion', 'search_pages')] });
    mockDelete.mockRejectedValue(new ApiHttpError('Server error', 500));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const view = render(
      <AgentActivityTimeline
        messageId="m1"
        defaultExpanded
        activity={activityWith('approved-for-session')}
        codeRunConversationId={CONVERSATION}
      />,
    );
    await waitFor(() => expect(view.getByText('Allowed for this chat')).toBeTruthy());
    fireEvent.press(view.getByLabelText('Stop allowing Search Pages in this chat'));
    const stop = (alert.mock.calls[0]![2] as AlertButtons).find(
      (button) => button.text === 'Stop allowing',
    );
    act(() => stop!.onPress!());
    await waitFor(() =>
      expect(view.getByText('Could not stop allowing this tool. Try again.')).toBeTruthy(),
    );
    expect(view.getByLabelText('Stop allowing Search Pages in this chat')).toBeTruthy();
  });

  it('shows nothing once the server no longer holds the grant', async () => {
    mockGet.mockResolvedValue({ grants: [] });
    const view = render(
      <AgentActivityTimeline
        messageId="m1"
        defaultExpanded
        activity={activityWith('approved-for-session')}
        codeRunConversationId={CONVERSATION}
      />,
    );
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith(GRANTS_PATH));
    await waitFor(() => expect(view.queryByText('Allowed for this chat')).toBeNull());
    expect(view.queryByLabelText('Stop allowing Search Pages in this chat')).toBeNull();
  });

  it('offers nothing for a call allowed once', () => {
    const view = render(
      <AgentActivityTimeline
        messageId="m1"
        defaultExpanded
        activity={activityWith('approved')}
        codeRunConversationId={CONVERSATION}
      />,
    );
    expect(view.queryByText('Allowed for this chat')).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('offers Stop allowing in the tool call timeline too', async () => {
    mockGet.mockResolvedValue({ grants: [grant(GRANT, 'notion', 'search_pages')] });
    const toolCalls: ToolCall[] = [
      {
        id: 'id:call-1',
        toolCallId: 'call-1',
        name: TOOL,
        status: 'succeeded',
        input: '{"query":"roadmap"}',
        output: 'Found 2 pages',
        requiresApproval: true,
        approvalDecision: 'approved',
        approvalScope: 'approved-for-session',
      } as ToolCall,
    ];
    const view = render(
      <ToolCallTimeline
        messageId="m1"
        toolCalls={toolCalls}
        summary="Used Notion"
        codeRunConversationId={CONVERSATION}
      />,
    );
    fireEvent.press(view.getByLabelText('Used Notion, collapsed'));
    await waitFor(() =>
      expect(view.getByLabelText('Stop allowing Search Pages in this chat')).toBeTruthy(),
    );
  });
});
