/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { StyleSheet } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';

const mockScrollToEnd = jest.fn();
const mockScrollToIndex = jest.fn();
let mockListProps: Record<string, unknown> = {};

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useFlashListContext: () => undefined,
    useRecyclingState: (initial: unknown) => React.useState(initial),
    FlashList: React.forwardRef(function MockFlashList(
      props: Record<string, unknown> & {
        data: unknown[];
        renderItem: (info: { item: unknown; index: number }) => unknown;
      },
      ref: React.Ref<unknown>,
    ) {
      React.useImperativeHandle(ref, () => ({
        scrollToEnd: mockScrollToEnd,
        scrollToIndex: mockScrollToIndex,
      }));
      mockListProps = props;
      return (
        <View>
          {props.data.map((item, index) => (
            <React.Fragment key={index}>
              {props.renderItem({ item, index }) as never}
            </React.Fragment>
          ))}
        </View>
      );
    }),
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
const mockBubbleProps = jest.fn();
jest.mock('../src/features/chat/components/MessageBubble', () => {
  const RN = require('react-native');
  return {
    MessageBubble: (props: { message: { id: string; content: string } }) => {
      mockBubbleProps(props);
      return <RN.Text testID={`bubble-${props.message.id}`}>{props.message.content}</RN.Text>;
    },
  };
});
jest.mock('../src/features/chat/components/ChatEmptyState', () => ({ ChatEmptyState: () => null }));
jest.mock('../src/features/chat/components/research/ResearchRunCard', () => ({}));
jest.mock('@/lib/v1FeatureFlags', () => ({ FEATURES: { videoGen: true } }));

import { MessageList } from '../src/features/chat/components/MessageList';
import { colors, motion } from '../src/ui/theme/tokens';
import type { ChatMessage } from '../types/chat';

function message(id: string, role: ChatMessage['role']): ChatMessage {
  return {
    id,
    role,
    content: `message ${id}`,
    createdAt: '2026-11-14T10:00:00.000Z',
  } as ChatMessage;
}

function rowBackground(messageId: string): unknown {
  let node = screen.getByTestId(`bubble-${messageId}`).parent;
  while (node) {
    const background = StyleSheet.flatten(node.props.style)?.backgroundColor;
    if (background) return background;
    node = node.parent;
  }
  return undefined;
}

describe('MessageList opening at a message another answer cited', () => {
  const thread = [
    message('u1', 'user'),
    message('a1', 'assistant'),
    message('u2', 'user'),
    message('a2', 'assistant'),
  ];

  beforeEach(() => {
    jest.useFakeTimers();
    mockScrollToEnd.mockClear();
    mockScrollToIndex.mockClear();
    mockListProps = {};
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('scrolls to the cited message once it has loaded and highlights it briefly', () => {
    const view = render(<MessageList messages={[]} highlightMessageId="a1" />);
    expect(mockScrollToIndex).not.toHaveBeenCalled();

    view.rerender(<MessageList messages={thread} highlightMessageId="a1" />);

    expect(mockScrollToIndex).toHaveBeenCalledTimes(1);
    expect(mockScrollToIndex).toHaveBeenCalledWith({
      index: 1,
      animated: true,
      viewPosition: 0.5,
    });
    expect(rowBackground('a1')).toBe(colors.accentSurface);
    expect(rowBackground('a2')).toBeUndefined();

    act(() => jest.advanceTimersByTime(motion.ambient));
    expect(rowBackground('a1')).toBeUndefined();
  });

  it('does not pull the reader back to it when the thread updates later', () => {
    const view = render(<MessageList messages={thread} highlightMessageId="a1" />);
    view.rerender(
      <MessageList messages={[...thread, message('u3', 'user')]} highlightMessageId="a1" />,
    );

    expect(mockScrollToIndex).toHaveBeenCalledTimes(1);
  });

  it('stays at the bottom when nothing is cited', () => {
    render(<MessageList messages={thread} />);
    const onContentSizeChange = mockListProps.onContentSizeChange as (w: number, h: number) => void;
    act(() => onContentSizeChange(390, 1_000));

    expect(mockScrollToIndex).not.toHaveBeenCalled();
    expect(mockScrollToEnd).toHaveBeenCalled();
  });
});

describe('MessageList telling a question which answer follows it', () => {
  it('names the answer under each question and none for an answer or an unanswered question', () => {
    render(
      <MessageList
        messages={[message('u1', 'user'), message('a1', 'assistant'), message('u2', 'user')]}
      />,
    );

    const byId = new Map(
      mockBubbleProps.mock.calls.map(([props]) => [props.message.id, props.nextAnswerId]),
    );
    expect(byId.get('u1')).toBe('a1');
    expect(byId.get('a1')).toBeUndefined();
    expect(byId.get('u2')).toBeUndefined();
  });
});
