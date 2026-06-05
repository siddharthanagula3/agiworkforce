/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    canGoBack: jest.fn().mockReturnValue(true),
    back: jest.fn(),
  }),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      version: '2.1.0',
      ios: { buildNumber: '42' },
    },
  },
}));

jest.mock('react-native-safe-area-context', () => {
  return {
    SafeAreaView: ({ children }: { children: unknown }) => children,
  };
});

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return {
    Baby: icon,
    Bell: icon,
    Brain: icon,
    ChevronRight: icon,
    CircleHelp: icon,
    CreditCard: icon,
    Database: icon,
    Info: icon,
    Link2: icon,
    LogOut: icon,
    Mail: icon,
    MessageCircleWarning: icon,
    Mic: icon,
    Palette: icon,
    Plug: icon,
    RotateCcw: icon,
    Shield: icon,
    SlidersHorizontal: icon,
    Sparkles: icon,
    UserRound: icon,
    Zap: icon,
  };
});

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store, _name) => {
    if (store?.persist?.rehydrate) store.persist.rehydrate();
  }),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(async () => null),
  getAuthHeaders: jest.fn(async () => ({})),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(async () => undefined),
  getCurrentUser: jest.fn(async () => null),
  getCurrentUserId: jest.fn(async () => null),
}));

jest.mock('../src/features/cloud-bridge', () => {
  const { View } = require('react-native');
  return {
    InviteCodeModal: ({ open }: { open: boolean }) =>
      open ? <View testID="invite-code-modal" /> : null,
  };
});

import SettingsTabScreen from '../app/(app)/(tabs)/settings';
import { useSettingsStore } from '../stores/settingsStore';

describe('Settings page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSettingsStore.setState({ themeMode: 'system', accentColor: 'neutral' });
  });

  it('renders the new settings information architecture', () => {
    const { getByText, queryByText } = render(<SettingsTabScreen />);

    expect(getByText('Settings')).toBeTruthy();
    expect(getByText('Personalization')).toBeTruthy();
    expect(getByText('Memory')).toBeTruthy();
    expect(getByText('Appearance')).toBeTruthy();
    expect(getByText('Accent Color')).toBeTruthy();
    expect(getByText('General')).toBeTruthy();
    expect(getByText('Safety & Security')).toBeTruthy();
    expect(getByText('Data Controls')).toBeTruthy();
    expect(getByText('Parental Controls')).toBeTruthy();
    expect(queryByText(/byok/i)).toBeNull();
  });

  it('shows cloud rows as invite-gated instead of live account controls', () => {
    const { getByText, getAllByText, queryByText } = render(<SettingsTabScreen />);

    expect(getAllByText('Cloud').length).toBeGreaterThan(0);
    expect(getByText('Email / Phone Number')).toBeTruthy();
    expect(getByText('Subscription')).toBeTruthy();
    expect(getByText('Connectors')).toBeTruthy();
    expect(getByText('Plugins')).toBeTruthy();
    expect(getByText('Skills')).toBeTruthy();
    expect(getAllByText('Invite').length).toBeGreaterThan(0);
    expect(queryByText('Log Out')).toBeNull();
  });

  it('opens invite modal from a cloud row', () => {
    const { getByLabelText, getByTestId } = render(<SettingsTabScreen />);

    fireEvent.press(getByLabelText('Subscription. Invite'));

    expect(getByTestId('invite-code-modal')).toBeTruthy();
  });

  it('navigates to real local settings routes', () => {
    const { getByLabelText } = render(<SettingsTabScreen />);

    fireEvent.press(getByLabelText('Appearance. System'));
    fireEvent.press(getByLabelText('Data Controls'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/appearance');
    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/data-controls');
  });

  it('renders version in About row', () => {
    const { getByText } = render(<SettingsTabScreen />);
    expect(getByText('v2.1.0')).toBeTruthy();
  });
});
