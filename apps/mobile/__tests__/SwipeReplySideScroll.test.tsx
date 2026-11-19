jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Medium: 'm' } }));
jest.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (selector: (state: { hapticsEnabled: boolean }) => unknown) =>
    selector({ hapticsEnabled: false }),
}));
jest.mock('@/lib/mmkv', () => ({
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import { createRef, type ReactNode } from 'react';
import { ScrollView as NativeScrollView, Text } from 'react-native';
import { PanGestureHandler, Swipeable } from 'react-native-gesture-handler';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { getColors } from '../src/ui/theme/tokens';
import { CodeLinesScroller } from '../src/features/settings/code/CodeLinesScroller';
import { SideScroller } from '../src/features/chat/components/SideScroller';
import { SwipeReplyRow } from '../src/features/chat/components/SwipeReplyRow';
import { ToolCodeCard } from '../src/features/chat/components/ToolCodeCard';
import type { ChatMessage } from '../types/chat';

const message = {
  id: 'm1',
  role: 'assistant',
  content: 'answer',
  createdAt: '2026-11-15T10:00:00.000Z',
} as ChatMessage;

function renderRow(children: ReactNode) {
  return render(
    <SwipeReplyRow
      message={message}
      onSwipeReply={jest.fn()}
      colors={getColors('light', 'light', false)}
    >
      {children}
    </SwipeReplyRow>,
  );
}

function measure(testID: string, frameWidth: number, contentWidth: number) {
  const scroller = screen.getByTestId(testID);
  act(() => {
    fireEvent(scroller, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: frameWidth, height: 40 } },
    });
    fireEvent(scroller, 'contentSizeChange', contentWidth, 40);
  });
}

function swipeWaitsFor(): Array<{ current: { handlerTag?: unknown } | null }> {
  return screen.UNSAFE_getByType(Swipeable).props.waitFor;
}

describe('swipe to reply and sideways scrollers in the same answer', () => {
  it('makes the row swipe wait for a block wider than its frame, so the drag scrolls the block', () => {
    renderRow(
      <SideScroller testID="wide-block">
        <Text>a line far wider than the screen</Text>
      </SideScroller>,
    );

    measure('wide-block', 342, 1200);

    const waits = swipeWaitsFor();
    expect(waits).toHaveLength(1);
    expect(typeof waits[0]!.current?.handlerTag).toBe('number');
  });

  it('keeps the swipe free over a block that fits, and over the rest of the row', () => {
    renderRow(
      <SideScroller testID="narrow-block">
        <Text>short</Text>
      </SideScroller>,
    );

    measure('narrow-block', 342, 200);

    expect(swipeWaitsFor()).toHaveLength(0);
  });

  it('never starts the reply swipe on a leftward drag, which is the drag that reveals clipped content', () => {
    renderRow(<Text>answer</Text>);

    const [leftwardStart, rightwardStart] = screen.UNSAFE_getByType(PanGestureHandler).props
      .activeOffsetX as [number, number];
    expect(leftwardStart).toBe(-Number.MAX_SAFE_INTEGER);
    expect(rightwardStart).toBeGreaterThan(0);
  });

  it('gives a long code line in a row the same priority', () => {
    renderRow(
      <CodeLinesScroller testID="code-lines">
        <Text>const marker = 'THE-END-MARKER';</Text>
      </CodeLinesScroller>,
    );

    measure('code-lines', 342, 900);

    expect(swipeWaitsFor()).toHaveLength(1);
  });

  it('gives a long line in a tool code card the same priority', () => {
    renderRow(<ToolCodeCard language="ts" code={`const line = '${'x'.repeat(200)}';`} />);

    const sideways = screen
      .UNSAFE_getAllByType(NativeScrollView)
      .find((scroller) => scroller.props.horizontal === true)!;
    act(() => {
      fireEvent(sideways, 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 342, height: 40 } },
      });
      fireEvent(sideways, 'contentSizeChange', 1400, 40);
    });

    expect(swipeWaitsFor()).toHaveLength(1);
  });

  it('hands the caller its scroll view, in a row and outside one, so a carousel can still page', () => {
    const inRow = createRef<NativeScrollView>();
    renderRow(
      <SideScroller ref={inRow} testID="carousel">
        <Text>slide</Text>
      </SideScroller>,
    );
    expect(typeof inRow.current?.scrollTo).toBe('function');
    measure('carousel', 342, 1200);
    expect(typeof swipeWaitsFor()[0]?.current?.handlerTag).toBe('number');
    screen.unmount();

    const plain = createRef<NativeScrollView>();
    render(
      <SideScroller ref={plain}>
        <Text>slide</Text>
      </SideScroller>,
    );
    expect(typeof plain.current?.scrollTo).toBe('function');
  });

  it('stays a plain scroller outside a swipeable row', () => {
    render(
      <SideScroller testID="plain">
        <Text>cell</Text>
      </SideScroller>,
    );

    expect(screen.UNSAFE_getByType(NativeScrollView).props.horizontal).toBe(true);
    expect(screen.UNSAFE_queryByType(Swipeable)).toBeNull();
  });
});
