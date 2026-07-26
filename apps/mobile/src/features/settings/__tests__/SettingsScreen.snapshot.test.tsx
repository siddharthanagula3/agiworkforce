/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Snapshot tests for the Settings screen — inset-grouped card layout (round 18).
 * Locks the rendered section card structure to catch visual regressions.
 */

import React from 'react';
import { render } from '@testing-library/react-native';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('@/src/ui/theme', () => ({
  colors: {
    textPrimary: '#fff',
    textSecondary: '#aaa',
    textMuted: '#777',
    border: '#333',
    teal: '#2dd4bf',
    background: '#0e0e0e',
    surfaceBase: '#0e0e0e',
    surfaceElevated: '#1a1a1a',
    surfaceOverlay: '#0e0e0e',
    agentWarning: '#f59e0b',
    agentError: '#ef4444',
  },
  cardRadius: 24,
  sheetRadius: 32,
  useTheme: () => ({
    colors: {
      textPrimary: '#fff',
      textSecondary: '#aaa',
      textMuted: '#777',
      border: '#333',
      teal: '#2dd4bf',
      background: '#0e0e0e',
      surfaceBase: '#0e0e0e',
      surfaceElevated: '#1a1a1a',
      surfaceOverlay: '#0e0e0e',
      agentWarning: '#f59e0b',
    },
    isDark: true,
  }),
  useThemeColors: () => ({
    textPrimary: '#fff',
    textSecondary: '#aaa',
    textMuted: '#777',
    border: '#333',
    teal: '#2dd4bf',
    background: '#0e0e0e',
    surfaceBase: '#0e0e0e',
    surfaceElevated: '#1a1a1a',
    surfaceOverlay: '#0e0e0e',
    agentWarning: '#f59e0b',
  }),
}));

jest.mock('@/components/ui/text', () => {
  const RN = require('react-native');
  const Text = (props: Record<string, unknown>) => <RN.Text {...props} />;
  Text.displayName = 'Text';
  return { Text };
});

jest.mock('@/components/ui/switch', () => {
  const RN = require('react-native');
  return { Switch: (props: Record<string, unknown>) => <RN.Switch {...props} /> };
});

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const factory = (name: string) => (props: Record<string, unknown>) => (
    <RN.View testID={`icon-${name}`} {...props} />
  );
  return new Proxy(
    {},
    {
      get: (_target, name: string) => {
        if (name === '__esModule') return true;
        return factory(name);
      },
    },
  );
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      version: '1.0.0',
      ios: { buildNumber: '1' },
    },
  },
}));

jest.mock('react-native-safe-area-context', () => {
  const RN = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }: Record<string, unknown>) => (
      <RN.View {...props}>{children as React.ReactNode}</RN.View>
    ),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

const mockSettingsState = {
  hapticsEnabled: true,
  themeMode: 'system' as const,
  accentColor: 'neutral' as const,
  personalization: {
    nickname: '',
    fullName: '',
    occupation: '',
  },
  isTemporaryChat: false,
  autoApproveMode: 'ask',
  setHapticsEnabled: jest.fn(),
  setThemeMode: jest.fn(),
  setAccentColor: jest.fn(),
  setTemporaryChat: jest.fn(),
  setAutoApproveMode: jest.fn(),
};

jest.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (sel?: (s: typeof mockSettingsState) => unknown) =>
    sel ? sel(mockSettingsState) : mockSettingsState,
}));

jest.mock('@/src/features/model-picker/store', () => ({
  useModelStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ selectedModel: 'llama-3.2-1b' }),
}));

jest.mock('@/src/features/model-picker/service', () => ({
  getDisplayName: (id: string) => id,
  getShortDisplayName: (id: string) => id,
}));

jest.mock('@/lib/safeOpenURL', () => ({
  openExternalUrl: jest.fn(),
}));

jest.mock('@clerk/expo', () => ({
  useUser: () => ({ user: null, isLoaded: true }),
}));

jest.mock('@/lib/v1FeatureFlags', () => ({
  FEATURES: { companion: false, connectors: false, iap: false },
}));

jest.mock('@/src/features/auth/store', () => ({
  useAuthStore: (
    selector: (s: {
      user: null;
      signOut: jest.Mock;
      isClerkLoaded: boolean;
      isClerkSignedIn: boolean;
      clerkUserId: null;
    }) => unknown,
  ) =>
    selector({
      user: null,
      signOut: jest.fn(),
      isClerkLoaded: true,
      isClerkSignedIn: false,
      clerkUserId: null,
    }),
}));

jest.mock('@/src/features/waitlist/store', () => ({
  useWaitlistStore: (selector: (s: { cloudUnlocked: boolean }) => unknown) =>
    selector({ cloudUnlocked: false }),
}));

jest.mock('@/src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: (selector: (s: { appMode: string }) => unknown) =>
    selector({ appMode: 'local' }),
}));

jest.mock('@/src/features/cloud-bridge', () => {
  const { View } = require('react-native');
  return {
    InviteCodeModal: ({ open }: { open: boolean }) =>
      open ? <View testID="invite-code-modal" /> : null,
  };
});

jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Sheet = React.forwardRef(
    ({ children }: { children?: React.ReactNode }, _ref: React.Ref<unknown>) => (
      <View testID="bottom-sheet">{children}</View>
    ),
  );
  Sheet.displayName = 'BottomSheet';
  return { __esModule: true, default: Sheet };
});

jest.mock('@/src/features/voice/components/VoiceSelector', () => {
  const React = require('react');
  const { View } = require('react-native');
  const VoiceSelector = React.forwardRef(
    (_props: Record<string, unknown>, _ref: React.Ref<unknown>) => <View testID="voice-selector" />,
  );
  VoiceSelector.displayName = 'VoiceSelector';
  return { VoiceSelector };
});

// ── Imports ───────────────────────────────────────────────────────────────────

import SettingsTabScreen from '@/src/features/settings';

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('SettingsScreen — inset-grouped card layout', () => {
  it('locks the full settings screen tree (system mode, local demo)', () => {
    const { toJSON } = render(<SettingsTabScreen />);
    expect(toJSON()).toMatchSnapshot();
  });
});
