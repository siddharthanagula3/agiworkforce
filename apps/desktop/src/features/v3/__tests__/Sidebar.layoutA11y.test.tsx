import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  collapsed: false,
  sidebarWidth: 260 as number | undefined,
  setSidebarCollapsed: vi.fn(),
  setSidebarWidth: vi.fn(),
  onOpenAccountMenu: vi.fn(),
  narrow: false,
  mediaListeners: [] as Array<(event: { matches: boolean }) => void>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        'sidebar.expand': 'Expand sidebar',
        'sidebar.collapse': 'Collapse sidebar',
        'common.settings': 'Settings',
        'accountMenu.accountFallback': 'Account',
      };
      return labels[key] ?? key;
    },
  }),
}));

vi.mock('../../../stores/chat', async (importOriginal) => ({
  ...(await importOriginal<ChatModule>()),
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
    selector({
      sidebarCollapsed: mocks.collapsed,
      setSidebarCollapsed: mocks.setSidebarCollapsed,
      sidebarWidth: mocks.sidebarWidth,
      setSidebarWidth: mocks.setSidebarWidth,
    }),
}));

vi.mock('../../../stores/projectStore', async (importOriginal) => ({
  ...(await importOriginal<ProjectstoreModule>()),
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

vi.mock('../../../stores/auth', async (importOriginal) => {
  const state = {};
  const useUnifiedAuthStore = (selector: (state: Record<string, unknown>) => unknown) =>
    selector(state);
  useUnifiedAuthStore.getState = () => state;
  return {
    ...(await importOriginal<AuthModule>()),
    selectUser: () => ({ name: 'Ada Lovelace', email: 'ada@example.com' }),
    selectPlanDisplayName: () => 'Plus',
    selectHasCloudAccountSession: () => true,
    useUnifiedAuthStore,
    useAuthStore: useUnifiedAuthStore,
  };
});

vi.mock('../../../stores/settingsDialogStore', async (importOriginal) => ({
  ...(await importOriginal<SettingsdialogstoreModule>()),
  useSettingsDialogStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ openSettings: vi.fn() }),
}));

vi.mock('../../../stores/appModeStore', async (importOriginal) => {
  const actual = await importOriginal<AppmodestoreModule>();
  return {
    ...actual,
    selectPrivacyMode: () => 'local',
    selectMode: (state: { mode: string }) => state.mode,
    useAppModeStore: Object.assign(
      (selector: (state: Record<string, unknown>) => unknown) =>
        selector({ privacyMode: 'local', mode: 'local', setMode: vi.fn() }),
      actual.useAppModeStore,
    ),
  };
});

vi.mock('../../chat/conversationExport', () => ({
  conversationExportFormats: () => ['markdown'],
  conversationMarkdown: vi.fn(),
  exportConversation: vi.fn(),
  exportFileStem: vi.fn(),
}));
vi.mock('../../custom-instructions', () => ({ CustomInstructionsDialog: () => null }));
vi.mock('../LocalCloudToggle', () => ({ LocalCloudToggle: () => null }));
vi.mock('../../updates', async (importOriginal) => ({
  ...(await importOriginal<UpdatesModule>()),
  UpdatePill: () => null,
}));
vi.mock('../AccountMenu', () => ({ AccountMenu: () => <button role="menuitem">Log out</button> }));
vi.mock('@agiworkforce/ui', async (importOriginal) => ({
  ...(await importOriginal<UiModule>()),
  AgiMark: () => null,
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));

import { Sidebar, clampSidebarWidth } from '../Sidebar';

type ChatModule = typeof import('../../../stores/chat');
type ProjectstoreModule = typeof import('../../../stores/projectStore');
type AuthModule = typeof import('../../../stores/auth');
type SettingsdialogstoreModule = typeof import('../../../stores/settingsDialogStore');
type AppmodestoreModule = typeof import('../../../stores/appModeStore');
type UpdatesModule = typeof import('../../updates');
type UiModule = typeof import('@agiworkforce/ui');

function installMatchMedia() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: mocks.narrow,
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => {
      mocks.mediaListeners.push(listener);
    },
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe('desktop sidebar layout and accessibility', () => {
  beforeEach(() => {
    mocks.collapsed = false;
    mocks.sidebarWidth = 260;
    mocks.narrow = false;
    mocks.mediaListeners = [];
    mocks.setSidebarCollapsed.mockClear();
    mocks.setSidebarWidth.mockClear();
    mocks.onOpenAccountMenu.mockClear();
    installMatchMedia();
  });

  afterEach(() => cleanup());

  it('shows the account menu from the collapsed rail whenever the trigger says it is expanded', () => {
    mocks.collapsed = true;
    render(<Sidebar mode="chat" accountMenuOpen onOpenAccountMenu={mocks.onOpenAccountMenu} />);

    const trigger = screen.getByRole('button', { name: 'Ada Lovelace' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: 'Account' })).toBeInTheDocument();
  });

  it('reports a closed menu in the collapsed rail when nothing is shown', () => {
    mocks.collapsed = true;
    render(<Sidebar mode="chat" onOpenAccountMenu={mocks.onOpenAccountMenu} />);

    expect(screen.getByRole('button', { name: 'Ada Lovelace' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('collapses to the rail when the window opens narrow', () => {
    mocks.narrow = true;
    render(<Sidebar mode="chat" />);

    expect(mocks.setSidebarCollapsed).toHaveBeenCalledWith(true);
  });

  it('leaves a wide window as the user set it', () => {
    render(<Sidebar mode="chat" />);

    expect(mocks.setSidebarCollapsed).not.toHaveBeenCalled();
  });

  it('sizes the expanded sidebar from the stored width and resizes it by keyboard', () => {
    mocks.sidebarWidth = 300;
    const { container } = render(<Sidebar mode="chat" />);

    const aside = container.querySelector('[data-v3-sidebar]') as HTMLElement;
    expect(aside.style.width).toBe('300px');

    const handle = screen.getByRole('separator', { name: 'Resize sidebar' });
    expect(handle).toHaveAttribute('aria-valuenow', '300');

    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(mocks.setSidebarWidth).toHaveBeenLastCalledWith(316);

    fireEvent.keyDown(handle, { key: 'Home' });
    expect(mocks.setSidebarWidth).toHaveBeenLastCalledWith(220);
  });

  it('has no resize handle on the collapsed rail', () => {
    mocks.collapsed = true;
    render(<Sidebar mode="chat" />);

    expect(screen.queryByRole('separator', { name: 'Resize sidebar' })).not.toBeInTheDocument();
  });

  it('keeps stored widths inside the supported range', () => {
    expect(clampSidebarWidth(undefined)).toBe(260);
    expect(clampSidebarWidth(Number.NaN)).toBe(260);
    expect(clampSidebarWidth(100)).toBe(220);
    expect(clampSidebarWidth(900)).toBe(400);
    expect(clampSidebarWidth(287.4)).toBe(287);
  });
});
