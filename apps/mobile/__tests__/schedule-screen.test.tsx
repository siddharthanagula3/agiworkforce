import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockFetchSchedules = jest.fn(async () => undefined);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
    canGoBack: jest.fn(() => true),
  }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return {
    ArrowLeft: icon,
    Calendar: icon,
    ChevronRight: icon,
    Cloud: icon,
    Plus: icon,
    X: icon,
    Zap: icon,
  };
});

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((callback) => callback()),
  rehydrateWhenMmkvReady: jest.fn(),
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

jest.mock('../stores/settingsStore', () => ({
  useSettingsStore: (selector: (state: { hapticsEnabled: boolean }) => unknown) =>
    selector({ hapticsEnabled: false }),
}));

import SchedulesScreen from '../app/(app)/schedules';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useWaitlistStore } from '../src/features/waitlist/store';
import { useScheduleStore } from '../src/features/schedules/store';
import { useTierStore } from '../src/features/billing/store';

describe('Schedules screen Cloud boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchSchedules.mockResolvedValue(undefined);
    useChatAppModeStore.setState({ appMode: 'local' });
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'basic' });
    useScheduleStore.setState({
      schedules: [],
      runs: {},
      loading: false,
      error: null,
      fetchSchedules: mockFetchSchedules,
    });
  });

  it('does not fetch Cloud schedules while Local Mode is active', () => {
    const { getByText, getByLabelText } = render(<SchedulesScreen />);

    expect(getByText('Schedules run in AGI Cloud')).toBeTruthy();
    expect(getByLabelText('Switch to AGI Cloud')).toBeTruthy();
    expect(mockFetchSchedules).not.toHaveBeenCalled();
  });

  it('uses the full-size primary action treatment for the Cloud boundary', () => {
    useWaitlistStore.setState({ cloudUnlocked: false });
    const { getByLabelText } = render(<SchedulesScreen />);
    const action = getByLabelText('Sign in to AGI Cloud');
    expect(typeof action.props.style).not.toBe('function');
    const actionStyle = StyleSheet.flatten(
      typeof action.props.style === 'function'
        ? action.props.style({ pressed: false })
        : action.props.style,
    );

    expect(action.props.className).toBeUndefined();
    expect(actionStyle.alignItems).toBe('center');
    expect(actionStyle.justifyContent).toBe('center');
    expect(actionStyle.minHeight).toBe(52);
    expect(actionStyle.backgroundColor).toBeTruthy();
  });

  it('fetches only after a signed-in user explicitly switches to Cloud', async () => {
    const { getByLabelText } = render(<SchedulesScreen />);

    fireEvent.press(getByLabelText('Switch to AGI Cloud'));

    await waitFor(() => {
      expect(useChatAppModeStore.getState().appMode).toBe('cloud');
      expect(mockFetchSchedules).toHaveBeenCalledTimes(1);
    });
  });

  it('routes signed-out users to Cloud sign-in without changing modes', () => {
    useWaitlistStore.setState({ cloudUnlocked: false });
    const { getByLabelText } = render(<SchedulesScreen />);

    fireEvent.press(getByLabelText('Sign in to AGI Cloud'));

    expect(mockPush).toHaveBeenCalledWith('/(auth)/login');
    expect(useChatAppModeStore.getState().appMode).toBe('local');
    expect(mockFetchSchedules).not.toHaveBeenCalled();
  });

  it('loads schedules immediately when the route opens in Cloud mode', async () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const { getByText, getByLabelText } = render(<SchedulesScreen />);

    expect(getByText('No Schedules')).toBeTruthy();
    expect(getByText('Try a template')).toBeTruthy();
    expect(getByLabelText('Use Daily focus template')).toBeTruthy();
    await waitFor(() => expect(mockFetchSchedules).toHaveBeenCalledTimes(1));
  });

  it('opens the create form with only an allowlisted template ID', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const { getByLabelText } = render(<SchedulesScreen />);

    fireEvent.press(getByLabelText('Use Monday kickoff template'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/schedules/create',
      params: { template: 'monday-kickoff' },
    });
  });

  it('does not contact Cloud when a signed-out session has stale Cloud mode state', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useWaitlistStore.setState({ cloudUnlocked: false });

    const { getByLabelText } = render(<SchedulesScreen />);

    expect(getByLabelText('Sign in to AGI Cloud')).toBeTruthy();
    expect(mockFetchSchedules).not.toHaveBeenCalled();
  });

  it('sends Free users to plan options instead of advertising an unavailable task', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useTierStore.setState({ tier: 'free' });

    const { getByLabelText, queryByLabelText } = render(<SchedulesScreen />);

    expect(queryByLabelText('Quick schedule')).toBeNull();
    expect(queryByLabelText('Use Daily focus template')).toBeNull();
    fireEvent.press(getByLabelText('View plans for scheduled tasks'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/cloud-billing');
  });
});
