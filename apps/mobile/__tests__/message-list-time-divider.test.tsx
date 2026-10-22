/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('@shopify/flash-list', () => {
  const { View } = require('react-native');
  const { Fragment } = require('react');
  return {
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
jest.mock('@/components/ui/text', () => {
  const RN = require('react-native');
  return { Text: (props: Record<string, unknown>) => <RN.Text {...props} /> };
});
jest.mock('@/components/ui/pressable-box', () => {
  const RN = require('react-native');
  return { PressableBox: RN.Pressable };
});
jest.mock('../src/features/chat/components/MessageBubble', () => {
  const RN = require('react-native');
  return {
    MessageBubble: ({ message }: { message: { content: string } }) => (
      <RN.Text>{message.content}</RN.Text>
    ),
  };
});
jest.mock('../src/features/chat/components/ChatEmptyState', () => ({ ChatEmptyState: () => null }));
jest.mock('../src/features/chat/components/research/ResearchRunCard', () => ({}));
jest.mock('@/lib/v1FeatureFlags', () => ({ FEATURES: { videoGen: true } }));

import {
  MessageList,
  TimeDivider,
  shouldShowTimeDivider,
} from '../src/features/chat/components/MessageList';
import type { ChatMessage } from '../types/chat';

function message(id: string, createdAt: string): ChatMessage {
  return { id, role: 'user', content: `message ${id}`, createdAt } as ChatMessage;
}

describe('shouldShowTimeDivider', () => {
  it('separates messages three or more hours apart and leaves close ones together', () => {
    expect(shouldShowTimeDivider('2026-10-21T10:00:00Z', '2026-10-21T10:20:00Z')).toBe(false);
    expect(shouldShowTimeDivider('2026-10-21T10:00:00Z', '2026-10-21T12:59:00Z')).toBe(false);
    expect(shouldShowTimeDivider('2026-10-21T10:00:00Z', '2026-10-21T13:00:00Z')).toBe(true);
    expect(shouldShowTimeDivider('2026-10-20T10:00:00Z', '2026-10-22T10:00:00Z')).toBe(true);
  });

  it('shows nothing without two valid times', () => {
    expect(shouldShowTimeDivider(undefined, '2026-10-21T10:00:00Z')).toBe(false);
    expect(shouldShowTimeDivider('2026-10-21T10:00:00Z', undefined)).toBe(false);
    expect(shouldShowTimeDivider('nope', '2026-10-21T10:00:00Z')).toBe(false);
  });
});

describe('TimeDivider', () => {
  const now = new Date(2026, 9, 22, 12, 0, 0);

  it('names yesterday and the time, with the day in semibold', () => {
    const sent = new Date(2026, 9, 21, 20, 22, 0);
    const { getByText, getByTestId } = render(
      <TimeDivider createdAt={sent.toISOString()} now={now} />,
    );

    expect(getByText('Yesterday')).toHaveStyle({ fontWeight: '600' });
    expect(getByTestId('chat.time-divider').props.accessibilityLabel).toMatch(/^Yesterday .*22/);
  });

  it('names today for a message from earlier the same day', () => {
    const sent = new Date(2026, 9, 22, 7, 5, 0);
    const { getByText } = render(<TimeDivider createdAt={sent.toISOString()} now={now} />);

    expect(getByText('Today')).toBeTruthy();
  });

  it('gives the date, not a relative day name, for an older day', () => {
    const sent = new Date(2026, 9, 15, 9, 0, 0);
    const { getByTestId, queryByText } = render(
      <TimeDivider createdAt={sent.toISOString()} now={now} />,
    );

    expect(queryByText('Today')).toBeNull();
    expect(queryByText('Yesterday')).toBeNull();
    expect(getByTestId('chat.time-divider')).toBeTruthy();
  });
});

describe('MessageList time dividers', () => {
  it('puts a divider only before a message that follows a long gap', () => {
    const messages = [
      message('a', '2026-10-21T10:00:00Z'),
      message('b', '2026-10-21T10:05:00Z'),
      message('c', '2026-10-21T20:22:00Z'),
    ];
    const { getAllByTestId, getByText } = render(<MessageList messages={messages} />);

    expect(getAllByTestId('chat.time-divider')).toHaveLength(1);
    expect(getByText('message c')).toBeTruthy();
  });
});
