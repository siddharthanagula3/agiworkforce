/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockSetActiveWorkspace = jest.fn();
const mockLoadConversations = jest.fn();
const overview = {
  workspace: null,
  access: { plan: 'free', canManageTeam: false, maxMembers: null },
  activeWorkspaceId: null as string | null,
  workspaces: [
    { id: 'ws-acme', name: 'Acme Research', slug: 'acme', role: 'admin' },
    { id: 'ws-globex', name: 'Globex', slug: 'globex', role: 'member' },
  ],
};

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
    selector({ isClerkLoaded: true, isClerkSignedIn: true }),
}));

jest.mock('@/src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ appMode: 'cloud', setAppMode: jest.fn() }),
}));

jest.mock('@/src/features/settings/common', () => ({
  CloudAccountRequired: () => null,
  CloudSyncBlockedBanner: () => null,
}));

jest.mock('@/stores/chatStore', () => ({
  useChatStore: { getState: () => ({ loadConversations: mockLoadConversations }) },
}));

jest.mock('@/src/features/team', () => ({
  WORKSPACE_ROLES: ['owner', 'admin', 'member', 'viewer'],
  addWorkspaceMember: jest.fn(),
  fetchWorkspaceMembers: jest.fn(async () => []),
  fetchWorkspaceOverview: jest.fn(async () => overview),
  removeWorkspaceMember: jest.fn(),
  setActiveWorkspace: (...args: unknown[]) => mockSetActiveWorkspace(...args),
  updateWorkspaceMemberRole: jest.fn(),
}));

import WorkspaceScreen from '@/app/(app)/settings/workspace';

describe('mobile workspace switcher (UI-86)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    overview.activeWorkspaceId = null;
    mockSetActiveWorkspace.mockResolvedValue(undefined);
    mockLoadConversations.mockResolvedValue(undefined);
  });

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

  it('does not re-send the workspace that is already active', async () => {
    overview.activeWorkspaceId = 'ws-acme';
    const screen = render(<WorkspaceScreen />);

    fireEvent.press(await screen.findByLabelText('Switch to Acme Research'));

    await waitFor(() => expect(mockSetActiveWorkspace).not.toHaveBeenCalled());
  });
});
