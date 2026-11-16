/* eslint-disable @typescript-eslint/no-require-imports */
import { act, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

type Handlers = { onUpdate?: (event: Record<string, number>) => void; onEnd?: () => void };
const mockHandlers: Record<string, Handlers> = {};
const mockPanEnabled: boolean[] = [];

jest.mock('react-native-gesture-handler', () => {
  const chain = (kind?: string) => {
    const value: Record<string, jest.Mock> = {};
    for (const method of ['onUpdate', 'onEnd', 'minPointers', 'numberOfTaps']) {
      value[method] = jest.fn((handler?: unknown) => {
        if (kind && (method === 'onUpdate' || method === 'onEnd')) {
          mockHandlers[kind] = { ...mockHandlers[kind], [method]: handler };
        }
        return value;
      });
    }
    return value;
  };
  const pan = () => {
    const value = chain('pan');
    value.enabled = jest.fn((enabled: boolean) => {
      mockPanEnabled.push(enabled);
      return value;
    });
    return value;
  };
  return {
    Gesture: {
      Pinch: () => chain('pinch'),
      Pan: pan,
      Tap: () => chain('tap'),
      Simultaneous: jest.fn(() => chain()),
    },
    GestureDetector: ({ children }: { children: unknown }) => children,
    GestureHandlerRootView: ({ children }: { children: unknown }) => children,
  };
});

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const { useRef } = require('react');
  return {
    __esModule: true,
    default: { View },
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useSharedValue: (value: unknown) => useRef({ value }).current,
    withTiming: (value: unknown) => value,
    runOnJS: (fn: unknown) => fn,
  };
});

import { spacing } from '@/src/ui/theme/tokens';
import { ZoomableImage } from '../ZoomableImage';

const STAGE = { width: 400, height: 800 };
const FRAME = { width: 400 - spacing.lg * 2, height: 276 };

function Zoomable({ resetKey = 'first' }: { resetKey?: string }) {
  return (
    <ZoomableImage resetKey={resetKey} testID="zoom">
      {(stage) => <Text testID="zoom-child">{`${stage.width}x${stage.maxHeight}`}</Text>}
    </ZoomableImage>
  );
}

function mount(resetKey = 'first') {
  const view = render(<Zoomable resetKey={resetKey} />);
  fireEvent(view.getByTestId('zoom'), 'layout', { nativeEvent: { layout: STAGE } });
  fireEvent(view.getByTestId('zoom-frame'), 'layout', { nativeEvent: { layout: FRAME } });
  return view;
}

function transformOf(view: ReturnType<typeof render>, resetKey = 'first') {
  view.rerender(<Zoomable resetKey={resetKey} />);
  const [scale, translateX, translateY] = StyleSheet.flatten(
    view.getByTestId('zoom-frame').props.style,
  ).transform as [{ scale: number }, { translateX: number }, { translateY: number }];
  return { scale: scale.scale, x: translateX.translateX, y: translateY.translateY };
}

describe('ZoomableImage', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockHandlers)) delete mockHandlers[key];
    mockPanEnabled.length = 0;
  });

  it('hands its children the stage they may fill', () => {
    const view = mount();

    expect(view.getByTestId('zoom-child')).toHaveTextContent(
      `${STAGE.width - spacing.lg * 2}x${STAGE.height - spacing.lg * 2}`,
    );
  });

  it('starts at 1x and follows a pinch up to 5x and no further', () => {
    const view = mount();
    expect(transformOf(view).scale).toBe(1);

    act(() => mockHandlers.pinch!.onUpdate!({ scale: 3 }));
    expect(transformOf(view).scale).toBe(3);

    act(() => mockHandlers.pinch!.onUpdate!({ scale: 40 }));
    expect(transformOf(view).scale).toBe(5);
  });

  it('settles back to 1x when a pinch ends close to it and never goes below it', () => {
    const view = mount();

    act(() => mockHandlers.pinch!.onUpdate!({ scale: 0.4 }));
    expect(transformOf(view).scale).toBe(1);

    act(() => {
      mockHandlers.pinch!.onUpdate!({ scale: 1.05 });
      mockHandlers.pinch!.onEnd!();
    });
    expect(transformOf(view)).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('keeps a pinch the person stopped at 2x', () => {
    const view = mount();

    act(() => {
      mockHandlers.pinch!.onUpdate!({ scale: 2 });
      mockHandlers.pinch!.onEnd!();
    });

    expect(transformOf(view).scale).toBe(2);
  });

  it('toggles between 1x and 2.5x on a double tap', () => {
    const view = mount();

    act(() => mockHandlers.tap!.onEnd!());
    expect(transformOf(view).scale).toBe(2.5);

    act(() => mockHandlers.tap!.onEnd!());
    expect(transformOf(view)).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('does not move the picture while it is at 1x', () => {
    const view = mount();

    act(() => mockHandlers.pan!.onUpdate!({ translationX: 90, translationY: 90 }));

    expect(transformOf(view)).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('pans a zoomed picture but never past its edges', () => {
    const view = mount();
    act(() => mockHandlers.tap!.onEnd!());

    act(() => mockHandlers.pan!.onUpdate!({ translationX: 50, translationY: 50 }));
    expect(transformOf(view)).toEqual({ scale: 2.5, x: 20, y: 0 });

    act(() => mockHandlers.pan!.onUpdate!({ translationX: 9000, translationY: -9000 }));
    const limit = (FRAME.width * 2.5 - STAGE.width) / (2 * 2.5);
    const { x, y } = transformOf(view);
    expect(x).toBeCloseTo(limit);
    expect(y).toBe(0);

    act(() => mockHandlers.pan!.onUpdate!({ translationX: -9000, translationY: 0 }));
    expect(transformOf(view).x).toBeCloseTo(-limit);
  });

  it('returns to 1x when it is given another picture', () => {
    const view = mount('first');
    act(() => mockHandlers.tap!.onEnd!());
    expect(transformOf(view).scale).toBe(2.5);

    view.rerender(<Zoomable resetKey="second" />);

    expect(transformOf(view, 'second')).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('leaves a one-finger drag to the sheet around it until the picture is zoomed', () => {
    const view = mount();
    expect(mockPanEnabled[mockPanEnabled.length - 1]).toBe(false);

    act(() => mockHandlers.tap!.onEnd!());
    view.rerender(<Zoomable />);
    expect(mockPanEnabled[mockPanEnabled.length - 1]).toBe(true);

    act(() => mockHandlers.tap!.onEnd!());
    view.rerender(<Zoomable />);
    expect(mockPanEnabled[mockPanEnabled.length - 1]).toBe(false);
  });

  it('takes the pan back when a pinch ends zoomed and gives it up when it settles at 1x', () => {
    const view = mount();

    act(() => {
      mockHandlers.pinch!.onUpdate!({ scale: 2 });
      mockHandlers.pinch!.onEnd!();
    });
    view.rerender(<Zoomable />);
    expect(mockPanEnabled[mockPanEnabled.length - 1]).toBe(true);

    act(() => {
      mockHandlers.pinch!.onUpdate!({ scale: 0.3 });
      mockHandlers.pinch!.onEnd!();
    });
    view.rerender(<Zoomable />);
    expect(mockPanEnabled[mockPanEnabled.length - 1]).toBe(false);
  });

  it('gives the pan up again when it is handed another picture', () => {
    const view = mount('first');
    act(() => mockHandlers.tap!.onEnd!());
    view.rerender(<Zoomable resetKey="first" />);
    expect(mockPanEnabled[mockPanEnabled.length - 1]).toBe(true);

    view.rerender(<Zoomable resetKey="second" />);
    view.rerender(<Zoomable resetKey="second" />);

    expect(mockPanEnabled[mockPanEnabled.length - 1]).toBe(false);
  });
});
