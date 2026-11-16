/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { render } from '@testing-library/react-native';
import type { AgentActivityState } from '@agiworkforce/client-runtime';

jest.mock('@shopify/flash-list', () => {
  const { View } = require('react-native');
  const { Fragment } = require('react');
  return {
    useFlashListContext: () => undefined,
    FlashList: ({
      data,
      renderItem,
    }: {
      data: unknown[];
      renderItem: (info: { item: unknown; index: number }) => unknown;
    }) => (
      <View>
        {data.map((item, index) => (
          <Fragment key={index}>{renderItem({ item, index }) as never}</Fragment>
        ))}
      </View>
    ),
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
jest.mock('react-native-gesture-handler', () => ({ Swipeable: () => null }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Medium: 'm' } }));
jest.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (selector: (state: { hapticsEnabled: boolean }) => unknown) =>
    selector({ hapticsEnabled: false }),
}));
jest.mock('@/src/ui/theme', () => {
  const actual = jest.requireActual('@/src/ui/theme/tokens');
  return { ...actual, useThemeColors: () => actual.colors };
});
jest.mock('@/components/ui/Text', () => {
  const RN = require('react-native');
  return { Text: (props: Record<string, unknown>) => <RN.Text {...props} /> };
});
jest.mock('@/components/ui/PressableBox', () => {
  const RN = require('react-native');
  return { PressableBox: RN.Pressable };
});
const mockBubble = jest.fn();
jest.mock('../src/features/chat/components/MessageBubble', () => ({
  MessageBubble: (props: Record<string, unknown>) => {
    mockBubble(props);
    return null;
  },
}));
jest.mock('../src/features/chat/components/ChatEmptyState', () => ({ ChatEmptyState: () => null }));
jest.mock('../src/features/chat/components/research/ResearchRunCard', () => ({}));
jest.mock('@/lib/v1FeatureFlags', () => ({ FEATURES: { videoGen: true } }));

import { applyAgentActivityEvent } from '@agiworkforce/client-runtime';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import {
  AGENT_EVENT_SCHEMA_VERSION,
  WEB_SEARCH_NOT_PERFORMED_CODE,
} from '@agiworkforce/cloud-contracts';
import { MessageList, turnOutcomeAnnouncement } from '../src/features/chat/components/MessageList';
import type { ChatMessage } from '../types/chat';

const DENIAL = 'The user denied permission to run this tool.';
const NOT_PERFORMED =
  'Web search was not approved or available, so this answer could not be verified.';

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

function searchTurn(decision: 'approved' | 'denied', output: string): AgentActivityState {
  return replay([
    {
      type: 'approval-requested',
      approvalId: 'approval-1',
      toolCallId: 'call-1',
      name: 'web_search',
      category: 'web-search',
      summary: 'Look up the weather',
      input: { query: 'weather in Paris' },
    },
    { type: 'approval-resolved', approvalId: 'approval-1', decision },
    {
      type: 'tool-execution-end',
      toolCallId: 'call-1',
      name: 'web_search',
      output,
      isError: true,
      elapsedMs: 0,
    },
    {
      type: 'error',
      code: WEB_SEARCH_NOT_PERFORMED_CODE,
      message: NOT_PERFORMED,
      retryable: false,
    },
    { type: 'stop', reason: 'error' },
  ]);
}

function answer(agentActivity: AgentActivityState): ChatMessage {
  return {
    id: 'answer-1',
    conversationId: 'conversation-1',
    role: 'assistant',
    content: '',
    createdAt: '2026-11-15T10:00:00Z',
    metadata: {
      agentActivity,
      streamError: { code: WEB_SEARCH_NOT_PERFORMED_CODE, message: NOT_PERFORMED },
    },
  } as ChatMessage;
}

describe('turnOutcomeAnnouncement', () => {
  it('does not announce a turn the person ended by declining the search as failed', () => {
    expect(turnOutcomeAnnouncement(answer(searchTurn('denied', DENIAL)))).toBe('Response complete');
  });

  it('does not announce an older answer whose only tool call was declined as failed', () => {
    const message = {
      ...answer(searchTurn('denied', DENIAL)),
      metadata: { streamError: { code: WEB_SEARCH_NOT_PERFORMED_CODE, message: NOT_PERFORMED } },
      toolCalls: [
        { id: 'call-1', name: 'web_search', status: 'failed', approvalDecision: 'rejected' },
      ],
    } as ChatMessage;
    expect(turnOutcomeAnnouncement(message)).toBe('Response complete');
  });

  it('still announces a search that was approved but could not run as failed', () => {
    const unavailable = searchTurn(
      'approved',
      'Tool "web_search" is not available and was not executed.',
    );
    expect(turnOutcomeAnnouncement(answer(unavailable))).toBe('Response failed');
  });
});

describe('MessageList image controls', () => {
  beforeEach(() => mockBubble.mockClear());

  it('gives each bubble the whole-image edit and the temporary-chat flag', () => {
    const onEditImage = jest.fn();
    const message = { ...answer(searchTurn('denied', DENIAL)), metadata: {} } as ChatMessage;
    render(<MessageList messages={[message]} onEditImage={onEditImage} inTemporaryChat />);
    expect(mockBubble.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ onEditImage, inTemporaryChat: true }),
    );
  });

  it('treats a chat as kept unless the screen says it is temporary', () => {
    const message = { ...answer(searchTurn('denied', DENIAL)), metadata: {} } as ChatMessage;
    render(<MessageList messages={[message]} />);
    expect(mockBubble.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ onEditImage: undefined, inTemporaryChat: false }),
    );
  });
});

describe('MessageList run liveness', () => {
  beforeEach(() => mockBubble.mockClear());

  const question = {
    id: 'question-1',
    conversationId: 'conversation-1',
    role: 'user',
    content: 'Explain tides',
    createdAt: '2026-11-15T10:00:00Z',
  } as ChatMessage;
  const older = { ...answer(searchTurn('denied', DENIAL)), id: 'answer-0', metadata: {} };
  const latest = { ...answer(searchTurn('denied', DENIAL)), id: 'answer-2', metadata: {} };

  function liveRunFor(id: string): unknown {
    const call = [...mockBubble.mock.calls]
      .reverse()
      .find(([props]) => (props as { message: ChatMessage }).message.id === id);
    return (call?.[0] as { liveRun?: unknown }).liveRun;
  }

  it('marks every earlier answer as ended and gives the last one what the server said', () => {
    render(
      <MessageList
        messages={[older, question, latest] as ChatMessage[]}
        lastAnswerLiveRun="live"
      />,
    );

    expect(liveRunFor('answer-0')).toBe('ended');
    expect(liveRunFor('question-1')).toBeUndefined();
    expect(liveRunFor('answer-2')).toBe('live');
  });

  it('leaves the last answer as stored while nothing is known about its run', () => {
    render(<MessageList messages={[older, question, latest] as ChatMessage[]} />);

    expect(liveRunFor('answer-0')).toBe('ended');
    expect(liveRunFor('answer-2')).toBeUndefined();
  });
});

describe('MessageList screen reader announcements', () => {
  const { AccessibilityInfo } = require('react-native');
  let announce: jest.SpyInstance;

  beforeEach(() => {
    announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
  });

  afterEach(() => announce.mockRestore());

  const question = {
    id: 'question-1',
    conversationId: 'conversation-1',
    role: 'user',
    content: 'Explain tides',
    createdAt: '2026-11-15T10:00:00Z',
  } as ChatMessage;
  const reply = (content: string, isStreaming: boolean) =>
    ({
      id: 'answer-1',
      conversationId: 'conversation-1',
      role: 'assistant',
      content,
      createdAt: '2026-11-15T10:00:01Z',
      isStreaming,
    }) as ChatMessage;

  it('says Responding once when an answer starts and the outcome once when it ends', () => {
    const view = render(<MessageList messages={[question]} />);
    expect(announce).not.toHaveBeenCalled();

    view.rerender(<MessageList messages={[question, reply('', true)]} />);
    view.rerender(<MessageList messages={[question, reply('Tides', true)]} />);
    view.rerender(<MessageList messages={[question, reply('Tides rise', true)]} />);
    expect(announce.mock.calls).toEqual([['Responding']]);

    view.rerender(<MessageList messages={[question, reply('Tides rise twice a day.', false)]} />);
    expect(announce.mock.calls).toEqual([['Responding'], ['Response complete']]);
  });

  it('says Responding again for the next turn', () => {
    const second = { ...question, id: 'question-2' };
    const next = { ...reply('', true), id: 'answer-2' };
    const view = render(<MessageList messages={[question, reply('Tides', false)]} />);
    view.rerender(<MessageList messages={[question, reply('Tides', false), second]} />);
    view.rerender(<MessageList messages={[question, reply('Tides', false), second, next]} />);

    expect(announce.mock.calls).toEqual([['Responding']]);
  });

  it('does not say Responding when an answer that is already written is shown', () => {
    render(<MessageList messages={[question, reply('Tides rise twice a day.', false)]} />);

    expect(announce).not.toHaveBeenCalled();
  });
});
