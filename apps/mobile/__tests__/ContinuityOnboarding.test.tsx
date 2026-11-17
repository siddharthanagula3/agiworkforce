/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { PRODUCT_NAMES } from '@agiworkforce/types';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);
const mockGetBoolean = jest.fn();
const mockSet = jest.fn();
let mockPathname = '/chat';

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  usePathname: () => mockPathname,
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const Icon = (props: Record<string, unknown>) => <View {...props} />;
  return {
    Clock3: Icon,
    Globe2: Icon,
    ListChecks: Icon,
    X: Icon,
  };
});

jest.mock('../lib/mmkv', () => ({
  storage: {
    getBoolean: (key: string) => mockGetBoolean(key),
    set: (key: string, value: boolean) => mockSet(key, value),
  },
  whenMmkvReady: jest.fn((callback) => callback()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('@/src/ui/theme', () => {
  const palette = {
    surfaceBase: '#111111',
    surfaceElevated: '#222222',
    surfaceHover: '#333333',
    textPrimary: '#ffffff',
    textSecondary: '#cccccc',
    textMuted: '#999999',
    border: '#444444',
    purpleSurface: '#221133',
    purple: '#aa77ff',
    accentSurface: '#333333',
    accentBorder: '#555555',
    teal: '#ffffff',
    accentText: '#000000',
    transparent: 'transparent',
  };
  return {
    cardRadius: 16,
    useThemeColors: () => palette,
  };
});

import { ContinuityOnboardingGate } from '../src/features/continuity/ContinuityOnboardingGate';
import ContinuityOnboardingScreen from '../src/features/continuity/ContinuityOnboardingScreen';
import {
  acknowledgeContinuityOnboarding,
  hasAcknowledgedContinuityOnboarding,
} from '../src/features/continuity/continuity-onboarding';
import { useAuthStore } from '../src/features/auth/store';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useTierStore } from '../src/features/billing/store';
import { useWaitlistStore } from '../src/features/waitlist/store';
import { useChatStore } from '../stores/chatStore';

const PLAN_REFRESHED_AT = '2026-11-14T00:00:00.000Z';

describe('Mobile cross-device continuity onboarding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname = '/chat';
    mockCanGoBack.mockReturnValue(true);
    mockGetBoolean.mockReturnValue(false);
    useAuthStore.setState({
      isClerkLoaded: true,
      isClerkSignedIn: true,
      clerkUserId: 'user-1',
    });
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useTierStore.setState({ tier: 'free', lastRefreshedAt: null });
    useWaitlistStore.setState({ cloudUnlocked: true });
    useChatStore.getState().setWorkMode('chat');
  });

  it('stores acknowledgement per encoded Cloud owner', () => {
    acknowledgeContinuityOnboarding('user/one');
    expect(mockSet).toHaveBeenCalledWith('continuity-onboarding:v1:user%2Fone', true);

    mockGetBoolean.mockReturnValue(true);
    expect(hasAcknowledgedContinuityOnboarding('user/one')).toBe(true);
    expect(mockGetBoolean).toHaveBeenCalledWith('continuity-onboarding:v1:user%2Fone');
  });

  it('presents once when an owner whose plan includes Work first enters Managed Cloud', async () => {
    useTierStore.setState({ tier: 'pro', lastRefreshedAt: PLAN_REFRESHED_AT });
    const screen = render(<ContinuityOnboardingGate />);

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/continuity',
        params: { source: 'first-cloud' },
      }),
    );

    screen.rerender(<ContinuityOnboardingGate />);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('never presents Work to an owner whose plan leaves it out', async () => {
    useTierStore.setState({ tier: 'free', lastRefreshedAt: PLAN_REFRESHED_AT });
    render(<ContinuityOnboardingGate />);
    await act(async () => Promise.resolve());

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('waits for the plan before presenting, then presents once it includes Work', async () => {
    useTierStore.setState({ tier: 'pro', lastRefreshedAt: null });
    render(<ContinuityOnboardingGate />);
    await act(async () => Promise.resolve());
    expect(mockPush).not.toHaveBeenCalled();

    act(() => useTierStore.setState({ lastRefreshedAt: PLAN_REFRESHED_AT }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
  });

  it('does not present in Local Mode or after the owner acknowledged it', async () => {
    useTierStore.setState({ tier: 'pro', lastRefreshedAt: PLAN_REFRESHED_AT });
    useChatAppModeStore.setState({ appMode: 'local' });
    const screen = render(<ContinuityOnboardingGate />);
    await act(async () => Promise.resolve());
    expect(mockPush).not.toHaveBeenCalled();

    mockGetBoolean.mockReturnValue(true);
    act(() => useChatAppModeStore.setState({ appMode: 'cloud' }));
    screen.rerender(<ContinuityOnboardingGate />);
    await act(async () => Promise.resolve());
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows the verifiable benefits and starts in the Managed Cloud composer', () => {
    useChatAppModeStore.setState({ appMode: 'local' });
    const { getByText, getByLabelText } = render(<ContinuityOnboardingScreen />);

    expect(getByText(PRODUCT_NAMES.work)).toBeTruthy();
    expect(getByText('Beta')).toBeTruthy();
    expect(getByText("Keep Cloud work going when you're on the go")).toBeTruthy();
    expect(getByText('Start and steer tasks from your device')).toBeTruthy();
    expect(getByText('Check in from any signed-in surface')).toBeTruthy();
    expect(getByText('Work continues when the app is closed')).toBeTruthy();

    fireEvent.press(getByLabelText('Start a Managed Cloud task'));

    expect(mockSet).toHaveBeenCalledWith('continuity-onboarding:v1:user-1', true);
    expect(useChatAppModeStore.getState().appMode).toBe('cloud');
    expect(mockReplace).toHaveBeenCalledWith('/(app)/(tabs)/chat');
    expect(useChatStore.getState().workMode).toBe('chat');
  });

  it('names this device rather than a phone', () => {
    const { getByText, queryByText } = render(<ContinuityOnboardingScreen />);

    expect(getByText('The same task on your device, browser and desktop.')).toBeTruthy();
    expect(queryByText(/phone/i)).toBeNull();
  });

  it('holds the screen to a centred form column that never exceeds an iPhone window', () => {
    const { UNSAFE_getByType } = render(<ContinuityOnboardingScreen />);

    const style = StyleSheet.flatten(UNSAFE_getByType(ScrollView).props.contentContainerStyle);
    expect(style.maxWidth).toBe(440);
    expect(style.width).toBe('100%');
    expect(style.alignSelf).toBe('center');
  });

  it('lands an owner whose plan includes Work in the Work composer', () => {
    useTierStore.setState({ tier: 'pro' });
    const { getByLabelText } = render(<ContinuityOnboardingScreen />);

    fireEvent.press(getByLabelText('Start a Managed Cloud task'));

    expect(useChatAppModeStore.getState().appMode).toBe('cloud');
    expect(useChatStore.getState().workMode).toBe('agiwork');
    expect(mockReplace).toHaveBeenCalledWith('/(app)/(tabs)/chat');
  });

  it('keeps the Chat composer while Cloud access is still locked', () => {
    useTierStore.setState({ tier: 'pro' });
    useWaitlistStore.setState({ cloudUnlocked: false });
    const { getByLabelText } = render(<ContinuityOnboardingScreen />);

    fireEvent.press(getByLabelText('Start a Managed Cloud task'));

    expect(useChatStore.getState().workMode).toBe('chat');
    expect(mockReplace).toHaveBeenCalledWith('/(app)/(tabs)/chat');
  });

  it('says Work is not in the plan, with no task or purchase step, for a plan that leaves it out', () => {
    useTierStore.setState({ tier: 'free', lastRefreshedAt: PLAN_REFRESHED_AT });
    const { getByText, getByLabelText, queryByLabelText, queryByText } = render(
      <ContinuityOnboardingScreen />,
    );

    expect(getByText(`${PRODUCT_NAMES.work} isn’t included in your plan.`)).toBeTruthy();
    expect(queryByLabelText('Start a Managed Cloud task')).toBeNull();
    expect(queryByText(/upgrade/i)).toBeNull();

    fireEvent.press(getByLabelText('Close'));

    expect(mockSet).toHaveBeenCalledWith('continuity-onboarding:v1:user-1', true);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('persists Not now and returns to the caller', () => {
    const { getByLabelText } = render(<ContinuityOnboardingScreen />);

    fireEvent.press(getByLabelText('Not now'));

    expect(mockSet).toHaveBeenCalledWith('continuity-onboarding:v1:user-1', true);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('routes a signed-out replay to sign in without recording acknowledgement', () => {
    useAuthStore.setState({
      isClerkLoaded: true,
      isClerkSignedIn: false,
      clerkUserId: null,
    });
    const { getByLabelText } = render(<ContinuityOnboardingScreen />);

    fireEvent.press(getByLabelText('Start a Managed Cloud task'));

    expect(mockSet).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(auth)/login',
      params: { postAuthIntent: 'cloud-chat' },
    });
  });
});
