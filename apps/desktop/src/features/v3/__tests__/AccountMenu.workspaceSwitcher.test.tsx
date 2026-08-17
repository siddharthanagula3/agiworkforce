import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  openSettings: vi.fn(),
  setMode: vi.fn(),
  signOut: vi.fn(),
  loadConversations: vi.fn(),
  getCloudOrganizationOverview: vi.fn(),
  setActiveCloudWorkspace: vi.fn(),
  appMode: 'cloud',
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        'accountMenu.accountFallback': 'Account',
        'accountMenu.workspace': 'Workspace',
        'accountMenu.workspacePersonal': 'Personal',
        'accountMenu.workspaceLoading': 'Loading workspaces…',
        'accountMenu.workspaceRetry': 'Try loading workspaces again',
        'accountMenu.workspaceManage': 'Manage workspaces',
        'accountMenu.workspaceSelected': 'Selected',
      };
      return labels[key] ?? key;
    },
  }),
}));

vi.mock('../../../stores/auth', () => ({
  useUnifiedAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      user: { id: 'user-1', name: 'Ada', email: 'ada@example.com' },
      planDisplayName: 'Pro',
      signOut: mocks.signOut,
    }),
}));

vi.mock('../../../stores/settingsDialogStore', () => ({
  useSettingsDialogStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ openSettings: mocks.openSettings }),
}));

vi.mock('../../../stores/appModeStore', () => ({
  useAppModeStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ mode: mocks.appMode, setMode: mocks.setMode }),
}));

vi.mock('../../../stores/chat/chatStore', () => ({
  resolveDesktopChatOwnerId: () => 'user-1',
  useChatStore: { getState: () => ({ loadConversations: mocks.loadConversations }) },
}));

vi.mock('../../../api/cloudAccountSettings', () => ({
  getCloudOrganizationOverview: mocks.getCloudOrganizationOverview,
  setActiveCloudWorkspace: mocks.setActiveCloudWorkspace,
}));

import { AccountMenu } from '../AccountMenu';

const OVERVIEW = {
  organization: null,
  canManageTeam: true,
  activeOrganizationId: null as string | null,
  workspaces: [
    { id: 'ws-acme', name: 'Acme Research', slug: 'acme', role: 'admin' as const },
    { id: 'ws-globex', name: 'Globex', slug: 'globex', role: 'member' as const },
  ],
};

describe('AccountMenu workspace switcher (UI-86)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.appMode = 'cloud';
    mocks.getCloudOrganizationOverview.mockResolvedValue(OVERVIEW);
    mocks.setActiveCloudWorkspace.mockResolvedValue(undefined);
    mocks.loadConversations.mockResolvedValue(undefined);
  });

  afterEach(() => cleanup());

  it('lists Personal alongside every workspace membership with the active one checked', async () => {
    render(<AccountMenu onClose={vi.fn()} />);

    const personal = await screen.findByRole('menuitemradio', { name: /Personal/ });
    expect(personal).toHaveAttribute('aria-checked', 'true');
    expect(await screen.findByRole('menuitemradio', { name: /Acme Research/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(await screen.findByRole('menuitemradio', { name: /Globex/ })).toBeInTheDocument();
  });

  it('sends the selected workspace to the cloud API and reloads conversations', async () => {
    const user = userEvent.setup();
    render(<AccountMenu onClose={vi.fn()} />);

    await user.click(await screen.findByRole('menuitemradio', { name: /Acme Research/ }));

    await waitFor(() => {
      expect(mocks.setActiveCloudWorkspace).toHaveBeenCalledWith('ws-acme');
    });
    await waitFor(() => {
      expect(mocks.loadConversations).toHaveBeenCalledWith('user-1');
    });
    await waitFor(() => {
      expect(screen.getByRole('menuitemradio', { name: /Acme Research/ })).toHaveAttribute(
        'aria-checked',
        'true',
      );
    });
    expect(screen.getByRole('menuitemradio', { name: /Personal/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('does not re-send the workspace that is already active', async () => {
    const user = userEvent.setup();
    render(<AccountMenu onClose={vi.fn()} />);

    await user.click(await screen.findByRole('menuitemradio', { name: /Personal/ }));

    expect(mocks.setActiveCloudWorkspace).not.toHaveBeenCalled();
  });

  it('opens workspace administration from the menu', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AccountMenu onClose={onClose} />);

    await user.click(await screen.findByRole('button', { name: 'Manage workspaces' }));

    expect(mocks.openSettings).toHaveBeenCalledWith('team');
    expect(onClose).toHaveBeenCalled();
  });

  it('stays out of the menu entirely in local mode', async () => {
    mocks.appMode = 'local';
    render(<AccountMenu onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('accountMenu.settings')).toBeInTheDocument();
    });
    expect(screen.queryByRole('menuitemradio')).toBeNull();
    expect(mocks.getCloudOrganizationOverview).not.toHaveBeenCalled();
  });
});
