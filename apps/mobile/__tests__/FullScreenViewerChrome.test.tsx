jest.mock('../src/features/chat/components/mermaidRuntime', () => ({
  loadMermaidRuntime: () => Promise.resolve('window.mermaid = {};'),
}));
jest.mock('@/lib/clipboard', () => ({ copyToClipboard: jest.fn().mockResolvedValue(true) }));
jest.mock('../src/features/chat/components/ReportFlagButton', () => ({
  ReportSheet: () => {
    const { View } = jest.requireActual('react-native');
    return <View testID="report-sheet" />;
  },
}));

const mockTheme = { isDark: false, colors: {} as Record<string, string> };
jest.mock('@/src/ui/theme', () => {
  const tokens = jest.requireActual('@/src/ui/theme/tokens');
  return {
    ...tokens,
    useTheme: () => mockTheme,
    useThemeColors: () => mockTheme.colors,
  };
});

import type { ReactElement } from 'react';
import { Modal, Text } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { NavigationContext } from 'expo-router/react-navigation';
import { getColors } from '../src/ui/theme/tokens';
import { FULL_SCREEN_TOUCH_TARGET } from '../src/features/chat/chrome/fullScreenChrome';
import { DiagramFullScreen } from '../src/features/chat/components/DiagramFullScreen';
import { TableFullScreen } from '../src/features/chat/components/TableFullScreen';
import { VideoPlayerModal } from '../src/features/chat/components/VideoPlayerModal';
import { spaceAbove, tapTarget } from '../test-utils/viewerChrome';

const PHONE: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, right: 0, bottom: 34, left: 0 },
};

function renderOnPhone(element: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={PHONE}>{element}</SafeAreaProvider>);
}

function expectReachableClose(label: string) {
  const close = screen.getByLabelText(label);
  expect(spaceAbove(close)).toBeGreaterThanOrEqual(PHONE.insets.top);
  const target = tapTarget(close);
  expect(target.width).toBeGreaterThanOrEqual(FULL_SCREEN_TOUCH_TARGET);
  expect(target.height).toBeGreaterThanOrEqual(FULL_SCREEN_TOUCH_TARGET);
  return close;
}

beforeEach(() => {
  mockTheme.colors = getColors('light', 'light', false);
});

describe('full-screen viewers keep Close below the status bar', () => {
  it('lays the diagram viewer header out under the top inset, and Close and the system back both close it', () => {
    const onClose = jest.fn();
    renderOnPhone(<DiagramFullScreen visible source={'graph LR\n  A --> B'} onClose={onClose} />);

    fireEvent.press(expectReachableClose('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);

    screen.UNSAFE_getByType(Modal).props.onRequestClose();
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('lays the video player controls out under the top inset in any orientation', () => {
    const onClose = jest.fn();
    renderOnPhone(
      <VideoPlayerModal
        player={{ playerUri: 'file:///tmp/player.html', directoryUri: 'file:///tmp/' } as never}
        visible
        onClose={onClose}
        label="Video"
        failureHint="Try again."
      />,
    );

    fireEvent.press(expectReachableClose('Close video'));
    expect(onClose).toHaveBeenCalledTimes(1);
    screen.UNSAFE_getByType(Modal).props.onRequestClose();
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('page-sheet viewers sit below the status bar and close by the swipe down', () => {
  it('presents the full table as a swipe-dismissable sheet with a 44 point Close', () => {
    const onClose = jest.fn();
    renderOnPhone(
      <TableFullScreen visible onClose={onClose} actions={null} colors={mockTheme.colors as never}>
        <Text>cell</Text>
      </TableFullScreen>,
    );

    const sheet = screen.UNSAFE_getByType(Modal).props;
    expect(sheet.presentationStyle).toBe('pageSheet');
    expect(sheet.allowSwipeDismissal).toBe(true);
    const target = tapTarget(screen.getByLabelText('Close table'));
    expect(target.width).toBeGreaterThanOrEqual(FULL_SCREEN_TOUCH_TARGET);
    expect(target.height).toBeGreaterThanOrEqual(FULL_SCREEN_TOUCH_TARGET);

    sheet.onRequestClose();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('full-screen viewers close when their screen loses focus', () => {
  function owningScreen(focused = true) {
    const listeners: Record<string, () => void> = {};
    const navigation = {
      isFocused: jest.fn(() => focused),
      addListener: jest.fn((event: string, listener: () => void) => {
        listeners[event] = listener;
        return () => delete listeners[event];
      }),
    };
    const within = (element: ReactElement) =>
      renderOnPhone(
        <NavigationContext.Provider value={navigation as never}>
          {element}
        </NavigationContext.Provider>,
      );
    return { navigation, within, blur: () => act(() => listeners.blur?.()) };
  }

  it('closes the diagram when a link opens another screen', () => {
    const onClose = jest.fn();
    const { within, blur } = owningScreen();
    within(<DiagramFullScreen visible source={'graph LR\n  A --> B'} onClose={onClose} />);

    blur();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes the table when a link opens another screen', () => {
    const onClose = jest.fn();
    const { within, blur } = owningScreen();
    within(
      <TableFullScreen visible onClose={onClose} actions={null} colors={mockTheme.colors as never}>
        <Text>cell</Text>
      </TableFullScreen>,
    );

    blur();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes the video when a link opens another screen', () => {
    const onClose = jest.fn();
    const { within, blur } = owningScreen();
    within(
      <VideoPlayerModal
        player={{ playerUri: 'file:///tmp/player.html', directoryUri: 'file:///tmp/' } as never}
        visible
        onClose={onClose}
        label="Video"
        failureHint="Try again."
      />,
    );

    blur();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes a video that arrives after its screen has already lost focus', () => {
    const onClose = jest.fn();
    const player = { playerUri: 'file:///tmp/player.html', directoryUri: 'file:///tmp/' } as never;
    const { navigation } = owningScreen(false);
    const element = (current: typeof player | null) => (
      <NavigationContext.Provider value={navigation as never}>
        <VideoPlayerModal
          player={current}
          visible
          onClose={onClose}
          label="Video"
          failureHint="Try again."
        />
      </NavigationContext.Provider>
    );
    const view = renderOnPhone(element(null));
    expect(onClose).not.toHaveBeenCalled();

    view.rerender(<SafeAreaProvider initialMetrics={PHONE}>{element(player)}</SafeAreaProvider>);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close a video opened on the screen that has focus', () => {
    const onClose = jest.fn();
    const { within } = owningScreen(true);
    within(
      <VideoPlayerModal
        player={{ playerUri: 'file:///tmp/player.html', directoryUri: 'file:///tmp/' } as never}
        visible
        onClose={onClose}
        label="Video"
        failureHint="Try again."
      />,
    );

    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not bring the report sheet back over the next video after a blur closed the last one', () => {
    const player = { playerUri: 'file:///tmp/player.html', directoryUri: 'file:///tmp/' } as never;
    const { navigation, blur } = owningScreen();
    const element = (visible: boolean) => (
      <SafeAreaProvider initialMetrics={PHONE}>
        <NavigationContext.Provider value={navigation as never}>
          <VideoPlayerModal
            player={player}
            visible={visible}
            onClose={jest.fn()}
            label="Video"
            failureHint="Try again."
            reportTarget={{
              messageId: 'message-1',
              conversationId: 'conversation-1',
              contentExcerpt: 'clip',
            }}
          />
        </NavigationContext.Provider>
      </SafeAreaProvider>
    );
    const view = render(element(true));
    fireEvent.press(screen.getByLabelText('Report this video'));
    expect(screen.getByTestId('report-sheet')).toBeTruthy();

    blur();
    view.rerender(element(false));
    view.rerender(element(true));

    expect(screen.queryByTestId('report-sheet')).toBeNull();
  });

  it('does not listen while a viewer is closed', () => {
    const { navigation, within } = owningScreen();
    within(
      <DiagramFullScreen visible={false} source={'graph LR\n  A --> B'} onClose={jest.fn()} />,
    );
    within(
      <TableFullScreen
        visible={false}
        onClose={jest.fn()}
        actions={null}
        colors={mockTheme.colors as never}
      >
        <Text>cell</Text>
      </TableFullScreen>,
    );
    within(
      <VideoPlayerModal
        player={null}
        visible
        onClose={jest.fn()}
        label="Video"
        failureHint="Try again."
      />,
    );

    expect(navigation.addListener).not.toHaveBeenCalled();
  });
});
