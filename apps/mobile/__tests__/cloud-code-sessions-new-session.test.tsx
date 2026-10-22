/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockInsetBottom = 34;
let mockNewSessionSheetVisible = false;

let mockIsDark = false;

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, style }: { children: React.ReactNode; style?: unknown }) => (
      <View style={style as never}>{children}</View>
    ),
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: mockInsetBottom, left: 0 }),
  };
});

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const Icon = (props: Record<string, unknown>) => <View {...props} />;
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? true : Icon) });
});

jest.mock('../src/ui/theme', () => {
  const actual = jest.requireActual('../src/ui/theme/tokens');
  return {
    useThemeColors: () => actual.lightColors,
    useTheme: () => ({ colors: actual.lightColors, isDark: mockIsDark }),
  };
});

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((callback) => callback()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../src/features/cloud-code/useCloudCodeAccess', () => ({
  useCloudCodeAccess: () => ({
    ready: true,
    signedIn: true,
    accountKey: 'user-1',
    activate: jest.fn(),
  }),
}));

jest.mock('../src/features/cloud-code/useCloudCodeSessions', () => ({
  useCloudCodeSessions: () => ({
    status: 'ready',
    sessions: [],
    availability: null,
    runtimes: [],
    error: null,
    refreshing: false,
    load: jest.fn(),
  }),
}));

jest.mock('../src/features/cloud-code/components/NewCloudCodeSessionSheet', () => ({
  NewCloudCodeSessionSheet: ({ visible }: { visible: boolean }) => {
    mockNewSessionSheetVisible = visible;
    return null;
  },
}));

import { CloudCodeSessionsScreen } from '../src/features/cloud-code/CloudCodeSessionsScreen';
import { lightColors } from '../src/ui/theme/tokens';
import { FLOATING_PRIMARY_ACTION_GAP } from '../src/shared/components/FloatingPrimaryAction';

function pageBackground(screen: ReturnType<typeof render>) {
  const tree = screen.toJSON();
  const root = Array.isArray(tree) ? tree[0] : tree;
  return StyleSheet.flatten(root?.props.style).backgroundColor;
}

describe('Cloud code sessions new session action', () => {
  beforeEach(() => {
    mockNewSessionSheetVisible = false;
  });

  it('floats a labelled ink pill at the bottom right instead of a header icon', () => {
    const screen = render(<CloudCodeSessionsScreen />);

    const pill = screen.getByTestId('cloud-code-new-session');
    const style = StyleSheet.flatten(pill.props.style);
    expect(screen.getByText('New session')).toBeTruthy();
    expect(style.position).toBe('absolute');
    expect(style.right).toBeGreaterThan(0);
    expect(style.bottom).toBe(mockInsetBottom + FLOATING_PRIMARY_ACTION_GAP);
    expect(style.backgroundColor).toBe(lightColors.textPrimary);
    expect(screen.getAllByLabelText('New cloud session')).toHaveLength(1);
  });

  it('opens the new session sheet when pressed', () => {
    const screen = render(<CloudCodeSessionsScreen />);

    fireEvent.press(screen.getByTestId('cloud-code-new-session'));

    expect(mockNewSessionSheetVisible).toBe(true);
  });

  it('points the empty state at the labelled action rather than a plus button', () => {
    const screen = render(<CloudCodeSessionsScreen />);

    expect(screen.getByText(/Start one with New session/)).toBeTruthy();
    expect(screen.queryByText(/\+ button/)).toBeNull();
  });

  it.each([
    [true, lightColors.background],
    [false, lightColors.surfaceBase],
  ])('paints the page root for dark mode %s with the right surface', (isDark, expected) => {
    mockIsDark = isDark;
    try {
      expect(pageBackground(render(<CloudCodeSessionsScreen />))).toBe(expected);
    } finally {
      mockIsDark = false;
    }
  });
});
