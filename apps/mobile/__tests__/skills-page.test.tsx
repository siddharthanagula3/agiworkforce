/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockSetAppMode = jest.fn();
const mockFetchManagedSkills = jest.fn();

let mockAppMode: 'local' | 'cloud' = 'cloud';
let mockAuthState = {
  isClerkLoaded: true,
  isClerkSignedIn: true,
  clerkUserId: 'user-1' as string | null,
};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: () => true,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('lucide-react-native', () => {
  const Icon = () => null;
  return {
    ArrowLeft: Icon,
    BookOpen: Icon,
    Cloud: Icon,
    RefreshCw: Icon,
    Search: Icon,
    Sparkles: Icon,
    X: Icon,
  };
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

jest.mock('@/components/ui/skeleton', () => {
  const { View } = require('react-native');
  return { Skeleton: () => <View testID="skills-loading-skeleton" /> };
});

jest.mock('@/src/ui/theme', () => ({
  useThemeColors: () => ({
    surfaceBase: '#111111',
    surfaceElevated: '#222222',
    surfaceHover: '#333333',
    textPrimary: '#ffffff',
    textSecondary: '#cccccc',
    textMuted: '#999999',
    border: '#444444',
    accentSurface: '#252525',
    accentBorder: '#555555',
    inputSurface: '#202020',
    neutralSurface: '#252525',
    neutralBorder: '#454545',
    dangerSurface: '#301919',
    dangerBorder: '#703030',
    agentError: '#ff7777',
    transparent: 'transparent',
  }),
}));

jest.mock('@/src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: (
    selector: (state: {
      appMode: 'local' | 'cloud';
      setAppMode: (mode: 'local' | 'cloud') => void;
    }) => unknown,
  ) => selector({ appMode: mockAppMode, setAppMode: mockSetAppMode }),
}));

jest.mock('@/src/features/auth/store', () => ({
  useAuthStore: (
    selector: (state: {
      isClerkLoaded: boolean;
      isClerkSignedIn: boolean;
      clerkUserId: string | null;
    }) => unknown,
  ) => selector(mockAuthState),
}));

jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: () =>
    mockAuthState.clerkUserId ? { ownerId: mockAuthState.clerkUserId, epoch: 1 } : null,
  isCloudAccountEpochCurrent: () => Boolean(mockAuthState.clerkUserId),
}));

jest.mock('@/src/features/skills/service', () => ({
  fetchManagedSkills: (...args: unknown[]) => mockFetchManagedSkills(...args),
}));

import { SkillsScreen } from '@/src/features/skills/SkillsScreen';

describe('Mobile Skills screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppMode = 'cloud';
    mockAuthState = {
      isClerkLoaded: true,
      isClerkSignedIn: true,
      clerkUserId: 'user-1',
    };
    mockFetchManagedSkills.mockResolvedValue([
      {
        name: 'Documents',
        description: 'Create and edit documents.',
        source: 'bundled',
      },
      {
        name: 'Release helper',
        description: 'Prepare a production handoff.',
        source: 'workspace',
      },
    ]);
  });

  it('renders the real catalog with source badges and filters across metadata', async () => {
    const screen = render(<SkillsScreen />);

    expect(await screen.findByText('Documents')).toBeTruthy();
    expect(screen.getByText('Built in')).toBeTruthy();
    expect(screen.getByText('Workspace')).toBeTruthy();
    expect(screen.getByLabelText('2 skills available')).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText('Search skills'), 'production');

    expect(screen.queryByText('Documents')).toBeNull();
    expect(screen.getByText('Release helper')).toBeTruthy();
    expect(mockFetchManagedSkills).toHaveBeenCalledTimes(1);
  });

  it('teaches the next step when the deployment has no Skills', async () => {
    mockFetchManagedSkills.mockResolvedValueOnce([]);
    const screen = render(<SkillsScreen />);

    expect(await screen.findByText('No managed Skills yet')).toBeTruthy();
    expect(screen.getByText(/When Skills are added to this AGI Cloud deployment/)).toBeTruthy();
  });

  it('does not call the Cloud API from Local Mode and requires an explicit switch', () => {
    mockAppMode = 'local';
    const screen = render(<SkillsScreen />);

    expect(screen.getByText('Skills are available in AGI Cloud')).toBeTruthy();
    expect(mockFetchManagedSkills).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Switch to AGI Cloud'));
    expect(mockSetAppMode).toHaveBeenCalledWith('cloud');
  });

  it('routes signed-out users to Clerk sign-in without requesting the catalog', () => {
    mockAppMode = 'local';
    mockAuthState = {
      isClerkLoaded: true,
      isClerkSignedIn: false,
      clerkUserId: null,
    };
    const screen = render(<SkillsScreen />);

    fireEvent.press(screen.getByLabelText('Sign in to AGI Cloud'));

    expect(mockPush).toHaveBeenCalledWith('/(auth)/login');
    expect(mockFetchManagedSkills).not.toHaveBeenCalled();
  });

  it('shows a retryable error without leaking raw response content', async () => {
    mockFetchManagedSkills.mockRejectedValueOnce(new Error('Skills are temporarily unavailable.'));
    const screen = render(<SkillsScreen />);

    expect(await screen.findByText('Could not load Skills')).toBeTruthy();
    expect(screen.getByText('Skills are temporarily unavailable.')).toBeTruthy();

    mockFetchManagedSkills.mockResolvedValueOnce([]);
    fireEvent.press(screen.getByLabelText('Try again'));

    await waitFor(() => expect(mockFetchManagedSkills).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('No managed Skills yet')).toBeTruthy();
  });
});
