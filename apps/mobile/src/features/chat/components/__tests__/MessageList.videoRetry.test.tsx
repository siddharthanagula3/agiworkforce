/* eslint-disable @typescript-eslint/no-require-imports */
import { render } from '@testing-library/react-native';

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    FlashList: ({
      data,
      renderItem,
      keyExtractor,
      contentContainerStyle,
    }: {
      data: unknown[];
      renderItem: (info: { item: unknown }) => React.ReactNode;
      keyExtractor: (item: unknown) => string;
      contentContainerStyle?: unknown;
    }) => (
      <View testID="chat.message-list.scroller" style={contentContainerStyle}>
        {data.map((item) => (
          <React.Fragment key={keyExtractor(item)}>{renderItem({ item })}</React.Fragment>
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

jest.mock('../MessageBubble', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    MessageBubble: ({
      message,
      onRetryMessage,
      onRetryWithModel,
    }: {
      message: { id: string };
      onRetryMessage?: unknown;
      onRetryWithModel?: unknown;
    }) => (
      <View
        testID={`bubble-${message.id}`}
        accessibilityHint={`${onRetryMessage ? 'retry' : 'no-retry'}|${onRetryWithModel ? 'model' : 'no-model'}`}
      />
    ),
  };
});

jest.mock('../ChatEmptyState', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { ChatEmptyState: () => <View testID="chat.empty-state" /> };
});

jest.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ hapticsEnabled: false }),
}));

import { MessageList } from '../MessageList';
import { FEATURES } from '@/lib/v1FeatureFlags';
import type { ChatMessage } from '@/types/chat';

function message(id: string, fields: Partial<ChatMessage>): ChatMessage {
  return {
    id,
    role: 'assistant',
    content: `message ${id}`,
    createdAt: new Date().toISOString(),
    ...fields,
  } as unknown as ChatMessage;
}

const MESSAGES = [
  message('text', {}),
  message('video', { type: 'video' } as Partial<ChatMessage>),
  message('failed-video', { videoGenStatus: 'failed' } as Partial<ChatMessage>),
  message('user', { role: 'user' } as Partial<ChatMessage>),
];

function retryState() {
  const screen = render(
    <MessageList messages={MESSAGES} onRetryMessage={jest.fn()} onRetryWithModel={jest.fn()} />,
  );
  return (id: string) => screen.getByTestId(`bubble-${id}`).props.accessibilityHint;
}

describe('MessageList retry on generated video', () => {
  it('offers no retry on a video turn in a build without video generation', () => {
    const hintFor = retryState();

    expect(hintFor('video')).toBe('no-retry|no-model');
    expect(hintFor('failed-video')).toBe('no-retry|no-model');
    expect(hintFor('text')).toBe('retry|model');
    expect(hintFor('user')).toBe('retry|model');
  });

  it('keeps retry on a video turn when the build includes video generation', () => {
    const features = FEATURES as { videoGen: boolean };
    features.videoGen = true;
    try {
      const hintFor = retryState();
      expect(hintFor('video')).toBe('retry|model');
      expect(hintFor('failed-video')).toBe('retry|model');
    } finally {
      features.videoGen = false;
    }
  });
});
