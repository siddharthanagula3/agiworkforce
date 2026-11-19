/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { render } from '@testing-library/react-native';

const mockReadSupportTicket = jest.fn();
let mockAuth: { isClerkLoaded: boolean; isClerkSignedIn: boolean; clerkUserId: string | null } = {
  isClerkLoaded: true,
  isClerkSignedIn: true,
  clerkUserId: 'user_a',
};
let mockAppMode = 'cloud';

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({ push: jest.fn() }),
}));

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
  useChatAppModeStore: (selector: (state: { appMode: string }) => unknown) =>
    selector({ appMode: mockAppMode }),
}));

jest.mock('@/src/features/settings/Common', () => {
  const { Text, View } = require('react-native');
  return {
    CloudAccountRequired: () => <Text>Sign in required</Text>,
    CloudSyncBlockedBanner: ({ message }: { message: string }) => <Text>{message}</Text>,
    SettingsScreenShell: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock('../src/features/support/service', () => ({
  canReplyToTicket: () => true,
  closeSupportTicket: jest.fn(),
  readSupportTicket: (...args: unknown[]) => mockReadSupportTicket(...args),
  replyToSupportTicket: jest.fn(),
}));

import { SupportTicketScreen } from '../src/features/support/SupportTicketScreen';

function thread(id: string, subject: string, message: string) {
  return {
    ticket: {
      id,
      subject,
      message,
      status: 'open' as const,
      createdAt: '2026-09-14T10:00:00.000Z',
      updatedAt: '2026-09-16T10:00:00.000Z',
    },
    replies: [],
  };
}

describe('SupportTicketScreen account custody', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth = { isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: 'user_a' };
    mockAppMode = 'cloud';
  });

  it('shows the loaded thread to its signed-in owner', async () => {
    mockReadSupportTicket.mockResolvedValueOnce(thread('t1', 'Billing question', 'Private text'));
    const screen = render(<SupportTicketScreen ticketId="t1" />);

    expect(await screen.findByText('Billing question')).toBeTruthy();
    expect(screen.getByText('Private text')).toBeTruthy();
  });

  it('removes the loaded thread when the session is retired', async () => {
    mockReadSupportTicket.mockResolvedValueOnce(thread('t1', 'Billing question', 'Private text'));
    const screen = render(<SupportTicketScreen ticketId="t1" />);
    expect(await screen.findByText('Private text')).toBeTruthy();

    mockAuth = { isClerkLoaded: true, isClerkSignedIn: false, clerkUserId: null };
    screen.rerender(<SupportTicketScreen ticketId="t1" />);

    expect(screen.queryByText('Billing question')).toBeNull();
    expect(screen.queryByText('Private text')).toBeNull();
    expect(screen.getByText('Sign in required')).toBeTruthy();
  });

  it('removes the loaded thread when the app leaves Cloud mode', async () => {
    mockReadSupportTicket.mockResolvedValueOnce(thread('t1', 'Billing question', 'Private text'));
    const screen = render(<SupportTicketScreen ticketId="t1" />);
    expect(await screen.findByText('Private text')).toBeTruthy();

    mockAppMode = 'local';
    screen.rerender(<SupportTicketScreen ticketId="t1" />);

    expect(screen.queryByText('Private text')).toBeNull();
    expect(screen.getByText('Support tickets are kept in your Cloud account.')).toBeTruthy();
    expect(screen.queryByText('Sign in required')).toBeNull();
  });

  it('does not show the previous account thread to a replacement account', async () => {
    mockReadSupportTicket
      .mockResolvedValueOnce(thread('t1', 'Billing question', 'Private text'))
      .mockImplementationOnce(() => new Promise(() => undefined));
    const screen = render(<SupportTicketScreen ticketId="t1" />);
    expect(await screen.findByText('Private text')).toBeTruthy();

    mockAuth = { isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: 'user_b' };
    screen.rerender(<SupportTicketScreen ticketId="t1" />);

    expect(screen.queryByText('Private text')).toBeNull();
    expect(screen.getByText('Loading the ticket…')).toBeTruthy();
  });

  it('does not carry a thread and a reply draft over to another ticket', async () => {
    mockReadSupportTicket
      .mockResolvedValueOnce(thread('t1', 'Billing question', 'Private text'))
      .mockImplementationOnce(() => new Promise(() => undefined));
    const screen = render(<SupportTicketScreen ticketId="t1" />);
    expect(await screen.findByText('Private text')).toBeTruthy();

    screen.rerender(<SupportTicketScreen ticketId="t2" />);

    expect(screen.queryByText('Private text')).toBeNull();
    expect(screen.getByText('Loading the ticket…')).toBeTruthy();
  });
});
