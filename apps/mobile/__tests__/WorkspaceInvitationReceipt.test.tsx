/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockDelete = jest.fn();
const mockCopy = jest.fn();

jest.mock('@/services/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

jest.mock('@/lib/clipboard', () => ({
  copyToClipboard: (...args: unknown[]) => mockCopy(...args),
}));

jest.mock('@/lib/safeOpenURL', () => ({ openInAppBrowser: jest.fn() }));

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
      <Pressable accessibilityLabel={title} onPress={onPress}>
        <Text>{title}</Text>
      </Pressable>
    ),
  };
});

jest.mock('@/components/ui/PressableBox', () => ({
  PressableBox: require('react-native').Pressable,
}));

jest.mock('@/components/ui/Text', () => ({ Text: require('react-native').Text }));

jest.mock('@/src/features/settings/Common', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    SettingsGroup: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    SettingsInfo: ({ title, body }: { title: string; body: string }) => (
      <View>
        <Text>{title}</Text>
        <Text>{body}</Text>
      </View>
    ),
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

import { API_URL } from '@/lib/constants';
import { removeWorkspaceMember } from '../src/features/team/service';
import {
  inviteWorkspaceMember,
  resendWorkspaceInvitation,
} from '../src/features/team/administration';
import { WorkspaceAdministration } from '../src/features/team/WorkspaceAdministration';

const TOKEN = 'tok_0123456789abcdefghijklmnop';
const LINK = `${new URL('/invite', API_URL).toString()}#token=${TOKEN}`;

const invitationRow = {
  id: 'inv-1',
  email: 'ada@example.com',
  role: 'member',
  status: 'pending',
  expiresAt: '2026-12-01T00:00:00.000Z',
};

function creationBody(delivery: unknown) {
  return { invitation: invitationRow, inviteToken: TOKEN, delivery };
}

function routeReads() {
  mockGet.mockImplementation(async (path: string) =>
    path.includes('/invitations')
      ? {
          invitations: [invitationRow],
          seats: { licensedSeats: 5, seatsConsumed: 2, seatsAvailable: 3 },
        }
      : { posture: { groups: [], recommendations: [] } },
  );
}

describe('invitation delivery receipt adapter', () => {
  beforeEach(() => jest.clearAllMocks());

  it('keeps the delivery result and a manual link from the creation response', async () => {
    mockPost.mockResolvedValue(
      creationBody({ emailSent: false, reason: 'The invitation email could not be delivered.' }),
    );

    await expect(inviteWorkspaceMember('org-1', 'ada@example.com', 'member')).resolves.toEqual({
      email: 'ada@example.com',
      emailSent: false,
      reason: 'The invitation email could not be delivered.',
      link: LINK,
      replacedPreviousLink: false,
    });
  });

  it('marks a resend receipt as having replaced the previous link', async () => {
    mockPost.mockResolvedValue(creationBody({ emailSent: false, reason: 'No provider.' }));

    await expect(
      resendWorkspaceInvitation('org-1', 'inv-1', 'ada@example.com'),
    ).resolves.toMatchObject({ emailSent: false, link: LINK, replacedPreviousLink: true });
  });

  it('reports a sent email without a reason', async () => {
    mockPost.mockResolvedValue(creationBody({ emailSent: true }));

    await expect(
      inviteWorkspaceMember('org-1', 'ada@example.com', 'member'),
    ).resolves.toMatchObject({ emailSent: true, reason: null });
  });

  it('does not claim a send it cannot confirm when the delivery block is missing', async () => {
    mockPost.mockResolvedValue({ invitation: invitationRow });

    await expect(
      inviteWorkspaceMember('org-1', 'ada@example.com', 'member'),
    ).resolves.toMatchObject({ emailSent: false, reason: null, link: null });
  });
});

describe('WorkspaceAdministration invitation delivery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    routeReads();
    mockCopy.mockResolvedValue(true);
  });

  async function sendInvitation(screen: ReturnType<typeof render>) {
    fireEvent.press(await screen.findByLabelText('Invite by email'));
    fireEvent.changeText(screen.getByLabelText('Email address'), 'ada@example.com');
    fireEvent.press(screen.getByLabelText('Send invitation'));
  }

  it('says the email was not sent and offers the link when delivery failed', async () => {
    mockPost.mockResolvedValue(
      creationBody({
        emailSent: false,
        reason: 'The invitation email could not be delivered. Send this link yourself.',
      }),
    );
    const screen = render(<WorkspaceAdministration organizationId="org-1" />);

    await sendInvitation(screen);

    expect(await screen.findByText('Invitation created, email not sent')).toBeTruthy();
    expect(
      screen.getByText('The invitation email could not be delivered. Send this link yourself.'),
    ).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Copy link for ada@example.com'));
    await waitFor(() => expect(mockCopy).toHaveBeenCalledWith(LINK));
    expect(await screen.findByText('Copied')).toBeTruthy();
  });

  it('keeps the notice when the list refresh after the invitation fails', async () => {
    mockPost.mockResolvedValue(creationBody({ emailSent: false, reason: 'No provider.' }));
    const screen = render(<WorkspaceAdministration organizationId="org-1" />);
    await screen.findByLabelText('Invite by email');
    mockGet.mockRejectedValue(new Error('offline'));

    await sendInvitation(screen);

    expect(await screen.findByText('Invitation created, email not sent')).toBeTruthy();
    expect(await screen.findByText('Workspace administration could not load')).toBeTruthy();
    expect(screen.getByLabelText('Copy link for ada@example.com')).toBeTruthy();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('shows nothing extra when the email was sent', async () => {
    mockPost.mockResolvedValue(creationBody({ emailSent: true }));
    const screen = render(<WorkspaceAdministration organizationId="org-1" />);

    await sendInvitation(screen);

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockGet.mock.calls.length).toBeGreaterThan(2));
    expect(screen.queryByText('Invitation created, email not sent')).toBeNull();
  });

  it('tells the administrator a resend replaced the old link when delivery failed', async () => {
    mockPost.mockResolvedValue(
      creationBody({
        emailSent: false,
        reason: 'The previous link is now invalid; send this one instead.',
      }),
    );
    const alertSpy = jest.spyOn(Alert, 'alert');
    const screen = render(<WorkspaceAdministration organizationId="org-1" />);

    fireEvent.press(await screen.findByLabelText('ada@example.com'));
    const resend = (alertSpy.mock.calls[0]?.[2] ?? []).find(
      (button) => button.text === 'Resend invitation',
    );
    await act(async () => {
      resend?.onPress?.();
    });

    expect(await screen.findByText('Invitation renewed, email not sent')).toBeTruthy();
    expect(
      screen.getByText('The previous link is now invalid; send this one instead.'),
    ).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Copy link for ada@example.com'));
    await waitFor(() => expect(mockCopy).toHaveBeenCalledWith(LINK));
    alertSpy.mockRestore();
  });

  it('drops the link when the workspace changes', async () => {
    mockPost.mockResolvedValue(creationBody({ emailSent: false, reason: 'No provider.' }));
    const screen = render(<WorkspaceAdministration organizationId="org-1" />);
    await sendInvitation(screen);
    await screen.findByText('Invitation created, email not sent');

    screen.rerender(<WorkspaceAdministration organizationId="org-2" />);

    await waitFor(() =>
      expect(screen.queryByText('Invitation created, email not sent')).toBeNull(),
    );
    expect(screen.queryByLabelText('Copy link for ada@example.com')).toBeNull();
  });
});

describe('member removal receipt', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reports complete cleanup when the server lists no warnings', async () => {
    mockDelete.mockResolvedValue({ message: 'Member removed', warnings: [] });

    await expect(removeWorkspaceMember('org-1:user-2')).resolves.toEqual({ cleanupComplete: true });
  });

  it('reports incomplete cleanup when the server returns warnings', async () => {
    mockDelete.mockResolvedValue({
      message: 'Member removed',
      warnings: ['api key revocation failed'],
    });

    await expect(removeWorkspaceMember('org-1:user-2')).resolves.toEqual({
      cleanupComplete: false,
    });
  });
});
