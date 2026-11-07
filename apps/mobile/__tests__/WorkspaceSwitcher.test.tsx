/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

let mockEpoch = 1;
const mockEpochListeners = new Set<() => void>();
const mockFetchOverview = jest.fn();
const mockFetchMembers = jest.fn();
const mockSetActiveWorkspace = jest.fn();
const mockLoadConversations = jest.fn();
const mockTransferOwnership = jest.fn();
const mockWithStepUp = jest.fn();
let mockRolePickerProps: {
  member: { id: string; userId: string; name: string } | null;
  ownershipConsequence: string | null;
  onChoose: (member: unknown, role: string) => void;
} | null = null;
const overview = {
  workspace: null,
  access: { plan: 'free', canManageTeam: false, maxMembers: null },
  activeWorkspaceId: null as string | null,
  workspaces: [
    { id: 'ws-acme', name: 'Acme Research', slug: 'acme', role: 'admin' },
    { id: 'ws-globex', name: 'Globex', slug: 'globex', role: 'member' },
  ],
};

jest.mock('@/src/features/auth/hooks/useStepUp', () => ({
  useStepUp: () => ({ withStepUp: mockWithStepUp, modal: null }),
}));
jest.mock('@/src/features/team/WorkspaceAdministration', () => ({
  WorkspaceAdministration: () => null,
}));
jest.mock('@/src/features/team/RolePickerModal', () => ({
  RolePickerModal: (props: typeof mockRolePickerProps) => {
    mockRolePickerProps = props;
    return null;
  },
}));

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  return new Proxy(
    {},
    {
      get: (_target, name: string) => {
        if (name === '__esModule') return true;
        return (props: Record<string, unknown>) => <RN.View testID={`icon-${name}`} {...props} />;
      },
    },
  );
});

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('react-native-safe-area-context', () => {
  const RN = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }: Record<string, unknown>) => (
      <RN.View {...props}>{children as React.ReactNode}</RN.View>
    ),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('@/lib/safeOpenURL', () => ({ openExternalUrl: jest.fn() }));

jest.mock('@/src/features/auth/store', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: 'account-a' }),
}));

jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: () => ({ ownerId: 'account-a', epoch: mockEpoch }),
  isCloudAccountEpochCurrent: (account: { ownerId: string; epoch: number } | null) =>
    Boolean(account && account.ownerId === 'account-a' && account.epoch === mockEpoch),
  subscribeCloudAccountEpochChange: (listener: () => void) => {
    mockEpochListeners.add(listener);
    return () => mockEpochListeners.delete(listener);
  },
}));

jest.mock('@/src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ appMode: 'cloud', setAppMode: jest.fn() }),
}));

jest.mock('@/src/features/settings/Common', () => ({
  CloudAccountRequired: () => null,
  CloudSyncBlockedBanner: () => null,
}));

jest.mock('@/stores/chatStore', () => ({
  useChatStore: { getState: () => ({ loadConversations: mockLoadConversations }) },
}));

jest.mock('@/src/features/team', () => ({
  WORKSPACE_ROLES: ['owner', 'admin', 'member', 'viewer'],
  addWorkspaceMember: jest.fn(),
  fetchWorkspaceMembers: (...args: unknown[]) => mockFetchMembers(...args),
  fetchWorkspaceOverview: (...args: unknown[]) => mockFetchOverview(...args),
  removeWorkspaceMember: jest.fn(),
  setActiveWorkspace: (...args: unknown[]) => mockSetActiveWorkspace(...args),
  updateWorkspaceMemberRole: jest.fn(),
  transferWorkspaceOwnership: (...args: unknown[]) => mockTransferOwnership(...args),
}));

import WorkspaceScreen from '@/app/(app)/settings/workspace';

describe('mobile workspace switcher (UI-86)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEpoch = 1;
    mockEpochListeners.clear();
    mockRolePickerProps = null;
    mockWithStepUp.mockImplementation(async (_action, _resource, send) => send({}));
    mockTransferOwnership.mockResolvedValue(undefined);
    mockFetchOverview.mockResolvedValue(overview);
    mockFetchMembers.mockResolvedValue([]);
    overview.activeWorkspaceId = null;
    mockSetActiveWorkspace.mockResolvedValue(undefined);
    mockLoadConversations.mockResolvedValue(undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('offers Personal and every workspace membership, marking the active one', async () => {
    const screen = render(<WorkspaceScreen />);

    const personal = await screen.findByLabelText('Switch to Personal');
    expect(personal.props.accessibilityState.checked).toBe(true);
    const acme = await screen.findByLabelText('Switch to Acme Research');
    expect(acme.props.accessibilityState.checked).toBe(false);
    expect(await screen.findByLabelText('Switch to Globex')).toBeTruthy();
  });

  it('persists the chosen workspace and reloads conversations', async () => {
    const screen = render(<WorkspaceScreen />);

    fireEvent.press(await screen.findByLabelText('Switch to Acme Research'));

    await waitFor(() => expect(mockSetActiveWorkspace).toHaveBeenCalledWith('ws-acme'));
    await waitFor(() => expect(mockLoadConversations).toHaveBeenCalled());
  });

  it('does not report a failed switch after the workspace changed but chats failed to refresh', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockSetActiveWorkspace.mockImplementation(async () => {
      overview.activeWorkspaceId = 'ws-acme';
    });
    mockLoadConversations.mockRejectedValue(new Error('private chat history route'));
    const screen = render(<WorkspaceScreen />);

    fireEvent.press(await screen.findByLabelText('Switch to Acme Research'));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('Workspace changed', expect.any(String)),
    );
    expect(alertSpy.mock.calls[0]?.[1]).toBe('Refresh your chats to see this workspace’s history.');
    expect(alertSpy).not.toHaveBeenCalledWith('Could not switch workspace', expect.any(String));
  });

  it('does not re-send the workspace that is already active', async () => {
    overview.activeWorkspaceId = 'ws-acme';
    const screen = render(<WorkspaceScreen />);

    fireEvent.press(await screen.findByLabelText('Switch to Acme Research'));

    await waitFor(() => expect(mockSetActiveWorkspace).not.toHaveBeenCalled());
  });
  it('does not start an old overview member read after account replacement', async () => {
    let finish!: (value: unknown) => void;
    mockFetchOverview.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(<WorkspaceScreen />);
    await waitFor(() => expect(mockFetchOverview).toHaveBeenCalledTimes(1));
    await act(async () => {
      mockEpoch += 2;
      mockEpochListeners.forEach((listener) => listener());
      finish({ ...overview, workspace: { id: 'obsolete-workspace' } });
    });
    expect(mockFetchMembers).not.toHaveBeenCalled();
    expect(mockFetchOverview.mock.calls[0]?.[1]).toEqual({ ownerId: 'account-a', epoch: 1 });
  });

  it('rejects a captured ownership choice after its account changes', async () => {
    const member = {
      id: 'membership-b',
      userId: 'successor-b',
      name: 'Successor',
      email: '',
      role: 'admin',
      isCurrentUser: false,
    };
    mockFetchOverview.mockResolvedValue({
      ...overview,
      access: { ...overview.access, canManageTeam: true },
      workspace: {
        id: 'ws-acme',
        name: 'Acme Research',
        currentUserRole: 'owner',
        memberCount: 2,
        maxMembers: null,
        plan: 'free',
      },
    });
    mockFetchMembers.mockResolvedValue([member]);
    const screen = render(<WorkspaceScreen />);
    fireEvent.press(await screen.findByLabelText('Change role for Successor'));
    const intent = mockRolePickerProps!;
    expect(intent.ownershipConsequence).toContain('Acme Research');
    await act(async () => {
      mockEpoch += 2;
      mockEpochListeners.forEach((listener) => listener());
      intent.onChoose(member, 'owner');
    });
    expect(mockTransferOwnership).not.toHaveBeenCalled();
    expect(mockWithStepUp).not.toHaveBeenCalled();
  });

  it('keeps the transfer target and original epoch through step-up sends', async () => {
    const member = {
      id: 'membership-b',
      userId: 'successor-b',
      name: 'Successor',
      email: '',
      role: 'admin',
      isCurrentUser: false,
    };
    mockFetchOverview.mockResolvedValue({
      ...overview,
      access: { ...overview.access, canManageTeam: true },
      workspace: {
        id: 'ws-acme',
        name: 'Acme Research',
        currentUserRole: 'owner',
        memberCount: 2,
        maxMembers: null,
        plan: 'free',
      },
    });
    mockFetchMembers.mockResolvedValue([member]);
    const challenge = new Error('fixture step-up required');
    mockTransferOwnership.mockRejectedValueOnce(challenge);
    mockWithStepUp.mockImplementation(async (_action, _resource, send) => {
      try {
        return await send({});
      } catch (error) {
        if (error !== challenge) throw error;
      }
      return send({ 'x-step-up-token': 'fixture-grant' });
    });
    const screen = render(<WorkspaceScreen />);
    fireEvent.press(await screen.findByLabelText('Change role for Successor'));
    await act(async () => mockRolePickerProps!.onChoose(member, 'owner'));
    expect(mockTransferOwnership).toHaveBeenNthCalledWith(
      1,
      'ws-acme',
      'successor-b',
      {},
      { ownerId: 'account-a', epoch: 1 },
    );
    expect(mockTransferOwnership).toHaveBeenNthCalledWith(
      2,
      'ws-acme',
      'successor-b',
      { 'x-step-up-token': 'fixture-grant' },
      { ownerId: 'account-a', epoch: 1 },
    );
  });

  it('refuses ownership resend after an epoch change during step-up', async () => {
    const member = {
      id: 'membership-b',
      userId: 'successor-b',
      name: 'Successor',
      email: '',
      role: 'admin',
      isCurrentUser: false,
    };
    mockFetchOverview.mockResolvedValue({
      ...overview,
      access: { ...overview.access, canManageTeam: true },
      workspace: {
        id: 'ws-acme',
        name: 'Acme Research',
        currentUserRole: 'owner',
        memberCount: 2,
        maxMembers: null,
        plan: 'free',
      },
    });
    mockFetchMembers.mockResolvedValue([member]);
    let resume!: () => void;
    const gate = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const challenge = new Error('fixture step-up required');
    mockTransferOwnership.mockRejectedValueOnce(challenge);
    mockWithStepUp.mockImplementation(async (_action, _resource, send) => {
      try {
        return await send({});
      } catch (error) {
        if (error !== challenge) throw error;
      }
      await gate;
      return send({ 'x-step-up-token': 'fixture-grant' });
    });
    const screen = render(<WorkspaceScreen />);
    fireEvent.press(await screen.findByLabelText('Change role for Successor'));
    await act(async () => mockRolePickerProps!.onChoose(member, 'owner'));
    expect(mockTransferOwnership).toHaveBeenCalledTimes(1);
    await act(async () => {
      mockEpoch += 2;
      mockEpochListeners.forEach((listener) => listener());
      resume();
      await gate;
    });
    expect(mockTransferOwnership).toHaveBeenCalledTimes(1);
  });
});
