import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  archiveConversation: vi.fn(),
  deleteConversation: vi.fn(),
  restoreConversation: vi.fn(),
  conversations: [
    {
      id: 'active-chat',
      title: 'Active chat',
      updatedAt: new Date('2026-07-30T12:00:00.000Z'),
      pinned: false,
      archived: false,
    },
    {
      id: 'archived-chat',
      title: 'Archived chat',
      updatedAt: new Date('2026-07-29T12:00:00.000Z'),
      pinned: false,
      archived: true,
    },
  ],
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) => {
      const labels: Record<string, string> = {
        'sidebar.recents': 'Recents',
        'sidebar.archived': 'Archived chats',
        'sidebar.showActive': 'Back to active chats',
        'sidebar.noArchived': 'No archived chats',
        'sidebar.noConversations': 'No conversations yet',
        'sidebar.actions.more': 'More options',
        'sidebar.actions.pin': 'Pin',
        'sidebar.actions.unpin': 'Unpin',
        'sidebar.actions.rename': 'Rename',
        'sidebar.actions.archive': 'Archive',
        'sidebar.actions.restore': 'Restore',
        'sidebar.actions.delete': 'Delete',
        'sidebar.actions.confirmDelete': 'Confirm delete',
        'sidebar.actions.deletePermanently': 'Delete permanently',
        'sidebar.actions.confirmDeletePermanently': 'Confirm permanent delete',
        'sidebar.groups.lastHour': 'Last hour',
        'sidebar.groups.today': 'Today',
        'sidebar.groups.yesterday': 'Yesterday',
        'sidebar.groups.pastWeek': 'Past week',
        'sidebar.groups.pastMonth': 'Past month',
      };
      if (key === 'sidebar.showArchived') {
        return `Show archived chats (${options?.count ?? 0})`;
      }
      return labels[key] ?? key;
    },
  }),
}));

vi.mock('../../../stores/chat', () => ({
  selectSidebarCollapsed: (state: { sidebarCollapsed: boolean }) => state.sidebarCollapsed,
  useChatStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      conversations: mocks.conversations,
      activeConversationId: 'active-chat',
      renameConversation: vi.fn(),
      deleteConversation: mocks.deleteConversation,
      togglePinnedConversation: vi.fn(),
      archiveConversation: mocks.archiveConversation,
      restoreConversation: mocks.restoreConversation,
    }),
  useSidecarStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      sidebarCollapsed: false,
      setSidebarCollapsed: vi.fn(),
    }),
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
  selectPlanDisplayName: () => 'Local',
  selectHasCloudAccountSession: () => false,
  useUnifiedAuthStore: (selector: (state: Record<string, unknown>) => unknown) => selector({}),
}));

vi.mock('../../../stores/settingsDialogStore', () => ({
  useSettingsDialogStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ openSettings: vi.fn() }),
}));

vi.mock('../../../stores/appModeStore', () => ({
  selectPrivacyMode: () => 'local',
  useAppModeStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ privacyMode: 'local', mode: 'local', setMode: vi.fn() }),
}));

vi.mock('../LocalCloudToggle', () => ({ LocalCloudToggle: () => null }));
vi.mock('../../updates', () => ({ UpdatePill: () => null }));
vi.mock('../AccountMenu', () => ({ AccountMenu: () => null }));
vi.mock('@agiworkforce/ui', () => ({ AgiMark: () => null }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

import { Sidebar } from '../Sidebar';

describe('GAP-007 archived-chat recovery', () => {
  beforeEach(() => {
    mocks.archiveConversation.mockClear();
    mocks.deleteConversation.mockClear();
    mocks.restoreConversation.mockClear();
  });

  afterEach(() => cleanup());

  it('opens archived chats and exposes restore plus confirmed permanent delete', async () => {
    const user = userEvent.setup();
    const onJumpConversation = vi.fn();
    render(<Sidebar mode="chat" onJumpConversation={onJumpConversation} />);

    expect(screen.getByText('Active chat')).toBeVisible();
    expect(screen.queryByText('Archived chat')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: 'Show archived chats (1)',
      }),
    );

    expect(screen.getByText('Archived chats')).toBeVisible();
    expect(screen.queryByText('Active chat')).not.toBeInTheDocument();

    const archivedRow = screen.getByTestId('conversation-row');
    await user.click(within(archivedRow).getByRole('button', { name: 'Archived chat' }));
    expect(onJumpConversation).toHaveBeenCalledWith('archived-chat');

    fireEvent.mouseEnter(archivedRow);
    fireEvent.click(within(archivedRow).getByRole('button', { name: 'More options' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Restore' }));
    expect(mocks.restoreConversation).toHaveBeenCalledWith('archived-chat');

    fireEvent.mouseEnter(archivedRow);
    fireEvent.click(within(archivedRow).getByRole('button', { name: 'More options' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete permanently' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Confirm permanent delete' }));
    expect(mocks.deleteConversation).toHaveBeenCalledWith('archived-chat');
  });
});
