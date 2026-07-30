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

jest.mock('@/src/ui/theme', () => ({
  colors: {
    teal: '#14b8a6',
    agentActive: '#3b82f6',
    agentSuccess: '#10b981',
    agentWarning: '#f59e0b',
    agentError: '#ef4444',
    textMuted: '#6b7280',
  },
}));

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
    const screen = render(<ConnectingView />);

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
