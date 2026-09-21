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
  return { MessageBubble: () => <View testID="chat.message-bubble" /> };
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
import { READING_COLUMN_MAX_WIDTH } from '@/src/shared/layout/contentColumn';
import type { ChatMessage } from '@/types/chat';

function message(id: string): ChatMessage {
  return {
    id,
    role: 'user',
    content: `message ${id}`,
    createdAt: new Date().toISOString(),
  } as unknown as ChatMessage;
}

function maxWidthOf(node: { props: { style?: unknown } }): number | undefined {
  const style = node.props.style as
    { maxWidth?: number } | Array<{ maxWidth?: number } | undefined> | undefined;
  if (Array.isArray(style)) {
    return style.find((entry) => entry?.maxWidth !== undefined)?.maxWidth;
  }
  return style?.maxWidth;
}

describe('the thread on a wide pane', () => {
  it('leaves the scroll surface the whole pane and caps only the rows', () => {
    const { getByTestId, getAllByTestId } = render(
      <MessageList messages={[message('a'), message('b')]} />,
    );

    expect(maxWidthOf(getByTestId('chat.message-list'))).toBeUndefined();
    expect(maxWidthOf(getByTestId('chat.message-list.scroller'))).toBeUndefined();

    const rows = getAllByTestId('chat.message-row');
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(maxWidthOf(row)).toBe(READING_COLUMN_MAX_WIDTH);
    }
  });

  it('keeps the empty state inside the same column', () => {
    const { getByTestId, queryByTestId } = render(<MessageList messages={[]} />);

    expect(getByTestId('chat.empty-state')).toBeTruthy();
    expect(queryByTestId('chat.message-list')).toBeNull();
  });

  it('anchors the jump-to-latest control to the column without blocking the pane', () => {
    const { getByLabelText, getByTestId } = render(<MessageList messages={[message('a')]} />);

    const button = getByLabelText('Scroll to bottom');
    expect(button).toBeTruthy();

    let node = button.parent;
    let overlay: typeof node = null;
    while (node) {
      if (node.props?.pointerEvents === 'box-none') overlay = node;
      node = node.parent;
    }
    expect(overlay).not.toBeNull();
    expect(getByTestId('chat.message-list')).toBeTruthy();
  });
});
