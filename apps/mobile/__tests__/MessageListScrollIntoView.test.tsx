/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

const mockScrollToEnd = jest.fn();
const mockScrollToOffset = jest.fn();
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
        scrollToOffset: mockScrollToOffset,
        getAbsoluteLastScrollOffset: () => 400,
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
jest.mock('../src/features/chat/components/MessageBubble', () => {
  const RN = require('react-native');
  const { useRevealInChat } = require('../src/features/chat/components/cards/ChatScrollIntoView');
  return {
    MessageBubble: ({ message }: { message: { id: string } }) => {
      const reveal = useRevealInChat();
      const field = {
        measureInWindow: (done: (x: number, y: number, w: number, h: number) => void) =>
          done(0, 900, 320, 60),
      };
      return (
        <RN.Pressable
          testID={`reveal-${message.id}`}
          onPress={() => reveal?.(field)}
          accessibilityLabel={reveal ? 'can reveal' : 'cannot reveal'}
        />
      );
    },
  };
});
jest.mock('../src/features/chat/components/ChatEmptyState', () => ({ ChatEmptyState: () => null }));
jest.mock('../src/features/chat/components/research/ResearchRunCard', () => ({}));
jest.mock('@/lib/v1FeatureFlags', () => ({ FEATURES: { videoGen: true } }));

import { MessageList } from '../src/features/chat/components/MessageList';
import type { ChatMessage } from '../types/chat';

type MeasureDone = (x: number, y: number, width: number, height: number) => void;
type Measured = { props: { testID?: string } };
const MockedView = jest.requireMock<{
  default: { prototype: { measureInWindow: (this: Measured, done: MeasureDone) => void } };
}>('react-native/Libraries/Components/View/View').default;

function message(id: string, role: ChatMessage['role']): ChatMessage {
  return {
    id,
    role,
    content: `message ${id}`,
    createdAt: '2026-11-14T10:00:00.000Z',
  } as ChatMessage;
}

describe('MessageList bringing a field inside an answer into view', () => {
  beforeEach(() => {
    mockScrollToEnd.mockClear();
    mockScrollToOffset.mockClear();
    mockListProps = {};
    jest.spyOn(MockedView.prototype, 'measureInWindow').mockImplementation(function measure(
      this: Measured,
      done: MeasureDone,
    ) {
      if (this.props.testID === 'chat.message-list') done(0, 100, 320, 600);
      else done(0, 0, 0, 0);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('gives every answer a way to scroll the thread and scrolls it to a field below the screen', () => {
    render(<MessageList messages={[message('u1', 'user'), message('a1', 'assistant')]} />);
    expect(screen.getByTestId('reveal-a1').props.accessibilityLabel).toBe('can reveal');

    fireEvent.press(screen.getByTestId('reveal-a1'));

    expect(mockScrollToOffset).toHaveBeenCalledWith({
      offset: 1184,
      animated: true,
      skipFirstItemOffset: true,
    });
  });

  it('stops following the bottom once it has scrolled to a field', () => {
    render(<MessageList messages={[message('u1', 'user'), message('a1', 'assistant')]} />);
    const onContentSizeChange = mockListProps.onContentSizeChange as (w: number, h: number) => void;
    act(() => onContentSizeChange(390, 1_000));
    expect(mockScrollToEnd).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId('reveal-a1'));
    act(() => onContentSizeChange(390, 1_400));

    expect(mockScrollToEnd).toHaveBeenCalledTimes(1);
  });
});
