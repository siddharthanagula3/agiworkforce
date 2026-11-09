/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockListSupportTickets = jest.fn();

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({ push: jest.fn() }),
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
  useAuthStore: (selector: (state: Record<string, boolean>) => unknown) =>
    selector({ isClerkLoaded: true, isClerkSignedIn: true }),
}));

jest.mock('@/src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: (selector: (state: { appMode: string }) => unknown) =>
    selector({ appMode: 'cloud' }),
}));

jest.mock('@/src/features/settings/Common', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    CloudAccountRequired: () => null,
    SettingsGroup: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    SettingsInfo: () => null,
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
});
