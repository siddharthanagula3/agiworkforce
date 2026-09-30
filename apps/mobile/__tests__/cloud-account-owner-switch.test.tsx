import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('../lib/mmkv', () => ({
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  rehydrateWhenMmkvReady: jest.fn(),
}));

let mockClerkUser = {
  id: 'account-a',
  primaryEmailAddress: { emailAddress: 'a@example.com' },
  fullName: 'Account A',
  username: null,
  imageUrl: null,
};
jest.mock('@clerk/expo', () => ({
  useUser: () => ({ user: mockClerkUser }),
}));

const mockSignOut = jest.fn();
jest.mock('../src/features/auth/store', () => ({
  useAuthStore: (selector: (state: { signOut: typeof mockSignOut }) => unknown) =>
    selector({ signOut: mockSignOut }),
}));

const mockDeleteAccount = jest.fn();
const mockGetDeletionStatus = jest.fn();
const mockGetMe = jest.fn();
const mockPatchMe = jest.fn();
const mockCancelDeletion = jest.fn();
jest.mock('../services/api', () => ({
  api: {
    get: (path: string) =>
      path === '/api/me?surface=mobile' ? mockGetMe(path) : mockGetDeletionStatus(path),
    patch: (...args: unknown[]) => mockPatchMe(...args),
    post: (...args: unknown[]) => mockCancelDeletion(...args),
    delete: (...args: unknown[]) => mockDeleteAccount(...args),
  },
}));

const mockExportCloudUserData = jest.fn();
jest.mock('../services/cloudDataExport', () => ({
  exportCloudUserData: (...args: unknown[]) => mockExportCloudUserData(...args),
}));

const mockSyncNow = jest.fn().mockResolvedValue(undefined);
let mockSyncStatus: 'idle' | 'error' = 'idle';
jest.mock('../services/cloudSyncEngine', () => ({
  syncNow: () => mockSyncNow(),
}));
jest.mock('../stores/chat/cloudSyncStateStore', () => ({
  useCloudSyncStateStore: (selector: (state: unknown) => unknown) =>
    selector({ status: mockSyncStatus, lastSyncAt: null }),
}));

let mockAppMode: 'local' | 'cloud' = 'cloud';
const mockSetAppMode = jest.fn((mode: 'local' | 'cloud') => {
  mockAppMode = mode;
});
jest.mock('../src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: (
    selector: (state: { appMode: 'local' | 'cloud'; setAppMode: typeof mockSetAppMode }) => unknown,
  ) => selector({ appMode: mockAppMode, setAppMode: mockSetAppMode }),
}));

const mockOpenExternalUrl = jest.fn();
jest.mock('../lib/safeOpenURL', () => ({
  openExternalUrl: (...args: unknown[]) => mockOpenExternalUrl(...args),
}));

jest.mock('../src/ui/theme', () => ({
  useThemeColors: () => ({
    surfaceElevated: '#111111',
    surfaceHover: '#222222',
    border: '#333333',
    textPrimary: '#ffffff',
    textMuted: '#aaaaaa',
    accentText: '#000000',
    dangerSurface: '#220000',
    dangerBorder: '#550000',
    agentError: '#ff6666',
  }),
}));

jest.mock('../components/ui/text', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactRuntime = require('react') as typeof React;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text: NativeText } = require('react-native') as typeof import('react-native');
  return {
    Text: (props: Record<string, unknown>) => ReactRuntime.createElement(NativeText, props),
  };
});

jest.mock('../src/features/settings/common', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactRuntime = require('react') as typeof React;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable, View } = require('react-native') as typeof import('react-native');
  return {
    SettingsScreenShell: ({ children }: { children: React.ReactNode }) =>
      ReactRuntime.createElement(View, null, children),
    SettingsGroup: ({ children }: { children: React.ReactNode }) =>
      ReactRuntime.createElement(View, null, children),
    SettingsInfo: () => null,
    SettingsRow: ({ label, onPress }: { label: string; onPress?: () => void }) =>
      ReactRuntime.createElement(Pressable, {
        accessibilityRole: 'button',
        accessibilityLabel: label,
        onPress,
      }),
  };
});

jest.mock('lucide-react-native', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactRuntime = require('react') as typeof React;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native') as typeof import('react-native');
  const Icon = () => ReactRuntime.createElement(View);
  return {
    Copy: Icon,
    Check: Icon,
    Download: Icon,
    LogOut: Icon,
    Mail: Icon,
    Pencil: Icon,
    Smartphone: Icon,
    Trash2: Icon,
    Undo2: Icon,
    UserRound: Icon,
  };
});

import { router } from 'expo-router';
import CloudAccountScreen from '../src/features/settings/cloud-account';
import { useCloudProfileStore } from '../src/features/settings/cloud-account/cloudProfileStore';
import { httpErrorFrom } from '../services/apiErrors';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

function destructiveActionFor(title: string): () => void {
  const call = (Alert.alert as jest.Mock).mock.calls.findLast(
    ([alertTitle]) => alertTitle === title,
  );
  const buttons = call?.[2] as Array<{ text?: string; onPress?: () => void }> | undefined;
  const action = buttons?.find((button) => button.text === title)?.onPress;
  if (!action) throw new Error(`Missing destructive ${title} alert action`);
  return action;
}

describe('Cloud Account destructive action ownership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    __resetCloudAccountSessionForTests();
    activateCloudAccount('account-a');
    useCloudProfileStore.getState().reset();
    mockClerkUser = {
      id: 'account-a',
      primaryEmailAddress: { emailAddress: 'a@example.com' },
      fullName: 'Account A',
      username: null,
      imageUrl: null,
    };
    mockSignOut.mockResolvedValue(undefined);
    mockExportCloudUserData.mockResolvedValue(undefined);
    mockGetDeletionStatus.mockResolvedValue({
      pending: false,
      canCancel: false,
      requestedAt: null,
      scheduledFor: null,
    });
    mockGetMe.mockResolvedValue({
      id: 'account-a',
      email: 'a@example.com',
      name: 'Account A',
      profile: { display_name: 'Account A', preferred_name: null, work_description: null },
      avatar_url: null,
      created_at: null,
      updated_at: 1,
      plan: { tier: 'free', display_name: 'Free', status: 'active', current_period_end: null },
      feature_flags: { advanced_model_access: false },
      routing_preferences: {},
    });
    mockPatchMe.mockResolvedValue({});
    mockCancelDeletion.mockResolvedValue({ cancelled: true });
    mockAppMode = 'cloud';
    mockSyncStatus = 'idle';
  });

  it('shows failed Cloud sync on the account page and retries it', async () => {
    mockSyncStatus = 'error';
    render(<CloudAccountScreen />);
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.press(screen.getByLabelText('Last synced'));
    expect(mockSyncNow).toHaveBeenCalledTimes(1);
  });

  it('saves the editable display name to the Cloud profile', async () => {
    render(<CloudAccountScreen />);
    await waitFor(() => expect(screen.getByText('Account A')).toBeTruthy());

    fireEvent.press(screen.getByTestId('cloud-account-edit-name'));
    fireEvent.changeText(screen.getByTestId('cloud-account-name-input'), 'New Account Name');
    fireEvent.press(screen.getByTestId('cloud-account-save-name'));

    await waitFor(() => {
      expect(mockPatchMe).toHaveBeenCalledWith('/api/me', {
        display_name: 'New Account Name',
      });
      expect(screen.getByText('New Account Name')).toBeTruthy();
    });
  });

  it('exports the visible Cloud account before the destructive action', async () => {
    render(<CloudAccountScreen />);
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.press(screen.getByLabelText('Export Cloud Data'));

    await waitFor(() =>
      expect(mockExportCloudUserData).toHaveBeenCalledWith({
        ownerId: 'account-a',
        epoch: 1,
      }),
    );
  });

  it('requires an explicit mode switch before contacting AGI Cloud', async () => {
    mockAppMode = 'local';
    render(<CloudAccountScreen />);
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.press(screen.getByLabelText('Export Cloud Data'));

    expect(mockExportCloudUserData).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Switch to AGI Cloud',
      expect.stringContaining('does not upload your Local Mode chats or files'),
      expect.any(Array),
    );
  });

  it('prompts users to export Cloud data before account deletion', async () => {
    render(<CloudAccountScreen />);
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.press(screen.getByLabelText('Delete Account'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Delete Account',
      expect.stringContaining('Export your Cloud data above first'),
      expect.any(Array),
    );
  });

  it('does not execute account A’s retained delete confirmation as account B', async () => {
    const view = render(<CloudAccountScreen />);
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.press(screen.getByLabelText('Delete Account'));
    const deleteAccountA = destructiveActionFor('Delete Account');

    act(() => {
      activateCloudAccount('account-b');
      mockClerkUser = {
        id: 'account-b',
        primaryEmailAddress: { emailAddress: 'b@example.com' },
        fullName: 'Account B',
        username: null,
        imageUrl: null,
      };
      view.rerender(<CloudAccountScreen />);
      deleteAccountA();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockDeleteAccount).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenLastCalledWith(
      'Account changed',
      expect.stringContaining('no longer valid'),
    );
  });

  it('confirms the current email before handing account management to Web', async () => {
    render(<CloudAccountScreen />);
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.press(screen.getByLabelText('Email'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Change your email',
      'To change a@example.com, continue to AGI Workforce on the web.',
      expect.any(Array),
    );
    const call = (Alert.alert as jest.Mock).mock.calls.findLast(
      ([title]) => title === 'Change your email',
    );
    const buttons = call?.[2] as Array<{ text?: string; onPress?: () => void }>;
    buttons.find((button) => button.text === 'Continue')?.onPress?.();

    expect(mockOpenExternalUrl).toHaveBeenCalledWith('https://agiworkforce.com/settings/account');
  });

  it('does not sign out account B when account A’s deletion response resolves late', async () => {
    let resolveDeletion!: (value: { message: string }) => void;
    mockDeleteAccount.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDeletion = resolve;
      }),
    );
    const view = render(<CloudAccountScreen />);
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.press(screen.getByLabelText('Delete Account'));

    await act(async () => {
      destructiveActionFor('Delete Account')();
    });
    await waitFor(() => expect(mockDeleteAccount).toHaveBeenCalledTimes(1));

    act(() => {
      activateCloudAccount('account-b');
      mockClerkUser = {
        id: 'account-b',
        primaryEmailAddress: { emailAddress: 'b@example.com' },
        fullName: 'Account B',
        username: null,
        imageUrl: null,
      };
      view.rerender(<CloudAccountScreen />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      resolveDeletion({ message: 'Account A deletion scheduled' });
      await Promise.resolve();
    });

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenLastCalledWith(
      'Account changed',
      expect.stringContaining('No action was applied to the new account'),
    );
  });

  it('reports immediate erasure accurately when the server did not schedule deletion', async () => {
    mockDeleteAccount.mockResolvedValueOnce({ message: 'Account deleted successfully.' });
    render(<CloudAccountScreen />);
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.press(screen.getByLabelText('Delete Account'));
    await act(async () => {
      destructiveActionFor('Delete Account')();
    });

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(Alert.alert).toHaveBeenCalledWith('Account deleted', 'Account deleted successfully.');
  });

  it('shows why a paid plan blocks deletion and offers Billing', async () => {
    const refusal =
      'Cancel your pro plan before deleting your account. Nothing was deleted, and billing ' +
      'continues until you cancel in Settings > Billing. Email support@agiworkforce.com if you need help.';
    mockDeleteAccount.mockRejectedValueOnce(
      httpErrorFrom(
        409,
        JSON.stringify({
          error: refusal,
          reason: 'active_subscription',
          planTier: 'pro',
          status: 'active',
          cancelAtPeriodEnd: false,
        }),
      ),
    );
    render(<CloudAccountScreen />);
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.press(screen.getByLabelText('Delete Account'));
    await act(async () => {
      destructiveActionFor('Delete Account')();
    });

    expect(Alert.alert).toHaveBeenLastCalledWith('Could not delete account', refusal, [
      { text: 'OK', style: 'cancel' },
      { text: 'Open Billing', onPress: expect.any(Function) },
    ]);
    const buttons = (Alert.alert as jest.Mock).mock.lastCall?.[2] as Array<{
      text?: string;
      onPress?: () => void;
    }>;
    buttons.find((button) => button.text === 'Open Billing')?.onPress?.();
    expect(router.push).toHaveBeenCalledWith('/(app)/settings/cloud-billing');
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('shows why sole workspace ownership blocks deletion', async () => {
    const refusal =
      'You are the only owner of the workspace Acme. Nothing was deleted. Make someone else an ' +
      'owner in Settings > Organization, or delete the workspace there first, then delete your account.';
    mockDeleteAccount.mockRejectedValueOnce(
      httpErrorFrom(
        409,
        JSON.stringify({
          error: refusal,
          reason: 'sole_organization_owner',
          workspaces: [{ id: 'workspace-1', name: 'Acme' }],
        }),
      ),
    );
    render(<CloudAccountScreen />);
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.press(screen.getByLabelText('Delete Account'));
    await act(async () => {
      destructiveActionFor('Delete Account')();
    });

    expect(Alert.alert).toHaveBeenLastCalledWith('Could not delete account', refusal, undefined);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('lets the signed-in owner cancel a pending deletion after confirmation', async () => {
    mockGetDeletionStatus.mockResolvedValueOnce({
      pending: true,
      canCancel: true,
      requestedAt: '2026-09-27T18:00:00.000Z',
      scheduledFor: '2026-09-28T18:00:00.000Z',
    });
    render(<CloudAccountScreen />);

    await waitFor(() => expect(screen.getByLabelText('Cancel Account Deletion')).toBeTruthy());
    expect(screen.queryByLabelText('Delete Account')).toBeNull();
    fireEvent.press(screen.getByLabelText('Cancel Account Deletion'));
    expect(mockCancelDeletion).not.toHaveBeenCalled();
    const confirmation = (Alert.alert as jest.Mock).mock.calls.findLast(
      ([title]) => title === 'Cancel account deletion?',
    );
    const buttons = confirmation?.[2] as Array<{ text?: string; onPress?: () => void }>;
    await act(async () => {
      buttons.find((button) => button.text === 'Cancel deletion')?.onPress?.();
    });

    expect(mockCancelDeletion).toHaveBeenCalledWith('/api/user/delete-account/cancel');
    await waitFor(() => expect(screen.getByLabelText('Delete Account')).toBeTruthy());
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('does not offer cancellation after the grace window closes', async () => {
    mockGetDeletionStatus.mockResolvedValueOnce({
      pending: true,
      canCancel: false,
      requestedAt: '2026-09-25T18:00:00.000Z',
      scheduledFor: '2026-09-26T18:00:00.000Z',
    });
    render(<CloudAccountScreen />);

    await waitFor(() => expect(screen.getByLabelText('Cancellation window closed')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Cancellation window closed'));
    expect(Alert.alert).not.toHaveBeenCalledWith(
      'Cancel account deletion?',
      expect.anything(),
      expect.anything(),
    );
    expect(mockCancelDeletion).not.toHaveBeenCalled();
  });

  it('does not offer deletion when the server sends an inconsistent status', async () => {
    mockGetDeletionStatus.mockResolvedValueOnce({
      pending: false,
      canCancel: false,
      requestedAt: null,
      scheduledFor: '2026-09-28T18:00:00.000Z',
    });
    render(<CloudAccountScreen />);

    await waitFor(() =>
      expect(screen.getByLabelText('Could not check deletion status. Retry')).toBeTruthy(),
    );
    fireEvent.press(screen.getByLabelText('Delete Account'));

    expect(Alert.alert).not.toHaveBeenCalledWith(
      'Delete Account',
      expect.anything(),
      expect.anything(),
    );
    expect(mockDeleteAccount).not.toHaveBeenCalled();
  });
});
