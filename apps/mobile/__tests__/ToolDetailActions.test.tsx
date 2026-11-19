/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { Share } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import type { AgentActivityEntry, AgentActivityState } from '@agiworkforce/client-runtime';

const mockCopy = jest.fn(async (_text: string) => true);
jest.mock('@/lib/clipboard', () => ({
  copyToClipboard: (text: string) => mockCopy(text),
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

import { AgentActivityTimeline } from '@/src/features/chat/components/AgentActivityTimeline';
import { ToolCallTimeline } from '@/src/features/chat/components/ToolCallTimeline';
import { formatToolDetailText } from '@/src/features/chat/utils/toolDetailText';
import type { ToolCall } from '@/types/chat';

const ENVELOPE = JSON.stringify({
  agi_connector_authorization_required: true,
  connectorId: 'notion',
  connectorName: 'Notion',
  toolName: 'search',
  reason: 'authorization_expired',
  connectUrl: '/api/connectors/oauth/start?connectorId=notion',
});
const EXPIRED_SENTENCE =
  'Your Notion authorization expired or was revoked, so the request couldn’t run.';

function activity(entries: AgentActivityEntry[]): AgentActivityState {
  return {
    turnId: 'turn-1',
    status: 'completed',
    startedAtMs: 1_000,
    updatedAtMs: 2_000,
    completedAtMs: 2_000,
    entries,
  } as unknown as AgentActivityState;
}

function toolEntry(overrides: Record<string, unknown>): AgentActivityEntry {
  return {
    kind: 'tool',
    id: 'tool:t1',
    toolCallId: 't1',
    name: 'mcp__github__create_issue',
    category: 'connector',
    summary: 'Create Issue',
    status: 'completed',
    startedAtMs: 1_100,
    ...overrides,
  } as AgentActivityEntry;
}

describe('formatToolDetailText', () => {
  it('pretty prints a JSON object or array and leaves other text as written', () => {
    expect(formatToolDetailText('{"a":1,"b":[2]}')).toBe('{\n  "a": 1,\n  "b": [\n    2\n  ]\n}');
    expect(formatToolDetailText('plain output\nline 2')).toBe('plain output\nline 2');
    expect(formatToolDetailText('{not json')).toBe('{not json');
    expect(formatToolDetailText('42')).toBe('42');
  });
});

describe('tool request and result in the activity timeline', () => {
  afterEach(() => {
    mockCopy.mockClear();
    jest.restoreAllMocks();
  });

  it('copies and shares the exact formatted request and result', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    const view = render(
      <AgentActivityTimeline
        messageId="m1"
        defaultExpanded
        activity={activity([
          toolEntry({ input: '{"repo":"agi/web","title":"Ship it"}', output: { number: 7 } }),
        ])}
      />,
    );
    fireEvent.press(view.getByLabelText(/^Created an item in Github, /));
    const request = '{\n  "repo": "agi/web",\n  "title": "Ship it"\n}';
    expect(view.getByText(request)).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByLabelText('Copy request'));
    });
    expect(mockCopy).toHaveBeenLastCalledWith(request);
    expect(view.getByTestId('tool-request-actions.copy').props.accessibilityLabel).toBe('Copied');

    await act(async () => {
      fireEvent.press(view.getByLabelText('Copy result'));
    });
    expect(mockCopy).toHaveBeenLastCalledWith('{\n  "number": 7\n}');

    fireEvent.press(view.getByLabelText('Share result'));
    expect(share).toHaveBeenCalledWith({ message: '{\n  "number": 7\n}' });
  });

  it('shows a connector authorization failure as one sentence, never the envelope', () => {
    const view = render(
      <AgentActivityTimeline
        messageId="m2"
        defaultExpanded
        activity={activity([
          toolEntry({
            name: 'mcp__notion__search',
            summary: 'Search',
            status: 'failed',
            input: '{"query":"plan"}',
            output: ENVELOPE,
            error: ENVELOPE,
          }),
        ])}
      />,
    );
    fireEvent.press(view.getByLabelText(/^Could not search Notion, /));
    expect(view.getByText(EXPIRED_SENTENCE)).toBeTruthy();
    expect(view.queryByText(/agi_connector_authorization_required/)).toBeNull();
    expect(view.queryByLabelText('Copy result')).toBeNull();
  });
});

describe('tool request and response in the legacy tool timeline', () => {
  afterEach(() => mockCopy.mockClear());

  function expandRow(view: ReturnType<typeof render>, summary: string) {
    fireEvent.press(view.getByText(summary));
    fireEvent.press(view.getByA11yHint('Double tap to expand details'));
  }

  it('replaces the connector envelope with the sentence', () => {
    const tool: ToolCall = {
      id: 'tool-1',
      name: 'mcp__notion__search',
      status: 'failed',
      input: '{"query":"plan"}',
      output: ENVELOPE,
    };
    const view = render(<ToolCallTimeline toolCalls={[tool]} summary="Used 1 tool" />);
    expandRow(view, 'Used 1 tool');
    expect(view.getByText(EXPIRED_SENTENCE)).toBeTruthy();
    expect(view.queryByText(/agi_connector_authorization_required/)).toBeNull();
  });

  it('copies the formatted request', async () => {
    const tool: ToolCall = {
      id: 'tool-2',
      name: 'mcp__github__create_issue',
      status: 'succeeded',
      input: '{"title":"Ship it"}',
      output: 'Created issue 7',
    };
    const view = render(<ToolCallTimeline toolCalls={[tool]} summary="Used 1 tool" />);
    expandRow(view, 'Used 1 tool');
    await act(async () => {
      fireEvent.press(view.getByTestId('tool-request-actions.copy'));
    });
    expect(mockCopy).toHaveBeenLastCalledWith('{\n  "title": "Ship it"\n}');
    await act(async () => {
      fireEvent.press(view.getByTestId('tool-result-actions.copy'));
    });
    expect(mockCopy).toHaveBeenLastCalledWith('Created issue 7');
  });
});
