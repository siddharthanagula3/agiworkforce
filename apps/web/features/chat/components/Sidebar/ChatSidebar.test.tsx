import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSidebar, type SessionLike } from './ChatSidebar';

const sidebarMocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  signOut: vi.fn(),
  logout: vi.fn(),
  openDirectory: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: sidebarMocks.push,
    replace: sidebarMocks.replace,
  }),
}));

vi.mock('@clerk/nextjs', () => ({
  useClerk: () => ({
    signOut: sidebarMocks.signOut,
  }),
}));

vi.mock('@shared/stores/authentication-store', () => ({
  useAuthStore: (selector?: (state: unknown) => unknown) => {
    const state = {
      user: { id: 'user-1', name: 'Test User', email: 'test@example.com' },
      logout: sidebarMocks.logout,
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock('@/stores/unified/auth', () => ({
  useBillingStore: (selector: (state: unknown) => unknown) =>
    selector({ subscription: { tier: 'free' } }),
}));

vi.mock('@features/chat/stores/directory-store', () => ({
  useDirectoryStore: (selector: (state: unknown) => unknown) =>
    selector({ setOpen: sidebarMocks.openDirectory }),
}));

vi.mock('@features/projects/stores/project-store', () => ({
  useProjectStore: (selector: (state: unknown) => unknown) =>
    selector({
      projects: [{ id: 'proj-1', name: 'Project One' }],
    }),
}));

vi.mock('@shared/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div role="menu">{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
    disabled,
  }: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" role="menuitem" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuSub: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuSubTrigger: ({ children }: { children: ReactNode }) => (
    <div role="menuitem">{children}</div>
  ),
  DropdownMenuSubContent: ({ children }: { children: ReactNode }) => (
    <div role="menu">{children}</div>
  ),
}));

vi.mock('@features/chat/components/dialogs/GlobalSearchDialog', () => ({
  GlobalSearchDialog: ({ open }: { open: boolean }) =>
    open ? (
      <div role="dialog" aria-label="Search Conversations">
        <h2>Search Conversations</h2>
      </div>
    ) : null,
}));

vi.mock('@features/chat/components/dialogs/KeyboardShortcutsDialog', () => ({
  KeyboardShortcutsDialog: ({
    open,
    shortcuts,
  }: {
    open: boolean;
    shortcuts: Array<{ description: string }>;
  }) =>
    open ? (
      <div role="dialog" aria-label="Keyboard Shortcuts">
        <h2>Keyboard Shortcuts</h2>
        {shortcuts.map((shortcut) => (
          <p key={shortcut.description}>{shortcut.description}</p>
        ))}
      </div>
    ) : null,
}));

const sessions: SessionLike[] = [
  {
    id: 'conv-1',
    title: 'Launch plan',
    createdAt: '2026-06-05T12:00:00.000Z',
    updatedAt: '2026-06-05T12:00:00.000Z',
    messageCount: 2,
  },
];

function renderSidebar(overrides: Partial<ComponentProps<typeof ChatSidebar>> = {}) {
  return render(
    <ChatSidebar
      sessions={sessions}
      activeSessionId="conv-1"
      onNewChat={vi.fn()}
      onSelectSession={vi.fn()}
      onDeleteSession={vi.fn()}
      onRenameSession={vi.fn()}
      onToggleSidebar={vi.fn()}
      onMoveToProjectSession={vi.fn()}
      onUpgradeRequest={vi.fn()}
      {...overrides}
    />,
  );
}

describe('ChatSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('wires collapsed rail buttons to real actions', async () => {
    renderSidebar({ collapsed: true });

    fireEvent.click(screen.getByRole('button', { name: 'Get apps and extensions' }));
    expect(sidebarMocks.push).toHaveBeenCalledWith('/download');

    fireEvent.click(screen.getByRole('button', { name: 'Account settings' }));
    expect(sidebarMocks.push).toHaveBeenCalledWith('/settings/general');

    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(
      await screen.findByRole('heading', { name: 'Search Conversations' }),
    ).toBeInTheDocument();
  });

  it('opens the existing keyboard shortcuts dialog from the account menu', async () => {
    renderSidebar();

    fireEvent.pointerDown(screen.getByRole('button', { name: /account menu for test user/i }), {
      button: 0,
    });
    fireEvent.click(await screen.findByText('Keyboard shortcuts'));

    expect(await screen.findByRole('heading', { name: 'Keyboard Shortcuts' })).toBeInTheDocument();
    expect(screen.getByText('Open search')).toBeInTheDocument();
    expect(screen.getByText('New conversation')).toBeInTheDocument();
    expect(screen.getByText('Toggle sidebar')).toBeInTheDocument();
    expect(screen.queryByText('Copy last message')).not.toBeInTheDocument();
  });

  it('keeps bulk delete pending until async deletes finish', async () => {
    let resolveDelete: (() => void) | undefined;
    const onDeleteSession = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
    );

    renderSidebar({ onDeleteSession });

    fireEvent.click(screen.getByRole('button', { name: 'Select conversations' }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.getByRole('button', { name: 'Deleting...' })).toBeDisabled();
    expect(onDeleteSession).toHaveBeenCalledWith('conv-1');

    resolveDelete?.();
    await waitFor(() => {
      expect(screen.queryByText('Deleting...')).not.toBeInTheDocument();
    });
  });
});
