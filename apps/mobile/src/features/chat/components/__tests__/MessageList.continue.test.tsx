/* eslint-disable @typescript-eslint/no-require-imports */
import { render } from '@testing-library/react-native';

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useFlashListContext: () => undefined,
    FlashList: ({
      data,
      renderItem,
      keyExtractor,
    }: {
      data: unknown[];
      renderItem: (info: { item: unknown; index: number }) => React.ReactNode;
      keyExtractor: (item: unknown) => string;
    }) => (
      <View>
        {data.map((item, index) => (
          <React.Fragment key={keyExtractor(item)}>{renderItem({ item, index })}</React.Fragment>
        ))}
      </View>
    ),
  };
});

jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { Swipeable: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'Medium' },
}));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? true : icon) });
});

const mockBubbleProps: Array<{ id: string; onContinueMessage?: unknown }> = [];
jest.mock('../MessageBubble', () => ({
  MessageBubble: (props: { message: { id: string }; onContinueMessage?: unknown }) => {
    mockBubbleProps.push({ id: props.message.id, onContinueMessage: props.onContinueMessage });
    return null;
  },
}));

jest.mock('../ChatEmptyState', () => ({ ChatEmptyState: () => null }));

jest.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ hapticsEnabled: false }),
}));

import { MessageList } from '../MessageList';
import type { ChatMessage } from '@/types/chat';

function message(id: string, role: 'user' | 'assistant'): ChatMessage {
  return {
    id,
    conversationId: 'conversation-1',
    role,
    content: `message ${id}`,
    createdAt: new Date().toISOString(),
  };
}

describe('MessageList Continue generating', () => {
  beforeEach(() => {
    mockBubbleProps.length = 0;
  });

  it('hands the Continue control to the one answer the screen names', () => {
    const onContinueMessage = jest.fn();
    render(
      <MessageList
        messages={[
          message('question-1', 'user'),
          message('answer-1', 'assistant'),
          message('question-2', 'user'),
          message('answer-2', 'assistant'),
        ]}
        continuableMessageId="answer-2"
        onContinueMessage={onContinueMessage}
      />,
    );

    const offered = mockBubbleProps.filter((props) => props.onContinueMessage !== undefined);
    expect(offered.map((props) => props.id)).toEqual(['answer-2']);
    expect(offered[0]?.onContinueMessage).toBe(onContinueMessage);
  });

  it('offers it to no row when the screen names none', () => {
    render(
      <MessageList
        messages={[message('question-1', 'user'), message('answer-1', 'assistant')]}
        onContinueMessage={jest.fn()}
      />,
    );

    expect(mockBubbleProps.every((props) => props.onContinueMessage === undefined)).toBe(true);
  });
});
