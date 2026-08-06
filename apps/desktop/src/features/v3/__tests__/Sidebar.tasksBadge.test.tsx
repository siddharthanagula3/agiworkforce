/**
 * The Tasks nav row carries a count of Managed Cloud runs stopped waiting on
 * the user. Cloud runs are durable — they keep going with Desktop closed — so
 * without this the shell gives no sign that a run needs an approval.
 *
 * What matters here is the wiring and the gating, not the arithmetic (that is
 * covered in stores/__tests__/cloudTaskBadgeStore.test.ts): the badge appears
 * only in a managed session, never in Local, and never at zero.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  privacyMode: 'managed' as 'local' | 'byok' | 'managed',
  hasCloudSession: true,
  needsUserCount: 0,
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

// The real hook runs; only the store beneath it is faked, so the gating logic
// under test (managed + signed in, else reset) is genuinely exercised.
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

import { Sidebar } from '../Sidebar';

describe('Tasks nav badge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.privacyMode = 'managed';
    mocks.hasCloudSession = true;
    mocks.needsUserCount = 0;
  });

  afterEach(() => cleanup());

  it('shows the count of runs waiting on the user in a managed session', () => {
    mocks.needsUserCount = 3;
    render(<Sidebar mode="chat" />);

    const badge = screen.getByTestId('nav-badge-tasks');
    expect(badge).toHaveTextContent('3');
    // The badge has to sit on the Tasks row, not merely somewhere in the nav.
    expect(badge.closest('button')?.textContent).toContain('Tasks');
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it('renders nothing at zero rather than an empty or "0" pill', () => {
    mocks.needsUserCount = 0;
    render(<Sidebar mode="chat" />);

    expect(screen.getByText('Tasks')).toBeInTheDocument();
    expect(screen.queryByTestId('nav-badge-tasks')).not.toBeInTheDocument();
  });

  it('caps the displayed count so a large number cannot break the row', () => {
    mocks.needsUserCount = 150;
    render(<Sidebar mode="chat" />);

    expect(screen.getByTestId('nav-badge-tasks')).toHaveTextContent('99+');
  });

  it('never polls or badges in a Local session', () => {
    mocks.privacyMode = 'local';
    // Even if a count survived in the store, Local must not render it.
    mocks.needsUserCount = 4;
    render(<Sidebar mode="chat" />);

    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.reset).toHaveBeenCalled();
  });

  it('does not poll when managed but signed out', () => {
    mocks.hasCloudSession = false;
    render(<Sidebar mode="chat" />);

    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.reset).toHaveBeenCalled();
  });
});
