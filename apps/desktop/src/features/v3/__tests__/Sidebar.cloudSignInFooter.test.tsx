/**
 * DES-C01 — the sidebar footer "Sign in / Cloud sync" row was a dead control.
 *
 * It called `openSettings('account')`, but in Local mode the settings host is
 * `SettingsPanel`, whose `LOCAL_HIDDEN_TABS` contains 'account' and whose
 * `resolveVisibleTab` rewrites it to 'general'. Clicking the only visible
 * sign-in affordance in the shell landed on General settings; the sole working
 * route into Cloud was the Local/Cloud tab strip.
 *
 * It now enters the Cloud workspace, which is what makes `App.tsx` render
 * `AuthPage` (the real device sign-in surface).
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  openSettings: vi.fn(),
  setMode: vi.fn(),
  onOpenAccountMenu: vi.fn(),
  signedIn: false,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        'sidebar.signIn': 'Sign in',
        'sidebar.cloudSync': 'Cloud sync',
        'common.settings': 'Settings',
        'accountMenu.accountFallback': 'Account',
      };
      return labels[key] ?? key;
    },
  }),
}));

vi.mock('../../../stores/chat', () => ({
  selectSidebarCollapsed: (state: { sidebarCollapsed: boolean }) => state.sidebarCollapsed,
  useChatStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      conversations: [],
      activeConversationId: null,
      renameConversation: vi.fn(),
      deleteConversation: vi.fn(),
      togglePinnedConversation: vi.fn(),
      archiveConversation: vi.fn(),
      restoreConversation: vi.fn(),
    }),
  useSidecarStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ sidebarCollapsed: false, setSidebarCollapsed: vi.fn() }),
}));

vi.mock('../../../stores/projectStore', () => ({
  useProjectStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      projects: [],
      activeProjectId: null,
      updateProject: vi.fn(),
      deleteProject: vi.fn(),
      archiveProject: vi.fn(),
      setActiveProject: vi.fn(),
      moveConversationToProject: vi.fn(),
    }),
}));

vi.mock('../../../stores/auth', () => ({
  selectUser: () => null,
  selectPlanDisplayName: () => 'Local Mode',
  selectHasCloudAccountSession: () => mocks.signedIn,
  useUnifiedAuthStore: (selector: (state: Record<string, unknown>) => unknown) => selector({}),
}));

vi.mock('../../../stores/settingsDialogStore', () => ({
  useSettingsDialogStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ openSettings: mocks.openSettings }),
}));

vi.mock('../../../stores/appModeStore', () => ({
  selectPrivacyMode: () => 'local',
  useAppModeStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ privacyMode: 'local', mode: 'local', setMode: mocks.setMode }),
}));

vi.mock('../LocalCloudToggle', () => ({ LocalCloudToggle: () => null }));
vi.mock('../../updates', () => ({ UpdatePill: () => null }));
vi.mock('../AccountMenu', () => ({ AccountMenu: () => null }));
vi.mock('@agiworkforce/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agiworkforce/ui')>()),
  AgiMark: () => null,
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));

import { Sidebar } from '../Sidebar';

function footerPrimaryButton(): HTMLButtonElement {
  const label = screen.getByText('Sign in');
  const button = label.closest('button');
  if (!button) throw new Error('The sidebar footer sign-in row is not a button');
  return button as HTMLButtonElement;
}

describe('DES-C01: the sidebar footer sign-in row reaches Cloud', () => {
  beforeEach(() => {
    mocks.openSettings.mockClear();
    mocks.setMode.mockClear();
    mocks.onOpenAccountMenu.mockClear();
    mocks.signedIn = false;
  });

  afterEach(() => cleanup());

  it('enters the Cloud workspace instead of opening settings when signed out', async () => {
    const user = userEvent.setup();
    render(<Sidebar mode="chat" onOpenAccountMenu={mocks.onOpenAccountMenu} />);

    expect(screen.getByText('Cloud sync')).toBeVisible();

    await user.click(footerPrimaryButton());

    expect(mocks.setMode).toHaveBeenCalledWith('cloud');
    // The old behavior: openSettings('account'), silently rewritten to
    // 'general' by SettingsPanel's LOCAL_HIDDEN_TABS.
    expect(mocks.openSettings).not.toHaveBeenCalledWith('account');
    expect(mocks.openSettings).not.toHaveBeenCalled();
    expect(mocks.onOpenAccountMenu).not.toHaveBeenCalled();
  });

  it('still opens the account menu when a Cloud session exists', async () => {
    mocks.signedIn = true;
    const user = userEvent.setup();
    render(<Sidebar mode="chat" onOpenAccountMenu={mocks.onOpenAccountMenu} />);

    const accountRow = screen.getByText('Local Mode').closest('button');
    expect(accountRow).not.toBeNull();
    await user.click(accountRow as HTMLButtonElement);

    expect(mocks.onOpenAccountMenu).toHaveBeenCalledTimes(1);
    expect(mocks.setMode).not.toHaveBeenCalled();
  });

  it('keeps the separate gear button pointed at General settings', async () => {
    const user = userEvent.setup();
    render(<Sidebar mode="chat" />);

    await user.click(screen.getByRole('button', { name: 'Settings' }));

    expect(mocks.openSettings).toHaveBeenCalledWith('general');
    expect(mocks.setMode).not.toHaveBeenCalled();
  });
});
