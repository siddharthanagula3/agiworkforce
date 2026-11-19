/* eslint-disable @typescript-eslint/no-require-imports */
import { render, screen } from '@testing-library/react-native';
import type { ChatMessage } from '@/types/chat';

type RenderStackModule = typeof import('@shopify/flash-list/dist/recyclerview/RenderStackManager');
type ConsecutiveNumbersModule =
  typeof import('@shopify/flash-list/dist/recyclerview/helpers/ConsecutiveNumbers');

const mockMounts: string[] = [];

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');
  const { RenderStackManager } = jest.requireActual<RenderStackModule>(
    '@shopify/flash-list/dist/recyclerview/RenderStackManager',
  );
  const { ConsecutiveNumbers } = jest.requireActual<ConsecutiveNumbersModule>(
    '@shopify/flash-list/dist/recyclerview/helpers/ConsecutiveNumbers',
  );
  return {
    useFlashListContext: () => undefined,
    FlashList: function MockFlashList({
      data,
      renderItem,
      keyExtractor,
    }: {
      data: unknown[];
      renderItem: (info: { item: unknown; index: number }) => React.ReactNode;
      keyExtractor: (item: unknown, index: number) => string;
    }) {
      const [renderStack] = React.useState(() => new RenderStackManager());
      renderStack.sync(
        (index: number) => keyExtractor(data[index], index),
        () => 'default',
        new ConsecutiveNumbers(0, data.length - 1),
        data.length,
      );
      return (
        <View>
          {Array.from(
            renderStack.getRenderStack(),
            ([cellKey, { index }]: [string, { index: number }]) => (
              <View key={cellKey} testID={`cell-${cellKey}`}>
                {renderItem({ item: data[index], index })}
              </View>
            ),
          )}
        </View>
      );
    },
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
jest.mock('../MessageBubble', () => {
  const React = require('react');
  const RN = require('react-native');
  return {
    MessageBubble: ({ message }: { message: { id: string; content: string } }) => {
      const [laidOutFor] = React.useState(message.id);
      React.useEffect(() => {
        mockMounts.push(laidOutFor);
      }, [laidOutFor]);
      return (
        <RN.Text testID={`bubble-${message.id}`}>{`${laidOutFor}|${message.content}`}</RN.Text>
      );
    },
  };
});
jest.mock('../ChatEmptyState', () => ({ ChatEmptyState: () => null }));
jest.mock('@/lib/v1FeatureFlags', () => ({ FEATURES: { videoGen: true } }));

import { MessageList } from '../MessageList';

function message(
  id: string,
  role: ChatMessage['role'],
  content: string,
  isStreaming = false,
): ChatMessage {
  return {
    id,
    role,
    content,
    createdAt: '2026-11-16T18:20:00.000Z',
    ...(isStreaming ? { isStreaming: true } : {}),
  } as ChatMessage;
}

const question = message('q1', 'user', 'Explain in detail how rainbows form');

function rowShowing(messageId: string): string {
  return String(screen.getByTestId(`bubble-${messageId}`).props.children);
}

function cellHolding(messageId: string): string {
  let node = screen.getByTestId(`bubble-${messageId}`).parent;
  while (node && !String(node.props.testID ?? '').startsWith('cell-')) node = node.parent;
  return String(node?.props.testID);
}

describe('MessageList rows for the versions of an answer', () => {
  beforeEach(() => {
    mockMounts.length = 0;
  });

  it('reuses the same list cell for both versions, as the installed FlashList does', () => {
    const view = render(
      <MessageList messages={[question, message('a1', 'assistant', 'First version')]} />,
    );
    const firstCell = cellHolding('a1');

    view.rerender(
      <MessageList messages={[question, message('a2', 'assistant', 'Second version', true)]} />,
    );

    expect(cellHolding('a2')).toBe(firstCell);
  });

  it('gives a regenerated answer a row of its own, not the row the stopped version laid out', () => {
    const view = render(
      <MessageList messages={[question, message('a1', 'assistant', 'First version')]} />,
    );

    view.rerender(
      <MessageList messages={[question, message('a2', 'assistant', 'Second version', true)]} />,
    );

    expect(rowShowing('a2')).toBe('a2|Second version');
    expect(mockMounts).toEqual(['q1', 'a1', 'a2']);
  });

  it('gives the version the switcher moves to a fresh row each time', () => {
    const view = render(
      <MessageList messages={[question, message('a2', 'assistant', 'Second version')]} />,
    );

    view.rerender(
      <MessageList messages={[question, message('a1', 'assistant', 'First version')]} />,
    );
    expect(rowShowing('a1')).toBe('a1|First version');

    view.rerender(
      <MessageList messages={[question, message('a2', 'assistant', 'Second version')]} />,
    );
    expect(rowShowing('a2')).toBe('a2|Second version');
    expect(mockMounts).toEqual(['q1', 'a2', 'a1', 'a2']);
  });

  it('keeps one row while the same answer streams and then stops', () => {
    const view = render(
      <MessageList messages={[question, message('a2', 'assistant', 'Light', true)]} />,
    );
    view.rerender(
      <MessageList messages={[question, message('a2', 'assistant', 'Light bends', true)]} />,
    );
    view.rerender(
      <MessageList messages={[question, message('a2', 'assistant', 'Light bends as it')]} />,
    );

    expect(rowShowing('a2')).toBe('a2|Light bends as it');
    expect(mockMounts).toEqual(['q1', 'a2']);
  });
});
