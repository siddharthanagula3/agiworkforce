/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock('@/lib/mmkv', () => ({
  rehydrateWhenMmkvReady: jest.fn(),
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));
jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  return new Proxy(
    {},
    {
      get: (_target, name) =>
        name === '__esModule' ? true : (props: Record<string, unknown>) => <RN.View {...props} />,
    },
  );
});
jest.mock('react-native-webview', () => ({ WebView: () => null }));
jest.mock('../src/features/chat/components/ReportFlagButton', () => ({ ReportSheet: () => null }));

import 'react-native-gesture-handler/jestSetup';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { Dimensions, FlatList, Platform, Text } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { IOSConfig } from 'expo/config-plugins';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { FULL_SCREEN_TOUCH_TARGET } from '@/src/features/chat/chrome/fullScreenChrome';
import { tapTarget } from '@/test-utils/viewerChrome';
import {
  LARGE_SCREEN_MIN_WIDTH_DP,
  isPhoneFormFactor,
  lockPhonePortrait,
  useLandscapeWhileOpen,
} from '@/src/shared/hooks/useLandscapeWhileOpen';
import { PresentationDeckView } from '@/src/features/chat/components/artifact-viewers/presentation/PresentationDeckView';
import { VideoPlayerModal } from '@/src/features/chat/components/VideoPlayerModal';

const appConfig = require('../app.config.js') as {
  expo: {
    orientation?: string;
    plugins: unknown[];
    ios: { infoPlist: Record<string, unknown> };
    android: { blockedPermissions: string[] };
  };
};

const { patchMainActivity } = require('../native/android/withAGITabletOrientation.cjs') as {
  patchMainActivity: (contents: string) => string;
};

const MINIMAL_MAIN_ACTIVITY = `package com.agiworkforce.app
import android.os.Bundle

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
  }
}
`;

const lockAsync = ScreenOrientation.lockAsync as jest.Mock;
const { DEFAULT, PORTRAIT_UP } = ScreenOrientation.OrientationLock;

const DECK =
  '<!-- deck -->\n# Launch plan\nWhy now\n\n---\n\n## Steps\nShip it\n\n---\n\n## Thanks';
const renderMarkdown = (text: string) => <Text testID="slide-markdown">{text}</Text>;

const PHONE: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, right: 0, bottom: 34, left: 0 },
};

const startingWindow = Dimensions.get('window');
const startingScreen = Dimensions.get('screen');

function turnTo(orientation: 'portrait' | 'landscape') {
  const [width, height] = orientation === 'portrait' ? [393, 852] : [852, 393];
  const window = { ...startingWindow, width, height };
  act(() => {
    Dimensions.set({ window, screen: window });
  });
}

function renderDeck() {
  render(
    <SafeAreaProvider initialMetrics={PHONE}>
      <PresentationDeckView title="Launch" content={DECK} renderMarkdown={renderMarkdown} />
    </SafeAreaProvider>,
  );
  fireEvent(screen.getByTestId('presentation-deck'), 'layout', {
    nativeEvent: { layout: { width: 320, height: 400, x: 0, y: 0 } },
  });
}

function presentedCounter(): string {
  return screen.getByTestId('deck-presenting-counter').props.children as string;
}

function presentedSlideText(index: number): string | undefined {
  return screen
    .getByTestId(`deck-presenting-slide-${index}`)
    .findAll((node) => node.props.testID === 'slide-markdown')[0]?.props.children as
    string | undefined;
}

beforeEach(() => {
  lockAsync.mockClear();
  lockAsync.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  act(() => {
    Dimensions.set({ window: startingWindow, screen: startingScreen });
  });
});

describe('phone orientation', () => {
  it('holds an iPhone in portrait and lets it turn only while a viewer is open', () => {
    lockPhonePortrait();
    expect(lockAsync).toHaveBeenLastCalledWith(PORTRAIT_UP);

    const { rerender } = renderHook(({ open }) => useLandscapeWhileOpen(open), {
      initialProps: { open: false },
    });
    expect(lockAsync).toHaveBeenCalledTimes(1);

    rerender({ open: true });
    expect(lockAsync).toHaveBeenLastCalledWith(DEFAULT);

    rerender({ open: false });
    expect(lockAsync).toHaveBeenLastCalledWith(PORTRAIT_UP);
    expect(lockAsync).toHaveBeenCalledTimes(3);
  });

  it('keeps the phone free to turn until the last open viewer closes', () => {
    const first = renderHook(() => useLandscapeWhileOpen(true));
    const second = renderHook(() => useLandscapeWhileOpen(true));
    expect(lockAsync.mock.calls).toEqual([[DEFAULT]]);

    first.unmount();
    lockPhonePortrait();
    expect(lockAsync.mock.calls).toEqual([[DEFAULT]]);

    second.unmount();
    expect(lockAsync.mock.calls).toEqual([[DEFAULT], [PORTRAIT_UP]]);
  });

  it('leaves an iPad free to turn', () => {
    jest.spyOn(Platform, 'isPad', 'get').mockReturnValue(true);

    expect(isPhoneFormFactor()).toBe(false);
    lockPhonePortrait();
    const { unmount } = renderHook(() => useLandscapeWhileOpen(true));
    unmount();
    expect(lockAsync).not.toHaveBeenCalled();
  });

  it('tells an Android phone from an Android tablet by its smaller side', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const screenOf = (width: number, height: number) =>
      jest.spyOn(Dimensions, 'get').mockReturnValue({ width, height, scale: 3, fontScale: 1 });

    screenOf(412, 915);
    expect(isPhoneFormFactor()).toBe(true);
    lockPhonePortrait();
    expect(lockAsync).toHaveBeenLastCalledWith(PORTRAIT_UP);

    lockAsync.mockClear();
    screenOf(1280, 800);
    expect(isPhoneFormFactor()).toBe(false);
    lockPhonePortrait();
    expect(lockAsync).not.toHaveBeenCalled();
  });

  it('keeps an Android phone portrait for as long as MainActivity puts it back on every turn', () => {
    const patched = patchMainActivity(MINIMAL_MAIN_ACTIVITY);
    const mainActivityKeepsTheLock = /appliedLargeScreen/.test(patched);
    jest.replaceProperty(Platform, 'OS', 'android');
    jest
      .spyOn(Dimensions, 'get')
      .mockReturnValue({ width: 412, height: 915, scale: 3, fontScale: 1 });

    const { unmount } = renderHook(() => useLandscapeWhileOpen(true));
    unmount();
    lockPhonePortrait();

    expect(lockAsync.mock.calls.some(([lock]) => lock === DEFAULT)).toBe(mainActivityKeepsTheLock);
    expect(lockAsync).toHaveBeenLastCalledWith(PORTRAIT_UP);
  });

  it('lets an Android phone turn in Present and returns it to portrait, and leaves an Android tablet alone', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const screenOf = jest.spyOn(Dimensions, 'get');

    screenOf.mockReturnValue({ width: 412, height: 915, scale: 3, fontScale: 1 });
    renderDeck();
    fireEvent.press(screen.getByLabelText('Present'));
    expect(lockAsync.mock.calls).toEqual([[DEFAULT]]);
    fireEvent.press(screen.getByLabelText('Stop presenting'));
    expect(lockAsync.mock.calls).toEqual([[DEFAULT], [PORTRAIT_UP]]);
    screen.unmount();

    lockAsync.mockClear();
    screenOf.mockReturnValue({ width: 1280, height: 800, scale: 2, fontScale: 1 });
    renderDeck();
    fireEvent.press(screen.getByLabelText('Present'));
    fireEvent.press(screen.getByLabelText('Stop presenting'));
    expect(lockAsync).not.toHaveBeenCalled();
  });

  it('lets a foldable turn again when it folds to phone size while a viewer is open', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const foldTo = (state: 'folded' | 'unfolded') => {
      const [width, height] = state === 'folded' ? [412, 915] : [1280, 800];
      const screenSize = { ...startingScreen, width, height };
      act(() => {
        Dimensions.set({ window: screenSize, screen: screenSize });
      });
    };

    foldTo('folded');
    const openedFolded = renderHook(() => useLandscapeWhileOpen(true));
    foldTo('unfolded');
    foldTo('folded');
    foldTo('folded');
    expect(lockAsync.mock.calls).toEqual([[DEFAULT], [DEFAULT]]);
    openedFolded.unmount();
    expect(lockAsync.mock.calls).toEqual([[DEFAULT], [DEFAULT], [PORTRAIT_UP]]);

    foldTo('unfolded');
    lockAsync.mockClear();
    const openedUnfolded = renderHook(() => useLandscapeWhileOpen(true));
    expect(lockAsync).not.toHaveBeenCalled();
    foldTo('folded');
    expect(lockAsync.mock.calls).toEqual([[DEFAULT]]);
    openedUnfolded.unmount();
    expect(lockAsync.mock.calls).toEqual([[DEFAULT], [PORTRAIT_UP]]);

    lockAsync.mockClear();
    foldTo('unfolded');
    foldTo('folded');
    expect(lockAsync).not.toHaveBeenCalled();
  });

  it('cuts phones from tablets at the width MainActivity uses', () => {
    const cut = /LARGE_SCREEN_MIN_WIDTH_DP = (\d+)/.exec(patchMainActivity(MINIMAL_MAIN_ACTIVITY));
    expect(Number(cut?.[1])).toBe(LARGE_SCREEN_MIN_WIDTH_DP);
  });

  it('carries on when the system refuses a lock', async () => {
    lockAsync.mockRejectedValueOnce(new Error('The system refused the request.'));

    expect(() => lockPhonePortrait()).not.toThrow();
    await act(async () => {
      await Promise.resolve();
    });
    expect(lockAsync).toHaveBeenCalledWith(PORTRAIT_UP);
  });
});

describe('Present', () => {
  it('lets the phone turn while presenting and returns it to portrait on Stop presenting', () => {
    renderDeck();
    expect(lockAsync).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Present'));
    expect(lockAsync.mock.calls).toEqual([[DEFAULT]]);

    fireEvent.press(screen.getByLabelText('Stop presenting'));
    expect(lockAsync.mock.calls).toEqual([[DEFAULT], [PORTRAIT_UP]]);
  });

  it('fills a landscape screen with the slide, a bare close X and the slide count, and keeps the slide on turning back', () => {
    turnTo('portrait');
    renderDeck();
    fireEvent.press(screen.getByTestId('deck-next'));
    fireEvent.press(screen.getByLabelText('Present'));
    expect(screen.getByText('Launch')).toBeTruthy();

    turnTo('landscape');

    expect(screen.queryByText('Launch')).toBeNull();
    expect(presentedCounter()).toBe('2 / 3');
    expect(screen.getByLabelText('Slide 2 of 3')).toBeTruthy();
    expect(presentedSlideText(1)).toBe('## Steps\nShip it');
    const stop = screen.getByLabelText('Stop presenting');
    expect(tapTarget(stop)).toEqual({
      width: FULL_SCREEN_TOUCH_TARGET,
      height: FULL_SCREEN_TOUCH_TARGET,
    });
    for (const side of ['deck-presenting-previous', 'deck-presenting-next']) {
      expect(tapTarget(screen.getByTestId(side)).width).toBe(FULL_SCREEN_TOUCH_TARGET);
    }

    turnTo('portrait');

    expect(screen.getByText('Launch')).toBeTruthy();
    expect(presentedCounter()).toBe('2 / 3');
    expect(presentedSlideText(1)).toBe('## Steps\nShip it');
  });

  it('moves on a tap on the right half, back on the left half, and with a swipe either way', async () => {
    const gesture = async (testId: string) => {
      act(() => fireGestureHandler(getByGestureTestId(testId), []));
      await act(async () => {});
    };
    const tapStage = (x: number, movedBy = 0) => {
      const stage = screen.getByTestId('deck-presenting-stage');
      fireEvent(stage, 'responderGrant', { nativeEvent: { pageX: x, pageY: 200 } });
      fireEvent(stage, 'responderRelease', { nativeEvent: { pageX: x + movedBy, pageY: 200 } });
    };
    turnTo('landscape');
    renderDeck();
    fireEvent.press(screen.getByLabelText('Present'));
    fireEvent(screen.getByTestId('deck-presenting-stage'), 'layout', {
      nativeEvent: { layout: { width: 700, height: 360, x: 44, y: 0 } },
    });
    await act(async () => {});
    expect(presentedCounter()).toBe('1 / 3');

    tapStage(500);
    expect(presentedCounter()).toBe('2 / 3');

    tapStage(120);
    expect(presentedCounter()).toBe('1 / 3');

    await gesture('deck-presenting-swipe-next');
    await gesture('deck-presenting-swipe-next');
    expect(presentedCounter()).toBe('3 / 3');
    expect(presentedSlideText(2)).toBe('## Thanks');

    tapStage(650);
    expect(presentedCounter()).toBe('3 / 3');

    await gesture('deck-presenting-swipe-previous');
    expect(presentedCounter()).toBe('2 / 3');
  });

  it('offers a touch to the stage only after the slide has declined it, and does not count a swipe as a tap', () => {
    turnTo('landscape');
    renderDeck();
    fireEvent.press(screen.getByLabelText('Present'));
    const stage = screen.getByTestId('deck-presenting-stage');
    fireEvent(stage, 'layout', {
      nativeEvent: { layout: { width: 700, height: 360, x: 44, y: 0 } },
    });

    expect(stage.props.onStartShouldSetResponder).toEqual(expect.any(Function));
    expect(stage.props.onStartShouldSetResponderCapture).toBeUndefined();
    expect(stage.props.onMoveShouldSetResponderCapture).toBeUndefined();

    fireEvent(stage, 'responderGrant', { nativeEvent: { pageX: 600, pageY: 200 } });
    fireEvent(stage, 'responderRelease', { nativeEvent: { pageX: 300, pageY: 200 } });
    expect(presentedCounter()).toBe('1 / 3');

    fireEvent(stage, 'responderGrant', { nativeEvent: { pageX: 600, pageY: 200 } });
    fireEvent(stage, 'responderTerminate', { nativeEvent: { pageX: 600, pageY: 200 } });
    fireEvent(stage, 'responderRelease', { nativeEvent: { pageX: 600, pageY: 200 } });
    expect(presentedCounter()).toBe('1 / 3');
  });

  it('keeps the deck on its slide when the screen behind Present changes width', () => {
    const scrollToOffset = jest.spyOn(FlatList.prototype, 'scrollToOffset');
    renderDeck();
    fireEvent.press(screen.getByLabelText('Go to slide 3'));
    scrollToOffset.mockClear();

    fireEvent(screen.getByTestId('presentation-deck'), 'layout', {
      nativeEvent: { layout: { width: 700, height: 400, x: 0, y: 0 } },
    });

    expect(scrollToOffset).toHaveBeenCalledWith({ offset: 1400, animated: false });
    expect(screen.getByTestId('deck-counter').props.children).toBe('3 / 3');
  });
});

describe('video player', () => {
  const player = { playerUri: 'file:///tmp/player.html', directoryUri: 'file:///tmp/' };

  it('lets the phone turn while a video is open and returns it to portrait on close', () => {
    const props = {
      player: player as never,
      onClose: jest.fn(),
      label: 'Video',
      failureHint: 'Try again.',
    };
    const { rerender } = render(<VideoPlayerModal {...props} visible={false} />);
    expect(lockAsync).not.toHaveBeenCalled();

    rerender(<VideoPlayerModal {...props} visible />);
    expect(lockAsync.mock.calls).toEqual([[DEFAULT]]);

    rerender(<VideoPlayerModal {...props} visible={false} />);
    expect(lockAsync.mock.calls).toEqual([[DEFAULT], [PORTRAIT_UP]]);
  });
});

describe('native orientation and sensor config', () => {
  it('launches an iPhone from a portrait-only list, starts every phone in portrait, and leaves iPad free', () => {
    const { expo } = appConfig;
    expect(expo.orientation).toBe('portrait');
    expect(expo.ios.infoPlist.UISupportedInterfaceOrientations).toBeUndefined();
    const iphoneList = IOSConfig.Orientation.setOrientation(expo as never, {})
      .UISupportedInterfaceOrientations as string[];
    expect(iphoneList).toContain('UIInterfaceOrientationPortrait');
    expect(iphoneList.filter((item) => item.includes('Landscape'))).toEqual([]);
    expect(expo.ios.infoPlist['UISupportedInterfaceOrientations~ipad']).toEqual(
      expect.arrayContaining([
        'UIInterfaceOrientationLandscapeLeft',
        'UIInterfaceOrientationLandscapeRight',
      ]),
    );
    expect(expo.plugins).toContainEqual([
      'expo-screen-orientation',
      { initialOrientation: 'PORTRAIT_UP' },
    ]);
    expect(expo.ios.infoPlist['EXDefaultScreenOrientationMask~ipad']).toBe(
      'UIInterfaceOrientationMaskAll',
    );
  });

  it('adds no motion purpose string and no activity recognition permission with the sensors module', () => {
    const { expo } = appConfig;
    expect(expo.plugins).toContainEqual(['expo-sensors', { motionPermission: false }]);
    expect(expo.ios.infoPlist.NSMotionUsageDescription).toBeUndefined();
    expect(expo.android.blockedPermissions).toContain('android.permission.ACTIVITY_RECOGNITION');
  });
});
