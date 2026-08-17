import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  privacyMode: 'managed' as 'local' | 'byok' | 'managed',
  hasCloudSession: true,
  needsUserCount: 0,
  unreadCount: 0,
  list: vi.fn(),
  init: vi.fn(),
  refresh: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        'sidebar.nav.library': 'Library',
        'sidebar.nav.tasks': 'Tasks',
        'sidebar.nav.scheduled': 'Scheduled',
        'sidebar.nav.customize': 'Customize',
        'sidebar.nav.artifacts': 'Artifacts',
        'sidebar.nav.code': 'Code',
        'sidebar.nav.projects': 'Projects',
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
  selectPlanDisplayName: () => 'Cloud',
  selectHasCloudAccountSession: () => mocks.hasCloudSession,
  useUnifiedAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ cloudSessionEpoch: 1 }),
}));

vi.mock('../../../stores/settingsDialogStore', () => ({
  useSettingsDialogStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ openSettings: vi.fn() }),
}));

vi.mock('../../../stores/appModeStore', () => ({
  selectPrivacyMode: () => mocks.privacyMode,
  useAppModeStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ mode: 'cloud', setMode: vi.fn() }),
}));

vi.mock('../../../stores/cloudTaskBadgeStore', () => {
  const useCloudTaskBadgeStore = (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ needsUserCount: mocks.needsUserCount });
  useCloudTaskBadgeStore.getState = () => ({ refresh: mocks.refresh, reset: mocks.reset });
  return { useCloudTaskBadgeStore };
});

vi.mock('../LocalCloudToggle', () => ({ LocalCloudToggle: () => null }));
vi.mock('../../updates', () => ({ UpdatePill: () => null }));
vi.mock('../AccountMenu', () => ({ AccountMenu: () => null }));
vi.mock('@agiworkforce/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agiworkforce/ui')>()),
  AgiMark: () => null,
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));

vi.mock('../../../stores/notificationStore', () => {
  const useNotificationStore = (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      notifications: [],
      unreadCount: mocks.unreadCount,
      loading: false,
      error: null,
      hasMore: false,
      page: 1,
      list: mocks.list,
      markRead: vi.fn(),
      markAllRead: vi.fn(),
      deleteNotification: vi.fn(),
      deleteAllRead: vi.fn(),
    });
  useNotificationStore.getState = () => ({ init: mocks.init, list: mocks.list, cleanup: vi.fn() });
  return {
    useNotificationStore,
    selectNotifications: (s: { notifications: unknown }) => s.notifications,
    selectUnreadCount: (s: { unreadCount: number }) => s.unreadCount,
    selectNotificationLoading: (s: { loading: boolean }) => s.loading,
    selectNotificationError: (s: { error: string | null }) => s.error,
    selectHasMore: (s: { hasMore: boolean }) => s.hasMore,
  };
});

import { Sidebar } from '../Sidebar';

describe('DESK-11 notification center mount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.privacyMode = 'managed';
    mocks.hasCloudSession = true;
    mocks.needsUserCount = 0;
    mocks.unreadCount = 0;
  });

  afterEach(() => cleanup());

  it('renders the notification center trigger in the sidebar footer', () => {
    render(<Sidebar mode="chat" />);

    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('badges the trigger with the unread count the store reports', () => {
    mocks.unreadCount = 4;
    render(<Sidebar mode="chat" />);

    expect(screen.getByRole('button', { name: 'Notifications' })).toHaveTextContent('4');
  });

  it('caps a large unread count so the rail cannot break', () => {
    mocks.unreadCount = 250;
    render(<Sidebar mode="chat" />);

    expect(screen.getByRole('button', { name: 'Notifications' })).toHaveTextContent('99+');
  });
});
