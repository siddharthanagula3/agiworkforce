/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('react-native-reanimated', () => {
  const Animated = require('react-native').Animated;
  return {
    __esModule: true,
    default: {
      View: require('react-native').View,
      Text: require('react-native').Text,
      Image: require('react-native').Image,
      createAnimatedComponent: (c: unknown) => c,
    },
    useAnimatedStyle: () => ({}),
    useSharedValue: (initial: unknown) => ({ value: initial }),
    withRepeat: (x: unknown) => x,
    withTiming: (x: unknown) => x,
    withSequence: (...args: unknown[]) => args[0],
    cancelAnimation: jest.fn(),
    Easing: { inOut: (x: unknown) => x, ease: (x: unknown) => x },
    FadeIn: { duration: () => ({ build: jest.fn() }) },
    FadeOut: { duration: () => ({ build: jest.fn() }) },
    SlideInDown: { duration: () => ({ springify: () => ({ build: jest.fn() }) }) },
    LinearTransition: { springify: () => ({ build: jest.fn() }) },
    Animated,
  };
});

jest.mock(
  'lucide-react-native',
  () => new Proxy({}, { get: () => jest.fn().mockReturnValue(null) }),
);

jest.mock('@/components/ui/text', () => ({
  Text: jest.fn().mockReturnValue(null),
}));

jest.mock('@/components/ui/button', () => ({
  Button: jest.fn().mockReturnValue(null),
}));

jest.mock('@/components/ui/card', () => ({
  Card: jest.fn().mockReturnValue(null),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: jest.fn().mockReturnValue(null),
}));

jest.mock('@/components/ui/separator', () => ({
  Separator: jest.fn().mockReturnValue(null),
}));

jest.mock('@/components/companion/AgentDashboard', () => ({
  AgentDashboard: jest.fn().mockReturnValue(null),
}));

jest.mock('@/lib/theme', () => ({
  colors: {
    teal: '#14b8a6',
    agentWarning: '#f59e0b',
    agentError: '#ef4444',
    textSecondary: '#9ca3af',
    textMuted: '#6b7280',
  },
}));

import {
  StaleApprovalBanner,
  DisconnectedDesktopBanner,
  ReconnectingBanner,
} from '../components/companion/StatusBanners';

import {
  DisconnectedView,
  ConnectingView,
  ErrorView,
  SessionExpiredView,
} from '../components/companion/ConnectionStateViews';

import { DesktopInfoCard } from '../components/companion/DesktopInfoCard';

describe('StatusBanners', () => {
  it('StaleApprovalBanner renders nothing when heartbeat is fresh', () => {
    const { toJSON } = render(<StaleApprovalBanner lastHeartbeatAt={Date.now()} />);
    expect(toJSON()).toBeNull();
  });

  it('StaleApprovalBanner renders warning when heartbeat is stale', () => {
    const { toJSON } = render(<StaleApprovalBanner lastHeartbeatAt={Date.now() - 120_000} />);
    expect(toJSON()).not.toBeNull();
  });

  it('DisconnectedDesktopBanner renders without crash', () => {
    const { toJSON } = render(<DisconnectedDesktopBanner onReconnect={jest.fn()} />);
    expect(toJSON()).not.toBeNull();
  });

  it('ReconnectingBanner renders without crash', () => {
    const { toJSON } = render(<ReconnectingBanner countdown={10} onReconnect={jest.fn()} />);
    expect(toJSON()).not.toBeNull();
  });
});

describe('ConnectionStateViews', () => {
  it('DisconnectedView renders without crash', () => {
    const { toJSON } = render(<DisconnectedView onScanPress={jest.fn()} />);
    expect(toJSON()).not.toBeNull();
  });

  it('ConnectingView renders without crash', () => {
    const { toJSON } = render(<ConnectingView />);
    expect(toJSON()).not.toBeNull();
  });

  it('ErrorView renders with error message', () => {
    const { toJSON } = render(<ErrorView error="timeout" onRetry={jest.fn()} />);
    expect(toJSON()).not.toBeNull();
  });

  it('ErrorView renders with null error', () => {
    const { toJSON } = render(<ErrorView error={null} onRetry={jest.fn()} />);
    expect(toJSON()).not.toBeNull();
  });

  it('SessionExpiredView renders without crash', () => {
    const { toJSON } = render(<SessionExpiredView onRePair={jest.fn()} />);
    expect(toJSON()).not.toBeNull();
  });
});

describe('DesktopInfoCard', () => {
  it('renders with minimal props', () => {
    const { toJSON } = render(
      <DesktopInfoCard desktopName={null} desktopMetadata={null} onDisconnect={jest.fn()} />,
    );
    expect(toJSON()).not.toBeNull();
  });

  it('renders with full metadata', () => {
    const meta = { platform: 'darwin', version: '1.2.0', os: 'macOS', arch: 'arm64' };
    const { toJSON } = render(
      <DesktopInfoCard
        desktopName="Siddharthas-MBP"
        desktopMetadata={meta}
        onDisconnect={jest.fn()}
      />,
    );
    expect(toJSON()).not.toBeNull();
  });
});
