import React from 'react';
import { Alert, Clipboard } from 'react-native';
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
const mockSession = { id: 'session-a', user: { id: 'account-a' }, getToken: jest.fn() };
const mockSdk = { session: mockSession as typeof mockSession | null };
jest.mock('@clerk/expo', () => ({
  useUser: () => ({ user: mockClerkUser }),
  useSession: () => ({ session: mockSdk.session }),
  getClerkInstance: () => mockSdk,
}));
jest.mock('../src/integrations/clerk', () => ({ CLERK_PUBLISHABLE_KEY: 'fixture-key' }));
jest.mock('../src/features/auth/components/StepUpModal', () => ({ StepUpModal: () => null }));

let mockFocus: (() => void) | undefined;
let mockBlur: (() => void) | undefined;
jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<ImportedModule0>('react');
    useEffect(() => {
      let cleanup: (() => void) | undefined;
      mockFocus = () => {
        const result = callback();
        cleanup = typeof result === 'function' ? result : undefined;
      };
      mockBlur = () => {
        cleanup?.();
        cleanup = undefined;
      };
      mockFocus();
      return () => {
        cleanup?.();
      };
    }, [callback]);
  },
}));

const mockSignOut = jest.fn();
jest.mock('../src/features/auth/store', () => ({
  useAuthStore: (
    selector: (state: {
      signOut: typeof mockSignOut;
      isClerkLoaded: boolean;
      isClerkSignedIn: boolean;
    }) => unknown,
  ) => selector({ signOut: mockSignOut, isClerkLoaded: true, isClerkSignedIn: true }),
}));

let mockUseRealStepUp = false;
const mockWithStepUp = jest.fn();
jest.mock('../src/features/auth/hooks/useStepUp', () => ({
  useStepUp: () =>
    mockUseRealStepUp
      ? jest.requireActual<ImportedModule1>('../src/features/auth/hooks/useStepUp').useStepUp()
      : { withStepUp: mockWithStepUp, modal: null },
}));

const mockDeleteAccount = jest.fn();
const mockGetDeletionStatus = jest.fn();
const mockGetMe = jest.fn();
const mockGetOrganization = jest.fn();
const mockPatchMe = jest.fn();
const mockCancelDeletion = jest.fn();
const mockLegacyPost = jest.fn();
const mockApiFetch = jest.fn();
jest.mock('../services/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  api: {
    get: (path: string, options?: unknown) => {
      if (path === '/api/me?surface=mobile') return mockGetMe(path);
      if (path === '/api/settings/organization') return mockGetOrganization(path);
      return mockGetDeletionStatus(path, options);
    },
    patch: (...args: unknown[]) => mockPatchMe(...args),
    post: (...args: unknown[]) => mockLegacyPost(...args),
    put: (...args: unknown[]) => mockCancelDeletion(...args),
    delete: (...args: unknown[]) => mockDeleteAccount(...args),
  },
}));

const mockExportCloudUserData = jest.fn();
const mockShareCloudDataExport = jest.fn();
jest.mock('../services/cloudDataExport', () => ({
  ...jest.requireActual('../services/cloudDataExport'),
  exportCloudUserData: (...args: unknown[]) => mockExportCloudUserData(...args),
  shareCloudDataExport: (...args: unknown[]) => mockShareCloudDataExport(...args),
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

jest.mock('../components/ui/Text', () => {
  const ReactRuntime = jest.requireActual<typeof React>('react');
  const { Text: NativeText } = jest.requireActual<ImportedModule2>('react-native');
  return {
    Text: (props: Record<string, unknown>) => ReactRuntime.createElement(NativeText, props),
  };
});

jest.mock('../src/features/settings/Common', () => {
  const ReactRuntime = jest.requireActual<typeof React>('react');

  const { Pressable, View, Text: NativeText } = jest.requireActual<ImportedModule2>('react-native');
  return {
    SettingsScreenShell: ({ children }: { children: React.ReactNode }) =>
      ReactRuntime.createElement(View, null, children),
    SettingsGroup: ({ children }: { children: React.ReactNode }) =>
      ReactRuntime.createElement(View, null, children),
    SettingsInfo: ({ body }: { body: string }) =>
      ReactRuntime.createElement(NativeText, null, body),
    SettingsRow: ({
      label,
      onPress,
      destructive,
    }: {
      label: string;
      onPress?: () => void;
      destructive?: boolean;
    }) =>
      ReactRuntime.createElement(Pressable, {
        testID: destructive ? `destructive:${label}` : undefined,
        accessibilityRole: 'button',
        accessibilityLabel: label,
        onPress,
      }),
  };
});

jest.mock('lucide-react-native', () => {
  const ReactRuntime = jest.requireActual<typeof React>('react');
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
    RefreshCw: Icon,
    Trash2: Icon,
    Undo2: Icon,
    UserRound: Icon,
  };
});

import { router } from 'expo-router';
import CloudAccountScreen from '../src/features/settings/cloud-account';
import { useCloudProfileStore } from '../src/features/settings/cloud-account/cloudProfileStore';
import { ApiHttpError, httpErrorFrom } from '../services/apiErrors';
import { ownerHandler } from '../test-utils/ownerProps';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
  captureCloudAccountEpoch,
  invalidateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

const scheduledReceipt = {
  message: 'Account deletion scheduled. Sign in to cancel before the grace window ends.',
  scheduledFor: '2026-11-06T18:00:00.000Z',
  status: 'pending',
  statusReason: 'Grace window pending',
};

function destructiveActionFor(title: string): () => void {
  const call = (Alert.alert as jest.Mock).mock.calls.findLast(
    ([alertTitle]) => alertTitle === title,
  );
  const buttons = call?.[2] as Array<{ text?: string; onPress?: () => void }> | undefined;
  const action = buttons?.find((button) => button.text === title)?.onPress;
  if (!action) throw new Error(`Missing destructive ${title} alert action`);
  return action;
}

function deletionAlert(title = 'Delete Account') {
  const call = (Alert.alert as jest.Mock).mock.calls.findLast(([value]) => value === title);
  if (!call) throw new Error(`Missing ${title} alert`);
  const buttons = call[2] as Array<{ text: string; onPress?: () => void }>;
  const confirm = buttons.find(
    (button) => button.text === (title === 'Delete Account' ? 'Delete Account' : 'Cancel deletion'),
  )?.onPress;
  if (!confirm) throw new Error('Missing confirmation callback');
  return {
    confirm,
    cancel: () => buttons[0]?.onPress?.(),
    dismiss: () => (call[3] as { onDismiss?: () => void } | undefined)?.onDismiss?.(),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const pendingDeletionStatus = {
  cancellationPrecondition: 'schedule-pair-v1',
  pending: true,
  canCancel: true,
  requestedAt: '2026-11-04T18:00:00.000Z',
  scheduledFor: '2026-11-05T18:00:00.000Z',
};

describe('Cloud Account destructive action ownership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRealStepUp = false;
    mockFocus = undefined;
    mockBlur = undefined;
    mockSession.id = 'session-a';
    mockSdk.session = mockSession;
    mockSession.getToken.mockResolvedValue('fixture-session-token');
    mockApiFetch.mockReset();
    mockCancelDeletion.mockReset();
    mockGetDeletionStatus.mockReset();
    mockDeleteAccount.mockReset().mockResolvedValue(scheduledReceipt);
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
    mockWithStepUp.mockImplementation(
      (
        _action: string,
        _resourceId: string | null,
        send: (headers: Record<string, string>) => Promise<unknown>,
      ) => send({}),
    );
    mockExportCloudUserData.mockResolvedValue(undefined);
    mockGetDeletionStatus.mockResolvedValue({
      pending: false,
      canCancel: false,
      requestedAt: null,
      scheduledFor: null,
    });
    mockGetOrganization.mockResolvedValue({ organization: null });
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
    mockCancelDeletion.mockResolvedValue({
      message: 'Account deletion cancelled.',
      cancelled: true,
    });
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

  it('explains a partial export and saves it only when asked, never as a connection retry', async () => {
    const { PartialCloudDataExportError } = jest.requireActual('../services/cloudDataExport');
    const completeness = {
      status: 'partial',
      unavailable_sections: [],
      skipped_rows: [],
      truncated_sections: [{ section: 'security_audit_logs', limit: 1000 }],
      retry: 'repeating this bounded export does not retrieve the omitted rows',
    };
    const document = { export_metadata: { completeness } };
    mockExportCloudUserData.mockRejectedValueOnce(
      new PartialCloudDataExportError(completeness, document),
    );
    mockShareCloudDataExport.mockResolvedValue(undefined);
    render(<CloudAccountScreen />);
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.press(screen.getByLabelText('Export Cloud Data'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Your export is incomplete',
        expect.stringContaining('security audit logs'),
        expect.any(Array),
      ),
    );
    expect(Alert.alert).not.toHaveBeenCalledWith('Export failed', expect.anything());
    expect(mockShareCloudDataExport).not.toHaveBeenCalled();

    const call = (Alert.alert as jest.Mock).mock.calls.findLast(
      ([title]) => title === 'Your export is incomplete',
    );
    const buttons = call?.[2] as Array<{ text: string; onPress?: () => void }>;
    expect(buttons.map((button) => button.text)).toEqual([
      'Cancel',
      'Get help',
      'Save what’s included',
    ]);
    await act(async () => {
      buttons.find((button) => button.text === 'Save what’s included')?.onPress?.();
    });

    expect(mockShareCloudDataExport).toHaveBeenCalledWith(
      { ownerId: 'account-a', epoch: 1 },
      document,
      'partial',
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
      expect.objectContaining({ onDismiss: expect.any(Function) }),
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
    expect(Alert.alert).toHaveBeenCalledTimes(1);
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
      resolveDeletion(scheduledReceipt);
      await Promise.resolve();
    });

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledTimes(1);
  });

  it.each([
    null,
    {},
    { message: 'Account deleted successfully.' },
    { ...scheduledReceipt, message: ' ' },
    { ...scheduledReceipt, scheduledFor: 'tomorrow' },
    { ...scheduledReceipt, status: 'deleted' },
    { ...scheduledReceipt, statusReason: '' },
    { ...scheduledReceipt, message: undefined },
    { ...scheduledReceipt, scheduledFor: undefined },
    { ...scheduledReceipt, status: undefined },
    { ...scheduledReceipt, statusReason: undefined },
    { ...scheduledReceipt, error: 'Refused' },
    { ...scheduledReceipt, reason: 'refused' },
    new SyntaxError('Invalid JSON'),
    new Error('Response lost'),
  ])('reconciles unconfirmed scheduling %p without signing out or replaying', async (outcome) => {
    if (outcome instanceof Error) mockDeleteAccount.mockRejectedValueOnce(outcome);
    else mockDeleteAccount.mockResolvedValueOnce(outcome);
    render(<CloudAccountScreen />);
    await waitFor(() => expect(screen.getByLabelText('Delete Account')).toBeTruthy());
    const account = captureCloudAccountEpoch();
    fireEvent.press(screen.getByLabelText('Delete Account'));
    await act(async () => {
      destructiveActionFor('Delete Account')();
    });
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Could not confirm deletion scheduling',
      expect.stringContaining('may not reflect a request still in progress'),
    );
    expect(mockGetDeletionStatus).toHaveBeenLastCalledWith('/api/user/delete-account', {
      accountEpoch: account,
    });
    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
    expect(Alert.alert).not.toHaveBeenCalledWith('Account deleted', expect.anything());
  });

  it('keeps actions unavailable when unknown scheduling cannot be reconciled', async () => {
    mockDeleteAccount.mockRejectedValueOnce(new Error('Response lost'));
    render(<CloudAccountScreen />);
    await waitFor(() => expect(screen.getByLabelText('Delete Account')).toBeTruthy());
    const account = captureCloudAccountEpoch();
    mockGetDeletionStatus.mockRejectedValueOnce(new Error('Status unavailable'));
    fireEvent.press(screen.getByLabelText('Delete Account'));
    await act(async () => {
      destructiveActionFor('Delete Account')();
    });
    expect(mockGetDeletionStatus).toHaveBeenLastCalledWith('/api/user/delete-account', {
      accountEpoch: account,
    });
    expect(screen.queryByLabelText('Delete Account')).toBeNull();
    expect(screen.queryByLabelText('Cancel Account Deletion')).toBeNull();
    expect(screen.getByLabelText('Could not check deletion status. Retry')).toBeTruthy();
    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('confirms scheduling after intentional local sign-out invalidates the original epoch', async () => {
    mockDeleteAccount.mockResolvedValueOnce({ ...scheduledReceipt, unrelated: 'allowed' });
    mockSignOut.mockImplementationOnce(async () => {
      invalidateCloudAccount();
    });
    render(<CloudAccountScreen />);
    await waitFor(() => expect(screen.getByLabelText('Delete Account')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Delete Account'));
    await act(async () => {
      destructiveActionFor('Delete Account')();
    });
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(captureCloudAccountEpoch()).toBeNull();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Account deletion scheduled',
      scheduledReceipt.message,
    );
    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
  });

  it('offers the store subscription page when a store plan keeps billing after scheduling', async () => {
    const manageUrl = 'https://apps.apple.com/account/subscriptions';
    const message =
      'Account deletion scheduled. Your Premium plan is billed by Apple, and deleting your account ' +
      `does not cancel it. Apple keeps charging you until you cancel it there: ${manageUrl}`;
    mockDeleteAccount.mockResolvedValueOnce({
      ...scheduledReceipt,
      message,
      storeBilling: { store: 'apple', manageUrl },
    });
    render(<CloudAccountScreen />);
    await waitFor(() => expect(screen.getByLabelText('Delete Account')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Delete Account'));
    await act(async () => {
      destructiveActionFor('Delete Account')();
    });

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(Alert.alert).toHaveBeenLastCalledWith('Account deletion scheduled', message, [
      { text: 'OK', style: 'cancel' },
      { text: 'Open subscriptions', onPress: expect.any(Function) },
    ]);
    const buttons = (Alert.alert as jest.Mock).mock.lastCall?.[2] as Array<{
      text?: string;
      onPress?: () => void;
    }>;
    buttons.find((button) => button.text === 'Open subscriptions')?.onPress?.();
    expect(mockOpenExternalUrl).toHaveBeenCalledWith(manageUrl);
  });

  it('shows why a paid plan blocks deletion and offers the plan view', async () => {
    const refusal =
      'A payment for your Premium plan is still being collected, so nothing was deleted. ' +
      'Delete your account once it is settled, or email support for help.';
    mockDeleteAccount.mockRejectedValueOnce(
      httpErrorFrom(
        409,
        JSON.stringify({
          error: refusal,
          reason: 'active_subscription',
          planTier: 'pro',
          status: 'past_due',
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
      { text: 'View plan', onPress: expect.any(Function) },
    ]);
    const buttons = (Alert.alert as jest.Mock).mock.lastCall?.[2] as Array<{
      text?: string;
      onPress?: () => void;
    }>;
    buttons.find((button) => button.text === 'View plan')?.onPress?.();
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

  it('marks Delete Account as destructive', async () => {
    render(<CloudAccountScreen />);
    await waitFor(() => expect(screen.getByTestId('destructive:Delete Account')).toBeTruthy());
  });

  it('copies the organization id when the account belongs to an organization', async () => {
    mockGetOrganization.mockResolvedValue({ organization: { id: 'org-1234567890' } });
    const setString = jest.spyOn(Clipboard, 'setString').mockImplementation(jest.fn());
    render(<CloudAccountScreen />);

    await waitFor(() => expect(screen.getByLabelText(/Copy Organization ID/)).toBeTruthy());
    fireEvent.press(screen.getByLabelText(/Copy Organization ID/));
    expect(setString).toHaveBeenCalledWith('org-1234567890');
  });

  it('shows no organization row for an account without an organization', async () => {
    render(<CloudAccountScreen />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockGetOrganization).toHaveBeenCalledWith('/api/settings/organization');
    expect(screen.queryByLabelText(/Copy Organization ID/)).toBeNull();
  });

  it('lets the signed-in owner cancel a pending deletion after confirmation (UNRUN)', async () => {
    mockGetDeletionStatus.mockResolvedValueOnce({
      cancellationPrecondition: 'schedule-pair-v1',
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

    expect(mockCancelDeletion).toHaveBeenCalledWith(
      '/api/user/delete-account/cancel-schedule',
      {
        expectedSchedule: {
          requestedAt: '2026-09-27T18:00:00.000Z',
          scheduledFor: '2026-09-28T18:00:00.000Z',
        },
      },
      { accountEpoch: captureCloudAccountEpoch(), auth401Recovery: 'caller-owned' },
    );
    expect(mockLegacyPost).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText('Delete Account')).toBeTruthy());
    expect(Alert.alert).toHaveBeenLastCalledWith(
      'Account deletion cancelled',
      'Your account deletion was cancelled.',
    );
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it.each([
    ['restored', 'Account deletion cancelled. Your plan renews again.'],
    [
      'not_restored',
      "Account deletion cancelled. If deleting turned off your plan's renewal, turn it back on in Settings > Billing.",
    ],
  ])(
    'says what happened to the plan renewal when undoing a deletion: %s',
    async (planRenewal, message) => {
      mockGetDeletionStatus.mockResolvedValueOnce(pendingDeletionStatus);
      mockCancelDeletion.mockResolvedValueOnce({ message, cancelled: true, planRenewal });
      render(<CloudAccountScreen />);
      await waitFor(() => expect(screen.getByLabelText('Cancel Account Deletion')).toBeTruthy());
      fireEvent.press(screen.getByLabelText('Cancel Account Deletion'));
      await act(async () => {
        deletionAlert('Cancel account deletion?').confirm();
      });

      expect(Alert.alert).toHaveBeenLastCalledWith('Account deletion cancelled', message);
    },
  );

  it.each([null, '2026-11-04T18:00:00.123456Z'])(
    'captures a frozen lossless pair with requestedAt %p (UNRUN)',
    async (requestedAt) => {
      const status = {
        ...pendingDeletionStatus,
        requestedAt,
        scheduledFor: '2026-11-05T18:00:00.654321Z',
      };
      mockGetDeletionStatus.mockResolvedValueOnce(status);
      render(<CloudAccountScreen />);
      await waitFor(() => expect(screen.getByLabelText('Cancel Account Deletion')).toBeTruthy());
      fireEvent.press(screen.getByLabelText('Cancel Account Deletion'));
      const retained = deletionAlert('Cancel account deletion?');
      status.scheduledFor = '2026-11-06T18:00:00.000000Z';
      await act(async () => {
        retained.confirm();
        retained.confirm();
      });
      const [path, body, options] = mockCancelDeletion.mock.calls[0]!;
      expect(path).toBe('/api/user/delete-account/cancel-schedule');
      expect(body).toEqual({
        expectedSchedule: { requestedAt, scheduledFor: '2026-11-05T18:00:00.654321Z' },
      });
      expect(Object.isFrozen(body)).toBe(true);
      expect(Object.isFrozen(body.expectedSchedule)).toBe(true);
      expect(options).toEqual({
        accountEpoch: captureCloudAccountEpoch(),
        auth401Recovery: 'caller-owned',
      });
      expect(mockCancelDeletion).toHaveBeenCalledTimes(1);
      expect(mockLegacyPost).not.toHaveBeenCalled();
    },
  );

  it('keeps a markerless deadline visible without inventing expiry or opening cancellation (UNRUN)', async () => {
    mockGetDeletionStatus.mockResolvedValue({
      ...pendingDeletionStatus,
      cancellationPrecondition: undefined,
    });
    render(<CloudAccountScreen />);
    await waitFor(() =>
      expect(screen.getByLabelText('Protected cancellation unavailable. Refresh')).toBeTruthy(),
    );
    expect(screen.queryByLabelText('Cancellation window closed')).toBeNull();
    expect(screen.getByText(/Cancellation deadline:/)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Protected cancellation unavailable. Refresh'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockCancelDeletion).not.toHaveBeenCalled();
    expect(mockLegacyPost).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('rejects an unknown protection marker (UNRUN)', async () => {
    mockGetDeletionStatus.mockResolvedValueOnce({
      ...pendingDeletionStatus,
      cancellationPrecondition: 'schedule-pair-v2',
    });
    render(<CloudAccountScreen />);
    await waitFor(() =>
      expect(screen.getByLabelText('Could not check deletion status. Retry')).toBeTruthy(),
    );
    expect(mockCancelDeletion).not.toHaveBeenCalled();
    expect(mockLegacyPost).not.toHaveBeenCalled();
  });

  it('requires fresh status and a new confirmation after schedule_changed (UNRUN)', async () => {
    mockGetDeletionStatus.mockResolvedValueOnce(pendingDeletionStatus);
    mockCancelDeletion.mockRejectedValueOnce(
      new ApiHttpError('Changed', 409, null, { body: { reason: 'schedule_changed' } }),
    );
    render(<CloudAccountScreen />);
    await waitFor(() => expect(screen.getByLabelText('Cancel Account Deletion')).toBeTruthy());
    const refreshed = deferred<unknown>();
    mockGetDeletionStatus.mockReturnValueOnce(refreshed.promise);
    fireEvent.press(screen.getByLabelText('Cancel Account Deletion'));
    const old = deletionAlert('Cancel account deletion?');
    await act(async () => {
      old.confirm();
    });
    expect(Alert.alert).toHaveBeenLastCalledWith(
      'Deletion schedule changed',
      expect.stringContaining('server refused'),
    );
    act(() => {
      old.confirm();
      old.cancel();
      old.dismiss();
    });
    expect(mockCancelDeletion).toHaveBeenCalledTimes(1);
    const next = { ...pendingDeletionStatus, scheduledFor: '2026-11-06T18:00:00.000001Z' };
    await act(async () => {
      refreshed.resolve(next);
    });
    act(() => {
      old.confirm();
    });
    expect(mockCancelDeletion).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByLabelText('Cancel Account Deletion'));
    await act(async () => {
      deletionAlert('Cancel account deletion?').confirm();
    });
    expect(mockCancelDeletion.mock.calls[1]?.[1]).toEqual({
      expectedSchedule: { requestedAt: next.requestedAt, scheduledFor: next.scheduledFor },
    });
    expect(mockLegacyPost).not.toHaveBeenCalled();
  });

  it('does not attribute a later absent schedule to an ambiguous cancellation (UNRUN)', async () => {
    mockGetDeletionStatus.mockResolvedValueOnce(pendingDeletionStatus);
    mockCancelDeletion.mockRejectedValueOnce(new Error('Lost response'));
    render(<CloudAccountScreen />);
    await waitFor(() => expect(screen.getByLabelText('Cancel Account Deletion')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Cancel Account Deletion'));
    const old = deletionAlert('Cancel account deletion?');
    await act(async () => {
      old.confirm();
    });
    await waitFor(() => expect(screen.getByLabelText('Delete Account')).toBeTruthy());
    expect(Alert.alert).toHaveBeenLastCalledWith(
      'Could not confirm cancellation',
      expect.stringContaining('does not prove this cancellation succeeded'),
    );
    act(() => {
      old.confirm();
    });
    expect(mockCancelDeletion).toHaveBeenCalledTimes(1);
    expect(mockLegacyPost).not.toHaveBeenCalled();
  });

  it('does not offer cancellation after the grace window closes', async () => {
    mockGetDeletionStatus.mockResolvedValueOnce({
      cancellationPrecondition: 'schedule-pair-v1',
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
      expect.anything(),
    );
    expect(mockCancelDeletion).not.toHaveBeenCalled();
  });

  it.each(['requestedAt', 'scheduledFor'] as const)(
    'blocks deletion and cancellation on invalid %s',
    async (field) => {
      mockGetDeletionStatus.mockResolvedValueOnce({
        ...pendingDeletionStatus,
        [field]: 'not-a-date',
      });
      render(<CloudAccountScreen />);
      await waitFor(() =>
        expect(screen.getByLabelText('Could not check deletion status. Retry')).toBeTruthy(),
      );
      expect(screen.queryByLabelText('Delete Account')).toBeNull();
      expect(screen.queryByLabelText('Cancel Account Deletion')).toBeNull();
      expect(mockDeleteAccount).not.toHaveBeenCalled();
      expect(mockCancelDeletion).not.toHaveBeenCalled();
    },
  );

  it('retires a retained cancellation confirmation when a refresh returns an invalid date', async () => {
    mockGetDeletionStatus.mockResolvedValueOnce(pendingDeletionStatus);
    render(<CloudAccountScreen />);
    const refresh = ownerHandler(screen.getByLabelText('Check deletion status'), 'onPress');
    await waitFor(() => expect(screen.getByLabelText('Cancel Account Deletion')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Cancel Account Deletion'));
    const old = deletionAlert('Cancel account deletion?');
    mockGetDeletionStatus.mockResolvedValueOnce({ ...pendingDeletionStatus, scheduledFor: '' });
    act(() => {
      refresh();
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Could not check deletion status. Retry')).toBeTruthy(),
    );
    await act(async () => {
      old.confirm();
    });
    expect(mockCancelDeletion).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Delete Account')).toBeNull();
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
    expect(screen.queryByLabelText('Delete Account')).toBeNull();

    expect(Alert.alert).not.toHaveBeenCalledWith(
      'Delete Account',
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(mockDeleteAccount).not.toHaveBeenCalled();
  });

  it('binds deletion requests to the account whose confirmation was accepted', async () => {
    mockDeleteAccount.mockResolvedValueOnce(scheduledReceipt);
    render(<CloudAccountScreen />);
    await waitFor(() => expect(screen.getByLabelText('Delete Account')).toBeTruthy());
    const account = captureCloudAccountEpoch();
    fireEvent.press(screen.getByLabelText('Delete Account'));
    await act(async () => {
      destructiveActionFor('Delete Account')();
    });
    expect(mockDeleteAccount).toHaveBeenCalledWith('/api/user/delete-account', {
      headers: {},
      accountEpoch: account,
    });
  });

  it.each([true, false])(
    'uses the strict cancellation receipt %s and retires older status reads',
    async (cancelled) => {
      const pending = {
        cancellationPrecondition: 'schedule-pair-v1',
        pending: true,
        canCancel: true,
        requestedAt: '2026-09-27T18:00:00.000Z',
        scheduledFor: '2026-09-28T18:00:00.000Z',
      };
      let settleCancellation!: (value: unknown) => void;
      let settleStatus!: (value: unknown) => void;
      mockGetDeletionStatus.mockResolvedValueOnce(pending);
      mockCancelDeletion.mockReturnValueOnce(
        new Promise((resolve) => {
          settleCancellation = resolve;
        }),
      );
      render(<CloudAccountScreen />);
      await waitFor(() => expect(screen.getByLabelText('Cancel Account Deletion')).toBeTruthy());
      fireEvent.press(screen.getByLabelText('Cancel Account Deletion'));
      await act(async () => {
        const buttons = (Alert.alert as jest.Mock).mock.calls.findLast(
          ([title]) => title === 'Cancel account deletion?',
        )?.[2] as Array<{ text?: string; onPress?: () => void }>;
        buttons.find((button) => button.text === 'Cancel deletion')?.onPress?.();
      });
      mockGetDeletionStatus.mockReturnValueOnce(
        new Promise((resolve) => {
          settleStatus = resolve;
        }),
      );
      fireEvent.press(screen.getByLabelText('Check deletion status'));
      await act(async () => {
        settleCancellation({ message: 'Cancellation receipt', cancelled, unrelated: true });
      });
      expect(Alert.alert).toHaveBeenLastCalledWith(
        cancelled ? 'Account deletion cancelled' : 'No account deletion pending',
        expect.any(String),
      );
      await act(async () => {
        settleStatus(pending);
      });
      expect(screen.queryByLabelText('Cancel Account Deletion')).toBeNull();
      expect(screen.getByLabelText('Delete Account')).toBeTruthy();
      expect(mockCancelDeletion).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    null,
    {},
    { cancelled: true },
    { message: '', cancelled: false },
    { message: 'receipt', cancelled: 'false' },
    { message: 'receipt', cancelled: true, error: 'refused' },
    { message: 'receipt', cancelled: false, reason: 'grace_window_expired' },
    new SyntaxError('Invalid JSON'),
    new Error('Response lost'),
  ])(
    'reconciles unknown cancellation %p without claiming deletion is still scheduled',
    async (outcome) => {
      mockGetDeletionStatus.mockResolvedValueOnce({
        cancellationPrecondition: 'schedule-pair-v1',
        pending: true,
        canCancel: true,
        requestedAt: '2026-09-27T18:00:00.000Z',
        scheduledFor: '2026-09-28T18:00:00.000Z',
      });
      if (outcome instanceof Error) mockCancelDeletion.mockRejectedValueOnce(outcome);
      else mockCancelDeletion.mockResolvedValueOnce(outcome);
      render(<CloudAccountScreen />);
      await waitFor(() => expect(screen.getByLabelText('Cancel Account Deletion')).toBeTruthy());
      const account = captureCloudAccountEpoch();
      mockGetDeletionStatus.mockRejectedValueOnce(new Error('Status unavailable'));
      fireEvent.press(screen.getByLabelText('Cancel Account Deletion'));
      await act(async () => {
        const buttons = (Alert.alert as jest.Mock).mock.calls.findLast(
          ([title]) => title === 'Cancel account deletion?',
        )?.[2] as Array<{ text?: string; onPress?: () => void }>;
        buttons.find((button) => button.text === 'Cancel deletion')?.onPress?.();
      });
      expect(Alert.alert).toHaveBeenLastCalledWith(
        'Could not confirm cancellation',
        expect.any(String),
      );
      expect(mockGetDeletionStatus).toHaveBeenLastCalledWith('/api/user/delete-account', {
        accountEpoch: account,
      });
      expect(screen.queryByLabelText('Cancel Account Deletion')).toBeNull();
      expect(screen.queryByLabelText('Delete Account')).toBeNull();
      expect(screen.getByLabelText('Could not check deletion status. Retry')).toBeTruthy();
      expect(mockCancelDeletion).toHaveBeenCalledTimes(1);
    },
  );

  it('keeps an expired-window refusal separate from a no-pending receipt', async () => {
    const pending = {
      cancellationPrecondition: 'schedule-pair-v1',
      pending: true,
      canCancel: true,
      requestedAt: '2026-11-04T18:00:00.000Z',
      scheduledFor: '2026-11-05T18:00:00.000Z',
    };
    mockGetDeletionStatus.mockResolvedValueOnce(pending);
    mockCancelDeletion.mockRejectedValueOnce(
      new ApiHttpError('The cancellation window has closed.', 409, null, {
        body: { reason: 'grace_window_expired', cancelled: false },
      }),
    );
    render(<CloudAccountScreen />);
    await waitFor(() => expect(screen.getByLabelText('Cancel Account Deletion')).toBeTruthy());
    const account = captureCloudAccountEpoch();
    mockGetDeletionStatus.mockResolvedValueOnce({ ...pending, canCancel: false });
    fireEvent.press(screen.getByLabelText('Cancel Account Deletion'));
    await act(async () => {
      const buttons = (Alert.alert as jest.Mock).mock.calls.findLast(
        ([title]) => title === 'Cancel account deletion?',
      )?.[2] as Array<{ text?: string; onPress?: () => void }>;
      buttons.find((button) => button.text === 'Cancel deletion')?.onPress?.();
    });
    expect(Alert.alert).toHaveBeenLastCalledWith(
      'Cancellation window closed',
      expect.stringContaining('does not confirm that erasure is complete'),
    );
    expect(mockGetDeletionStatus).toHaveBeenLastCalledWith('/api/user/delete-account', {
      accountEpoch: account,
    });
    expect(mockCancelDeletion).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Delete Account')).toBeNull();
  });

  it('keeps deletion disabled when a refresh finds no pending schedule during cancellation', async () => {
    mockGetDeletionStatus.mockResolvedValueOnce({
      cancellationPrecondition: 'schedule-pair-v1',
      pending: true,
      canCancel: true,
      requestedAt: '2026-09-27T18:00:00.000Z',
      scheduledFor: '2026-09-28T18:00:00.000Z',
    });
    let settleCancellation!: (value: unknown) => void;
    mockCancelDeletion.mockReturnValueOnce(
      new Promise((resolve) => {
        settleCancellation = resolve;
      }),
    );
    render(<CloudAccountScreen />);
    await waitFor(() => expect(screen.getByLabelText('Cancel Account Deletion')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Cancel Account Deletion'));
    await act(async () => {
      const buttons = (Alert.alert as jest.Mock).mock.calls.findLast(
        ([title]) => title === 'Cancel account deletion?',
      )?.[2] as Array<{ text?: string; onPress?: () => void }>;
      buttons.find((button) => button.text === 'Cancel deletion')?.onPress?.();
    });
    fireEvent.press(screen.getByLabelText('Check deletion status'));
    await waitFor(() => expect(screen.getByLabelText('Delete Account')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Delete Account'));
    expect(Alert.alert).not.toHaveBeenCalledWith(
      'Delete Account',
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(mockDeleteAccount).not.toHaveBeenCalled();
    await act(async () => {
      settleCancellation({ message: 'No account deletion pending.', cancelled: false });
    });
    fireEvent.press(screen.getByLabelText('Delete Account'));
    expect(Alert.alert).toHaveBeenCalledWith(
      'Delete Account',
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('retains the original epoch in a delayed step-up send after an account switch', async () => {
    let resume!: () => void;
    mockWithStepUp.mockImplementationOnce(
      async (
        _action: string,
        _resourceId: string | null,
        send: (headers: Record<string, string>) => Promise<unknown>,
      ) => {
        await new Promise<void>((resolve) => {
          resume = resolve;
        });
        return send({ 'x-step-up-token': 'fixture-proof' });
      },
    );
    mockDeleteAccount.mockResolvedValueOnce(scheduledReceipt);
    const view = render(<CloudAccountScreen />);
    await waitFor(() => expect(screen.getByLabelText('Delete Account')).toBeTruthy());
    const originalAccount = captureCloudAccountEpoch();
    fireEvent.press(screen.getByLabelText('Delete Account'));
    await act(async () => {
      destructiveActionFor('Delete Account')();
    });
    act(() => {
      activateCloudAccount('account-b');
      mockClerkUser = { ...mockClerkUser, id: 'account-b' };
      view.rerender(<CloudAccountScreen />);
    });
    await act(async () => {
      resume();
    });
    expect(mockDeleteAccount).toHaveBeenCalledWith('/api/user/delete-account', {
      headers: { 'x-step-up-token': 'fixture-proof' },
      accountEpoch: originalAccount,
    });
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('consumes a saved scheduling confirmation once before rerender and after settlement', async () => {
    const pending = deferred<unknown>();
    mockDeleteAccount.mockReturnValueOnce(pending.promise);
    render(<CloudAccountScreen />);
    await waitFor(() => expect(screen.getByLabelText('Delete Account')).toBeTruthy());
    const open = ownerHandler(screen.getByLabelText('Delete Account'), 'onPress');
    act(() => {
      open();
      open();
    });
    expect(
      (Alert.alert as jest.Mock).mock.calls.filter(([title]) => title === 'Delete Account'),
    ).toHaveLength(1);
    const retained = deletionAlert();
    act(() => {
      retained.confirm();
      retained.confirm();
      retained.dismiss();
      retained.cancel();
    });
    expect(mockWithStepUp).toHaveBeenCalledTimes(1);
    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve(scheduledReceipt);
    });
    act(() => {
      retained.confirm();
    });
    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
  });

  it.each(['cancel', 'dismiss'] as const)(
    'retires %s confirmation A without letting its callbacks release B',
    async (retire) => {
      render(<CloudAccountScreen />);
      await waitFor(() => expect(screen.getByLabelText('Delete Account')).toBeTruthy());
      fireEvent.press(screen.getByLabelText('Delete Account'));
      const old = deletionAlert();
      act(() => {
        old[retire]();
      });
      fireEvent.press(screen.getByLabelText('Delete Account'));
      const current = deletionAlert();
      act(() => {
        old.confirm();
        old.cancel();
        old.dismiss();
      });
      expect(mockWithStepUp).not.toHaveBeenCalled();
      await act(async () => {
        current.confirm();
      });
      expect(mockWithStepUp).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ['schedule', 'session object'],
    ['schedule', 'session id'],
    ['cancel', 'session object'],
    ['cancel', 'session id'],
  ] as const)(
    'rejects saved %s after same-owner %s replacement and permits a fresh prompt',
    async (action, replacement) => {
      if (action === 'cancel') mockGetDeletionStatus.mockResolvedValue(pendingDeletionStatus);
      const label = action === 'schedule' ? 'Delete Account' : 'Cancel Account Deletion';
      const title = action === 'schedule' ? 'Delete Account' : 'Cancel account deletion?';
      const request = action === 'schedule' ? mockDeleteAccount : mockCancelDeletion;
      render(<CloudAccountScreen />);
      await waitFor(() => expect(screen.getByLabelText(label)).toBeTruthy());
      const account = captureCloudAccountEpoch();
      fireEvent.press(screen.getByLabelText(label));
      const old = deletionAlert(title);
      if (replacement === 'session id') {
        mockSession.id = 'session-b';
        expect(mockSdk.session).toBe(mockSession);
        expect(mockSdk.session?.id).toBe('session-b');
      } else {
        mockSdk.session = { ...mockSession };
        expect(mockSdk.session).not.toBe(mockSession);
        expect(mockSdk.session.id).toBe(mockSession.id);
      }
      act(() => {
        old.confirm();
      });
      expect(captureCloudAccountEpoch()).toEqual(account);
      expect(request).not.toHaveBeenCalled();
      fireEvent.press(screen.getByLabelText(label));
      const current = deletionAlert(title);
      act(() => {
        old.cancel();
        old.dismiss();
        old.confirm();
      });
      await act(async () => {
        current.confirm();
      });
      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['schedule', 'cancel'] as const)(
    'retires %s confirmations on blur/refocus and unmount/remount with the same identity',
    async (action) => {
      if (action === 'cancel') mockGetDeletionStatus.mockResolvedValue(pendingDeletionStatus);
      const label = action === 'schedule' ? 'Delete Account' : 'Cancel Account Deletion';
      const title = action === 'schedule' ? 'Delete Account' : 'Cancel account deletion?';
      const request = action === 'schedule' ? mockDeleteAccount : mockCancelDeletion;
      const view = render(<CloudAccountScreen />);
      await waitFor(() => expect(screen.getByLabelText(label)).toBeTruthy());
      fireEvent.press(screen.getByLabelText(label));
      const beforeBlur = deletionAlert(title);
      act(() => {
        mockBlur?.();
        beforeBlur.confirm();
        mockFocus?.();
      });
      await waitFor(() => expect(screen.getByLabelText(label)).toBeTruthy());
      fireEvent.press(screen.getByLabelText(label));
      const beforeUnmount = deletionAlert(title);
      view.unmount();
      render(<CloudAccountScreen />);
      await waitFor(() => expect(screen.getByLabelText(label)).toBeTruthy());
      fireEvent.press(screen.getByLabelText(label));
      const current = deletionAlert(title);
      act(() => {
        beforeBlur.confirm();
        beforeUnmount.confirm();
        beforeUnmount.dismiss();
      });
      expect(request).not.toHaveBeenCalled();
      await act(async () => {
        current.confirm();
      });
      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  it('invalidates a cancellation confirmation when its ready schedule is refreshed', async () => {
    mockGetDeletionStatus.mockResolvedValueOnce(pendingDeletionStatus);
    render(<CloudAccountScreen />);
    const refresh = ownerHandler(screen.getByLabelText('Check deletion status'), 'onPress');
    await waitFor(() => expect(screen.getByLabelText('Cancel Account Deletion')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Cancel Account Deletion'));
    const old = deletionAlert('Cancel account deletion?');
    mockGetDeletionStatus.mockResolvedValueOnce({
      ...pendingDeletionStatus,
      scheduledFor: '2026-11-07T18:00:00.000Z',
    });
    act(() => {
      refresh();
    });
    act(() => {
      old.confirm();
    });
    await waitFor(() => expect(screen.getByLabelText('Cancel Account Deletion')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Cancel Account Deletion'));
    const current = deletionAlert('Cancel account deletion?');
    act(() => {
      old.confirm();
      old.cancel();
      old.dismiss();
    });
    expect(mockCancelDeletion).not.toHaveBeenCalled();
    await act(async () => {
      current.confirm();
      current.confirm();
      current.dismiss();
    });
    act(() => {
      current.confirm();
    });
    expect(mockCancelDeletion).toHaveBeenCalledTimes(1);
  });

  it('holds a running cancellation reservation while an unknown result is reconciled', async () => {
    mockGetDeletionStatus.mockResolvedValueOnce(pendingDeletionStatus);
    mockCancelDeletion.mockRejectedValueOnce(new Error('Response lost'));
    render(<CloudAccountScreen />);
    await waitFor(() => expect(screen.getByLabelText('Cancel Account Deletion')).toBeTruthy());
    const status = deferred<unknown>();
    mockGetDeletionStatus.mockReturnValueOnce(status.promise);
    fireEvent.press(screen.getByLabelText('Cancel Account Deletion'));
    const retained = deletionAlert('Cancel account deletion?');
    await act(async () => {
      retained.confirm();
    });
    act(() => {
      retained.confirm();
      retained.cancel();
      retained.dismiss();
    });
    expect(mockCancelDeletion).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Delete Account')).toBeNull();
    await act(async () => {
      status.reject(new Error('Status unavailable'));
    });
    expect(screen.getByLabelText('Could not check deletion status. Retry')).toBeTruthy();
    act(() => {
      retained.confirm();
    });
    expect(mockCancelDeletion).toHaveBeenCalledTimes(1);
  });

  it('does not admit cancellation while scheduling owns the reservation', async () => {
    const pending = deferred<unknown>();
    mockDeleteAccount.mockReturnValueOnce(pending.promise);
    render(<CloudAccountScreen />);
    const refresh = ownerHandler(screen.getByLabelText('Check deletion status'), 'onPress');
    await waitFor(() => expect(screen.getByLabelText('Delete Account')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Delete Account'));
    act(() => {
      deletionAlert().confirm();
    });
    mockGetDeletionStatus.mockResolvedValueOnce(pendingDeletionStatus);
    act(() => {
      refresh();
    });
    await waitFor(() => expect(screen.getByLabelText('Cancel Account Deletion')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Cancel Account Deletion'));
    expect(
      (Alert.alert as jest.Mock).mock.calls.some(([title]) => title === 'Cancel account deletion?'),
    ).toBe(false);
    await act(async () => {
      pending.resolve(scheduledReceipt);
    });
    expect(mockCancelDeletion).not.toHaveBeenCalled();
  });

  it('does not strand cancellation or let old finally release a new same-owner lifetime', async () => {
    const oldRequest = deferred<unknown>();
    const newRequest = deferred<unknown>();
    mockGetDeletionStatus.mockResolvedValue(pendingDeletionStatus);
    mockCancelDeletion
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise);
    render(<CloudAccountScreen />);
    await waitFor(() => expect(screen.getByLabelText('Cancel Account Deletion')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Cancel Account Deletion'));
    const old = deletionAlert('Cancel account deletion?');
    act(() => {
      old.confirm();
      invalidateCloudAccount();
      activateCloudAccount('account-a');
    });
    await waitFor(() => expect(screen.getByLabelText('Cancel Account Deletion')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Cancel Account Deletion'));
    const current = deletionAlert('Cancel account deletion?');
    act(() => {
      current.confirm();
    });
    const alerts = (Alert.alert as jest.Mock).mock.calls.length;
    await act(async () => {
      oldRequest.resolve({ message: 'Cancelled', cancelled: true });
    });
    act(() => {
      old.confirm();
      old.cancel();
      current.confirm();
    });
    expect(mockCancelDeletion).toHaveBeenCalledTimes(2);
    expect((Alert.alert as jest.Mock).mock.calls).toHaveLength(alerts);
    expect(screen.queryByLabelText('Delete Account')).toBeNull();
    await act(async () => {
      newRequest.resolve({ message: 'Cancelled', cancelled: true });
    });
    expect(screen.getByLabelText('Delete Account')).toBeTruthy();
  });

  it('suppresses obsolete scheduling effects after a same-user SDK session change', async () => {
    const pending = deferred<unknown>();
    mockDeleteAccount.mockReturnValueOnce(pending.promise);
    render(<CloudAccountScreen />);
    await waitFor(() => expect(screen.getByLabelText('Delete Account')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Delete Account'));
    act(() => {
      deletionAlert().confirm();
    });
    mockSdk.session = { ...mockSession, id: 'session-b' };
    await act(async () => {
      pending.resolve(scheduledReceipt);
    });
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalledWith('Account deletion scheduled', expect.anything());
  });

  it('retires an account A confirmation across A to B to A without releasing the replacement', async () => {
    render(<CloudAccountScreen />);
    await waitFor(() => expect(screen.getByLabelText('Delete Account')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Delete Account'));
    const old = deletionAlert();
    act(() => {
      activateCloudAccount('account-b');
      activateCloudAccount('account-a');
    });
    await waitFor(() => expect(screen.getByLabelText('Delete Account')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Delete Account'));
    const current = deletionAlert();
    act(() => {
      old.confirm();
      old.cancel();
      old.dismiss();
    });
    expect(mockDeleteAccount).not.toHaveBeenCalled();
    await act(async () => {
      current.confirm();
    });
    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
  });

  it('keeps scheduling admission consumed while its unknown outcome status read is pending', async () => {
    mockDeleteAccount.mockRejectedValueOnce(new Error('Response lost'));
    render(<CloudAccountScreen />);
    await waitFor(() => expect(screen.getByLabelText('Delete Account')).toBeTruthy());
    const status = deferred<unknown>();
    mockGetDeletionStatus.mockReturnValueOnce(status.promise);
    fireEvent.press(screen.getByLabelText('Delete Account'));
    const retained = deletionAlert();
    await act(async () => {
      retained.confirm();
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      'Could not confirm deletion scheduling',
      expect.stringContaining('outcome is unknown'),
    );
    act(() => {
      retained.confirm();
      retained.cancel();
      retained.dismiss();
    });
    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Delete Account')).toBeNull();
    await act(async () => {
      status.resolve({ pending: false, canCancel: false, requestedAt: null, scheduledFor: null });
    });
    act(() => {
      retained.confirm();
    });
    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByLabelText('Delete Account'));
    await act(async () => {
      deletionAlert().confirm();
    });
    expect(mockDeleteAccount).toHaveBeenCalledTimes(2);
  });

  it('allows already-admitted real-hook proof work after blur without obsolete scheduling UI or sign-out', async () => {
    mockUseRealStepUp = true;
    const grant = deferred<{ ok: boolean; status: number; text: () => Promise<string> }>();
    mockApiFetch.mockReturnValueOnce(grant.promise);
    mockDeleteAccount
      .mockRejectedValueOnce(new ApiHttpError('Step up required', 403, 'STEP_UP_REQUIRED'))
      .mockResolvedValueOnce(scheduledReceipt);
    render(<CloudAccountScreen />);
    await waitFor(() => expect(screen.getByLabelText('Delete Account')).toBeTruthy());
    const original = captureCloudAccountEpoch();
    fireEvent.press(screen.getByLabelText('Delete Account'));
    const retained = deletionAlert();
    await act(async () => {
      retained.confirm();
    });
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    act(() => {
      mockBlur?.();
      retained.confirm();
    });
    await act(async () => {
      grant.resolve({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ token: 'fixture-proof' }),
      });
    });
    expect(mockDeleteAccount).toHaveBeenCalledTimes(2);
    expect(mockDeleteAccount).toHaveBeenLastCalledWith('/api/user/delete-account', {
      headers: { 'x-step-up-token': 'fixture-proof' },
      accountEpoch: original,
    });
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalledWith('Account deletion scheduled', expect.anything());
  });

  it('does not let a saved row adopt a replaced ready status snapshot', async () => {
    render(<CloudAccountScreen />);
    const refresh = ownerHandler(screen.getByLabelText('Check deletion status'), 'onPress');
    await waitFor(() => expect(screen.getByLabelText('Delete Account')).toBeTruthy());
    const oldOpen = ownerHandler(screen.getByLabelText('Delete Account'), 'onPress');
    act(() => {
      oldOpen();
      deletionAlert().cancel();
      refresh();
    });
    await waitFor(() => expect(screen.getByLabelText('Delete Account')).toBeTruthy());
    const alerts = (Alert.alert as jest.Mock).mock.calls.length;
    act(() => {
      oldOpen();
    });
    expect((Alert.alert as jest.Mock).mock.calls).toHaveLength(alerts);
    fireEvent.press(screen.getByLabelText('Delete Account'));
    await act(async () => {
      deletionAlert().confirm();
    });
    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
  });

  it('does not let an old focus refresh or row release or adopt a new confirmation', async () => {
    render(<CloudAccountScreen />);
    const oldRefresh = ownerHandler(screen.getByLabelText('Check deletion status'), 'onPress');
    await waitFor(() => expect(screen.getByLabelText('Delete Account')).toBeTruthy());
    const oldOpen = ownerHandler(screen.getByLabelText('Delete Account'), 'onPress');
    act(() => {
      mockBlur?.();
      mockFocus?.();
    });
    await waitFor(() => expect(screen.getByLabelText('Delete Account')).toBeTruthy());
    const reads = mockGetDeletionStatus.mock.calls.length;
    act(() => {
      oldOpen();
    });
    expect(Alert.alert).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Delete Account'));
    const current = deletionAlert();
    act(() => {
      oldRefresh();
    });
    expect(mockGetDeletionStatus).toHaveBeenCalledTimes(reads);
    await act(async () => {
      current.confirm();
    });
    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
  });

  it('preserves an admitted real-hook proof replay with the original epoch', async () => {
    mockUseRealStepUp = true;
    mockDeleteAccount
      .mockRejectedValueOnce(new ApiHttpError('Step up required', 403, 'STEP_UP_REQUIRED'))
      .mockResolvedValueOnce(scheduledReceipt);
    mockApiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ token: 'fixture-proof' }),
    });
    render(<CloudAccountScreen />);
    await waitFor(() => expect(screen.getByLabelText('Delete Account')).toBeTruthy());
    const original = captureCloudAccountEpoch();
    fireEvent.press(screen.getByLabelText('Delete Account'));
    const retained = deletionAlert();
    await act(async () => {
      retained.confirm();
      retained.confirm();
    });
    await waitFor(() => expect(mockDeleteAccount).toHaveBeenCalledTimes(2));
    expect(mockDeleteAccount).toHaveBeenNthCalledWith(1, '/api/user/delete-account', {
      headers: {},
      accountEpoch: original,
    });
    expect(mockDeleteAccount).toHaveBeenNthCalledWith(2, '/api/user/delete-account', {
      headers: { 'x-step-up-token': 'fixture-proof' },
      accountEpoch: original,
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockSession.getToken).toHaveBeenCalledTimes(1);
    act(() => {
      retained.confirm();
    });
    expect(mockDeleteAccount).toHaveBeenCalledTimes(2);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});

type ImportedModule0 = typeof import('react');
type ImportedModule1 = typeof import('../src/features/auth/hooks/useStepUp');
type ImportedModule2 = typeof import('react-native');
