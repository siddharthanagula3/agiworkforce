/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockListSupportTickets = jest.fn();
let mockAuth: { isClerkLoaded: boolean; isClerkSignedIn: boolean; clerkUserId: string | null } = {
  isClerkLoaded: true,
  isClerkSignedIn: true,
  clerkUserId: 'user_a',
};

const mockPush = jest.fn();
const mockSetAppMode = jest.fn();
let mockAppMode = 'cloud';

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const Icon = () => <View />;
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? true : Icon) });
});

jest.mock('@/src/ui/theme', () => {
  const tokens = jest.requireActual('@/src/ui/theme/tokens');
  return { useThemeColors: () => tokens.lightColors };
});

jest.mock('@/components/ui/Button', () => {
  const { Pressable, Text } = require('react-native');
  return {
    Button: ({ title, onPress }: { title: string; onPress: () => void }) => (
      <Pressable onPress={onPress}>
        <Text>{title}</Text>
      </Pressable>
    ),
  };
});

jest.mock('@/components/ui/Text', () => ({ Text: require('react-native').Text }));

jest.mock('@/src/features/auth/store', () => ({
  useAuthStore: (selector: (state: typeof mockAuth) => unknown) => selector(mockAuth),
}));

jest.mock('@/src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: (
    selector: (state: { appMode: string; setAppMode: typeof mockSetAppMode }) => unknown,
  ) => selector({ appMode: mockAppMode, setAppMode: mockSetAppMode }),
}));

jest.mock('@/src/features/settings/Common', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    CloudAccountRequired: ({ onSignIn }: { onSignIn: () => void }) => (
      <Pressable accessibilityLabel="Sign in to AGI Cloud" onPress={onSignIn}>
        <Text>Sign in to AGI Cloud</Text>
      </Pressable>
    ),
    CloudSyncBlockedBanner: ({
      message,
      onSwitchToCloud,
    }: {
      message: string;
      onSwitchToCloud: () => void;
    }) => (
      <Pressable accessibilityLabel="Switch to AGI Cloud" onPress={onSwitchToCloud}>
        <Text>{message}</Text>
      </Pressable>
    ),
    SettingsGroup: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    SettingsInfo: ({ body }: { body: string }) => <Text>{body}</Text>,
    SettingsScreenShell: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    SettingsRow: ({
      label,
      value,
      onPress,
    }: {
      label: string;
      value?: string;
      onPress?: () => void;
    }) => (
      <Pressable accessibilityLabel={label} onPress={onPress}>
        <Text>{label}</Text>
        {value ? <Text>{value}</Text> : null}
      </Pressable>
    ),
  };
});

jest.mock('../src/features/support/service', () => ({
  listSupportTickets: (...args: unknown[]) => mockListSupportTickets(...args),
  openSupportTicket: jest.fn(),
}));

import { SupportTicketsScreen } from '../src/features/support/SupportTicketsScreen';

function ticket(id: string, subject: string) {
  return {
    id,
    subject,
    message: 'm',
    status: 'resolved' as const,
    createdAt: '2026-09-14T10:00:00.000Z',
    updatedAt: '2026-09-16T10:00:00.000Z',
  };
}

describe('SupportTicketsScreen ticket history', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth = { isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: 'user_a' };
    mockAppMode = 'cloud';
  });

  it('offers a signed-in Local Mode account a switch to Cloud instead of another sign-in', () => {
    mockAppMode = 'local';
    const screen = render(<SupportTicketsScreen />);

    expect(screen.queryByLabelText('Sign in to AGI Cloud')).toBeNull();
    fireEvent.press(screen.getByLabelText('Switch to AGI Cloud'));

    expect(mockSetAppMode).toHaveBeenCalledWith('cloud');
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockListSupportTickets).not.toHaveBeenCalled();
  });

  it('signs a signed-out person in with a Cloud intent that returns to Support', () => {
    mockAuth = { isClerkLoaded: true, isClerkSignedIn: false, clerkUserId: null };
    const screen = render(<SupportTicketsScreen />);

    fireEvent.press(screen.getByLabelText('Sign in to AGI Cloud'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(auth)/login',
      params: { postAuthIntent: 'cloud-support' },
    });
    expect(mockListSupportTickets).not.toHaveBeenCalled();
  });

  it('reaches tickets beyond the first window through the page continuation', async () => {
    mockListSupportTickets
      .mockResolvedValueOnce({ tickets: [ticket('t1', 'Recent one')], nextOffset: 50 })
      .mockResolvedValueOnce({
        tickets: [ticket('t1', 'Recent one'), ticket('t2', 'Resolved long ago')],
        nextOffset: null,
      });
    const screen = render(<SupportTicketsScreen />);

    fireEvent.press(await screen.findByLabelText('Show older tickets'));

    expect(await screen.findByText('Resolved long ago')).toBeTruthy();
    expect(mockListSupportTickets).toHaveBeenLastCalledWith(undefined, 50);
    expect(screen.getAllByText('Recent one')).toHaveLength(1);
    expect(screen.queryByLabelText('Show older tickets')).toBeNull();
  });

  it('keeps the loaded tickets and offers a retry when the older ones fail to load', async () => {
    mockListSupportTickets
      .mockResolvedValueOnce({ tickets: [ticket('t1', 'Recent one')], nextOffset: 50 })
      .mockRejectedValueOnce(new Error('offline'));
    const screen = render(<SupportTicketsScreen />);

    fireEvent.press(await screen.findByLabelText('Show older tickets'));

    expect(await screen.findByLabelText('Older tickets could not be loaded')).toBeTruthy();
    expect(screen.getByText('Recent one')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Retry')).toBeTruthy());
  });

  it('offers no continuation when the account fits one window', async () => {
    mockListSupportTickets.mockResolvedValueOnce({
      tickets: [ticket('t1', 'Recent one')],
      nextOffset: null,
    });
    const screen = render(<SupportTicketsScreen />);

    expect(await screen.findByText('Recent one')).toBeTruthy();
    expect(screen.queryByLabelText('Show older tickets')).toBeNull();
  });

  it('tells the customer that support replies also reach them by email', async () => {
    mockListSupportTickets.mockResolvedValueOnce({ tickets: [], nextOffset: null });
    const screen = render(<SupportTicketsScreen />);

    expect(await screen.findByText(/Support replies here and by email/)).toBeTruthy();
    expect(screen.queryByText(/not emailed/i)).toBeNull();
  });

  it('drops the loaded tickets when the account signs out and does not show them to the next account', async () => {
    mockListSupportTickets
      .mockResolvedValueOnce({ tickets: [ticket('t1', 'First account ticket')], nextOffset: null })
      .mockImplementationOnce(() => new Promise(() => undefined));
    const screen = render(<SupportTicketsScreen />);
    expect(await screen.findByText('First account ticket')).toBeTruthy();

    mockAuth = { isClerkLoaded: true, isClerkSignedIn: false, clerkUserId: null };
    screen.rerender(<SupportTicketsScreen />);
    expect(screen.queryByText('First account ticket')).toBeNull();

    mockAuth = { isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: 'user_b' };
    screen.rerender(<SupportTicketsScreen />);
    expect(screen.queryByText('First account ticket')).toBeNull();
    expect(screen.getByLabelText('Loading your tickets')).toBeTruthy();
  });

  it('starts from a clean list when the signed-in account changes in place', async () => {
    mockListSupportTickets
      .mockResolvedValueOnce({ tickets: [ticket('t1', 'First account ticket')], nextOffset: null })
      .mockImplementationOnce(() => new Promise(() => undefined));
    const screen = render(<SupportTicketsScreen />);
    expect(await screen.findByText('First account ticket')).toBeTruthy();

    mockAuth = { isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: 'user_b' };
    screen.rerender(<SupportTicketsScreen />);

    expect(screen.queryByText('First account ticket')).toBeNull();
    expect(screen.getByLabelText('Loading your tickets')).toBeTruthy();
  });
});
