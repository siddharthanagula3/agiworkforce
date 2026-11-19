/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { act, render } from '@testing-library/react-native';

const mockScrollToEnd = jest.fn();
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
        ListFooterComponent?: React.ReactNode;
      },
      ref: React.Ref<unknown>,
    ) {
      React.useImperativeHandle(ref, () => ({ scrollToEnd: mockScrollToEnd }));
      mockListProps = props;
      return (
        <View>
          {props.data.map((item, index) => (
            <React.Fragment key={index}>
              {props.renderItem({ item, index }) as never}
            </React.Fragment>
          ))}
          {props.ListFooterComponent}
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
  return {
    MessageBubble: ({ message }: { message: { content: string } }) => (
      <RN.Text>{message.content}</RN.Text>
    ),
  };
});
jest.mock('../src/features/chat/components/ChatEmptyState', () => ({ ChatEmptyState: () => null }));
jest.mock('../src/features/chat/components/research/ResearchRunCard', () => ({}));
jest.mock('@/lib/v1FeatureFlags', () => ({ FEATURES: { videoGen: true } }));

import { MessageList } from '../src/features/chat/components/MessageList';
import type { ChatMessage } from '../types/chat';

const VIEWPORT = 600;

function message(id: string, role: ChatMessage['role']): ChatMessage {
  return {
    id,
    role,
    content: `message ${id}`,
    createdAt: '2026-11-14T10:00:00.000Z',
  } as ChatMessage;
}

function scrollEvent(offsetY: number, contentHeight: number) {
  return {
    nativeEvent: {
      contentOffset: { x: 0, y: offsetY },
      contentSize: { width: 390, height: contentHeight },
      layoutMeasurement: { width: 390, height: VIEWPORT },
      velocity: { x: 0, y: 0 },
    },
  };
}

function call(name: string, ...args: unknown[]) {
  const handler = mockListProps[name] as ((...values: unknown[]) => void) | undefined;
  if (!handler) throw new Error(`MessageList passes no ${name} to the list`);
  act(() => handler(...args));
}

describe('MessageList following the bottom of the conversation', () => {
  const thread = [message('u1', 'user'), message('a1', 'assistant')];

  beforeEach(() => {
    mockScrollToEnd.mockClear();
    mockListProps = {};
  });

  it('gives the list a bottom threshold it reads as a share of the screen, not points', () => {
    render(<MessageList messages={thread} />);

    const threshold = (
      mockListProps.maintainVisibleContentPosition as { autoscrollToBottomThreshold?: number }
    ).autoscrollToBottomThreshold;
    expect(threshold === undefined || threshold <= 1).toBe(true);
  });

  it('brings content that appears below the answer into view while the reader is at the bottom', () => {
    render(<MessageList messages={thread} />);
    call('onContentSizeChange', 390, 1_000);
    call('onScroll', scrollEvent(400, 1_000));
    mockScrollToEnd.mockClear();

    call('onContentSizeChange', 390, 1_160);

    expect(mockScrollToEnd).toHaveBeenCalledWith({ animated: true });
  });

  it('leaves the reader where they are after they scroll up to read', () => {
    render(<MessageList messages={thread} />);
    call('onContentSizeChange', 390, 2_000);
    call('onScroll', scrollEvent(1_400, 2_000));
    call('onScrollBeginDrag', scrollEvent(1_400, 2_000));
    call('onScroll', scrollEvent(300, 2_000));
    call('onScrollEndDrag', scrollEvent(300, 2_000));
    mockScrollToEnd.mockClear();

    call('onContentSizeChange', 390, 2_160);

    expect(mockScrollToEnd).not.toHaveBeenCalled();
  });

  it('keeps following when its own scroll to the new content passes through the middle', () => {
    render(<MessageList messages={thread} />);
    call('onContentSizeChange', 390, 1_000);
    call('onScroll', scrollEvent(400, 1_000));
    call('onContentSizeChange', 390, 1_400);
    call('onScroll', scrollEvent(500, 1_400));
    mockScrollToEnd.mockClear();

    call('onContentSizeChange', 390, 1_560);

    expect(mockScrollToEnd).toHaveBeenCalledWith({ animated: true });
  });

  it('goes to the bottom again when the reader sends a message from further up', () => {
    const view = render(<MessageList messages={thread} />);
    call('onContentSizeChange', 390, 2_000);
    call('onScrollBeginDrag', scrollEvent(1_400, 2_000));
    call('onScroll', scrollEvent(300, 2_000));
    call('onScrollEndDrag', scrollEvent(300, 2_000));

    view.rerender(<MessageList messages={[...thread, message('u2', 'user')]} />);
    mockScrollToEnd.mockClear();
    call('onContentSizeChange', 390, 2_100);

    expect(mockScrollToEnd).toHaveBeenCalledWith({ animated: true });
  });
});

describe('MessageList scroll to bottom button above a footer', () => {
  const thread = [message('u1', 'user'), message('a1', 'assistant')];
  const FOOTER = 120;

  beforeEach(() => {
    mockScrollToEnd.mockClear();
    mockListProps = {};
  });

  function buttonTouchable(view: ReturnType<typeof render>): boolean {
    let node: ReturnType<typeof view.getByLabelText> | null = view.getByLabelText(
      'Scroll to bottom',
      { includeHiddenElements: true },
    );
    while (node && node.props.pointerEvents === undefined) node = node.parent;
    return node?.props.pointerEvents === 'auto';
  }

  function renderWithFooter() {
    const { View } = require('react-native');
    const view = render(
      <MessageList messages={thread} footer={<View style={{ height: FOOTER }} />} />,
    );
    act(() => {
      view
        .getByTestId('chat.message-list.footer')
        .props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height: FOOTER } } });
    });
    return view;
  }

  it('stays hidden while the last answer and its actions sit in the band above the footer', () => {
    const view = renderWithFooter();

    call('onScroll', scrollEvent(2_000 - VIEWPORT - 200, 2_000));

    expect(buttonTouchable(view)).toBe(false);
  });

  it('shows once the reader is a threshold above the last answer', () => {
    const view = renderWithFooter();

    call('onScroll', scrollEvent(2_000 - VIEWPORT - 300, 2_000));

    expect(buttonTouchable(view)).toBe(true);
  });

  it('shows at the usual distance when there is no footer', () => {
    const view = render(<MessageList messages={thread} />);

    call('onScroll', scrollEvent(2_000 - VIEWPORT - 200, 2_000));

    expect(buttonTouchable(view)).toBe(true);
  });

  it('still stops following at the usual distance above a footer', () => {
    renderWithFooter();
    call('onContentSizeChange', 390, 2_000);
    call('onScrollBeginDrag', scrollEvent(2_000 - VIEWPORT, 2_000));
    call('onScroll', scrollEvent(2_000 - VIEWPORT - 200, 2_000));
    call('onScrollEndDrag', scrollEvent(2_000 - VIEWPORT - 200, 2_000));
    mockScrollToEnd.mockClear();

    call('onContentSizeChange', 390, 2_160);

    expect(mockScrollToEnd).not.toHaveBeenCalled();
  });
});

describe('MessageList when its own frame gets shorter', () => {
  const thread = [message('u1', 'user'), message('a1', 'assistant')];

  function layout(height: number) {
    call('onLayout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height } } });
  }

  beforeEach(() => {
    mockScrollToEnd.mockClear();
    mockListProps = {};
  });

  it('keeps the last row in view while the reader follows the bottom', () => {
    render(<MessageList messages={thread} />);
    layout(VIEWPORT);
    call('onContentSizeChange', 390, 1_000);
    call('onScroll', scrollEvent(400, 1_000));
    mockScrollToEnd.mockClear();

    layout(VIEWPORT - 280);

    expect(mockScrollToEnd).toHaveBeenCalledWith({ animated: true });
  });

  it('leaves a reader who scrolled up where they are', () => {
    render(<MessageList messages={thread} />);
    layout(VIEWPORT);
    call('onContentSizeChange', 390, 2_000);
    call('onScrollBeginDrag', scrollEvent(1_400, 2_000));
    call('onScroll', scrollEvent(300, 2_000));
    call('onScrollEndDrag', scrollEvent(300, 2_000));
    mockScrollToEnd.mockClear();

    layout(VIEWPORT - 280);

    expect(mockScrollToEnd).not.toHaveBeenCalled();
  });

  it('does nothing on the first measurement or when the frame grows', () => {
    render(<MessageList messages={thread} />);
    layout(VIEWPORT - 280);
    layout(VIEWPORT);

    expect(mockScrollToEnd).not.toHaveBeenCalled();
  });
});

describe('MessageList announcing how a turn ended', () => {
  function answer(overrides: Partial<ChatMessage>): ChatMessage {
    return { ...message('a1', 'assistant'), content: 'Partial text', ...overrides };
  }

  function finish(done: Partial<ChatMessage>): jest.SpyInstance {
    const { AccessibilityInfo } = require('react-native');
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const view = render(<MessageList messages={[answer({ isStreaming: true })]} />);
    view.rerender(<MessageList messages={[answer({ isStreaming: false, ...done })]} />);
    return announce;
  }

  afterEach(() => jest.restoreAllMocks());

  it('announces a turn that failed while streaming as failed', () => {
    const announce = finish({ metadata: { streamError: { message: 'The provider stopped.' } } });

    expect(announce).toHaveBeenLastCalledWith('Response failed');
  });

  it('announces a turn the person stopped as stopped', () => {
    const announce = finish({ metadata: { finishReason: 'stopped' } });

    expect(announce).toHaveBeenLastCalledWith('Response stopped. Partial response saved.');
  });

  it('announces a cancelled turn with no text as stopped', () => {
    const announce = finish({ content: '', metadata: { finishReason: 'cancelled' } });

    expect(announce).toHaveBeenLastCalledWith('Response stopped');
  });

  it('announces a finished answer as complete', () => {
    const announce = finish({});

    expect(announce).toHaveBeenLastCalledWith('Response complete');
  });
});
