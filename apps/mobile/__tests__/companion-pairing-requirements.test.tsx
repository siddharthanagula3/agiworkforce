/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const transition = { duration: () => transition, springify: () => transition };
  return {
    __esModule: true,
    default: { View },
    FadeIn: transition,
    FadeOut: transition,
    SlideInDown: transition,
    SlideOutDown: transition,
  };
});

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => (props: Record<string, unknown>) => <View {...props} /> });
});

jest.mock('@/components/ui/text', () => {
  const { Text } = require('react-native');
  return { Text };
});

jest.mock('@/components/ui/button', () => {
  const { Pressable, Text } = require('react-native');
  return {
    Button: ({ title, onPress }: { title: string; onPress: () => void }) => (
      <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress}>
        <Text>{title}</Text>
      </Pressable>
    ),
  };
});

jest.mock('@/lib/mmkv', () => ({
  mmkvStorage: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  rehydrateWhenMmkvReady: jest.fn(),
}));

// The real tokens rather than six hand-picked hexes: the components under test
// read the palette through useThemeColors() now, and a partial mock omits
// whatever they reach for next.
jest.mock('@/src/ui/theme', () => {
  const tokens = jest.requireActual('@/src/ui/theme/tokens');
  return {
    ...tokens,
    colors: tokens.colors,
    useThemeColors: () => tokens.colors,
    useTheme: () => ({ colors: tokens.colors, isDark: true, statusBarStyle: 'light' }),
  };
});

import {
  ConnectingView,
  DisconnectedView,
} from '../src/features/companion/components/ConnectionStateViews';
import { CompanionDemoWalkthrough } from '../src/features/companion/components/CompanionDemoWalkthrough';

describe('Companion pairing requirements', () => {
  it('states the real Desktop mode and short-lived-code trust boundary', () => {
    const screen = render(<DisconnectedView onScanPress={jest.fn()} />);

    expect(screen.getByText('Desktop setup required')).toBeTruthy();
    expect(screen.getByText(/Sign in on Desktop and switch to Managed Cloud/)).toBeTruthy();
    expect(screen.getByText(/apps do not compare account identities/)).toBeTruthy();
    expect(screen.getByText('Go to Settings and select "Connections"')).toBeTruthy();
    expect(screen.queryByText(/same AGI account/i)).toBeNull();
  });

  it('does not claim the devices need the same local network', () => {
    const screen = render(<ConnectingView onCancel={jest.fn()} />);

    expect(screen.getByText(/connect across different networks/)).toBeTruthy();
    expect(screen.queryByText(/same network/i)).toBeNull();
  });

  it('keeps the walkthrough aligned with the production pairing flow', () => {
    const screen = render(<CompanionDemoWalkthrough visible onDone={jest.fn()} />);

    expect(screen.getByText(/Settings > Connections/)).toBeTruthy();
    expect(screen.getByText(/Account identities are not compared/)).toBeTruthy();
    expect(screen.getByText(/do not need the same Wi-Fi/)).toBeTruthy();
  });
});
