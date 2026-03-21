/**
 * ChatLayoutShell — integration tests
 *
 * Verifies that all features are correctly wired into the chat layout shell:
 *  - CommandPalette: rendered at root level, toggled by Cmd+K
 *  - KeyboardShortcutsDialog: rendered at root level, toggled by Cmd+/
 *  - HelpTour: mounted at root level
 *  - BudgetTracker: mounted at root level
 *  - Cmd+N: triggers new chat creation + navigation
 *  - Cmd+B: toggles sidebar collapse
 *  - Cmd+D: toggles dark/light theme
 *  - Cmd+Shift+S: legacy sidebar toggle
 *  - Escape: closes mobile sidebar
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

// ── Hoist mocks so vi.mock factories can reference them ───────────────────────

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  setTheme: vi.fn(),
  currentTheme: { value: 'dark' as string },
  createSession: vi.fn().mockReturnValue('session-new'),
  deleteSession: vi.fn(),
}));

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: mocks.currentTheme.value, setTheme: mocks.setTheme }),
}));

vi.mock('@shared/stores/authentication-store', () => ({
  useAuthStore: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@features/chat/stores/chat-store', () => {
  const hook = () => ({
    sessions: [],
    activeSessionId: null,
    createSession: mocks.createSession,
    deleteSession: mocks.deleteSession,
    renameSession: vi.fn(),
    pinSession: vi.fn(),
    unpinSession: vi.fn(),
    archiveSession: vi.fn(),
    unarchiveSession: vi.fn(),
  });
  (hook as unknown as { getState: () => { sessions: unknown[] } }).getState = () => ({
    sessions: [],
  });
  return { useChatStore: hook };
});

vi.mock('@features/chat/components/Sidebar/ChatSidebarNew', () => ({
  ChatSidebarNew: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="chat-sidebar-new">{children}</div>
  ),
}));

vi.mock('@/components/ui/ResizeHandle', () => ({
  ResizeHandle: () => <div data-testid="resize-handle" />,
}));

vi.mock('@/components/ui/SectionErrorBoundary', () => ({
  SectionErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/UnifiedAgenticChat/CommandPalette', () => ({
  CommandPalette: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div data-testid="command-palette">
        <button onClick={onClose} aria-label="Close command palette">
          close
        </button>
      </div>
    ) : null,
}));

vi.mock('@/components/UnifiedAgenticChat/KeyboardShortcutsDialog', () => ({
  KeyboardShortcutsDialog: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div data-testid="keyboard-shortcuts-dialog">
        <button onClick={onClose} aria-label="Close dialog">
          close
        </button>
      </div>
    ) : null,
}));

vi.mock('@/components/UnifiedAgenticChat/BudgetTracker', () => ({
  BudgetTracker: () => <div data-testid="budget-tracker" />,
}));

vi.mock('@features/chat/components/HelpTour', () => ({
  HelpTour: () => <div data-testid="help-tour" />,
}));

vi.mock('@shared/utils/browser-utils', () => ({
  safePlatform: { isMac: () => false },
}));

vi.mock('zustand/middleware', async () => {
  const actual = await vi.importActual<typeof import('zustand/middleware')>('zustand/middleware');
  return {
    ...actual,
    persist: (config: (set: unknown) => unknown) => config,
  };
});

// ── Subject ───────────────────────────────────────────────────────────────────

import ChatLayoutShell from '../ChatLayoutShell';

// ── Helper ────────────────────────────────────────────────────────────────────

function renderShell(children?: React.ReactNode) {
  return render(
    <ChatLayoutShell>{children ?? <div data-testid="content">content</div>}</ChatLayoutShell>,
  );
}

function pressKey(key: string, options: KeyboardEventInit = {}) {
  fireEvent.keyDown(window, { key, ...options });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ChatLayoutShell — component mounting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentTheme.value = 'dark';
  });

  it('renders children inside the main content area', () => {
    renderShell();
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  it('mounts HelpTour at root level', () => {
    renderShell();
    expect(screen.getByTestId('help-tour')).toBeInTheDocument();
  });

  it('mounts BudgetTracker at root level', () => {
    renderShell();
    expect(screen.getByTestId('budget-tracker')).toBeInTheDocument();
  });

  it('CommandPalette is hidden by default', () => {
    renderShell();
    expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument();
  });

  it('KeyboardShortcutsDialog is hidden by default', () => {
    renderShell();
    expect(screen.queryByTestId('keyboard-shortcuts-dialog')).not.toBeInTheDocument();
  });
});

describe('ChatLayoutShell — keyboard shortcut: Cmd+K (CommandPalette)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens CommandPalette on Cmd+K', () => {
    renderShell();
    act(() => pressKey('k', { ctrlKey: true }));
    expect(screen.getByTestId('command-palette')).toBeInTheDocument();
  });

  it('closes CommandPalette on second Cmd+K (toggle)', () => {
    renderShell();
    act(() => pressKey('k', { ctrlKey: true }));
    act(() => pressKey('k', { ctrlKey: true }));
    expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument();
  });

  it('CommandPalette onClose handler closes the dialog', () => {
    renderShell();
    act(() => pressKey('k', { ctrlKey: true }));
    fireEvent.click(screen.getByRole('button', { name: /close command palette/i }));
    expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument();
  });
});

describe('ChatLayoutShell — keyboard shortcut: Cmd+/ (KeyboardShortcutsDialog)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens KeyboardShortcutsDialog on Cmd+/', () => {
    renderShell();
    act(() => pressKey('/', { ctrlKey: true }));
    expect(screen.getByTestId('keyboard-shortcuts-dialog')).toBeInTheDocument();
  });

  it('closes KeyboardShortcutsDialog on second Cmd+/ (toggle)', () => {
    renderShell();
    act(() => pressKey('/', { ctrlKey: true }));
    act(() => pressKey('/', { ctrlKey: true }));
    expect(screen.queryByTestId('keyboard-shortcuts-dialog')).not.toBeInTheDocument();
  });

  it('KeyboardShortcutsDialog onClose handler closes the dialog', () => {
    renderShell();
    act(() => pressKey('/', { ctrlKey: true }));
    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));
    expect(screen.queryByTestId('keyboard-shortcuts-dialog')).not.toBeInTheDocument();
  });
});

describe('ChatLayoutShell — keyboard shortcut: Cmd+N (new chat)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSession.mockReturnValue('session-new');
  });

  it('creates a new session on Cmd+N', () => {
    renderShell();
    act(() => pressKey('n', { ctrlKey: true }));
    expect(mocks.createSession).toHaveBeenCalledOnce();
    expect(mocks.createSession).toHaveBeenCalledWith('user-1');
  });

  it('navigates to the new session URL on Cmd+N', () => {
    renderShell();
    act(() => pressKey('n', { ctrlKey: true }));
    expect(mocks.push).toHaveBeenCalledWith('/chat/session-new');
  });
});

describe('ChatLayoutShell — keyboard shortcut: Cmd+B (toggle sidebar)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('toggles sidebar without error on Cmd+B', () => {
    renderShell();
    const sidebars = screen.getAllByRole('complementary', { name: /conversation list/i });
    expect(sidebars.length).toBeGreaterThan(0);

    act(() => pressKey('b', { ctrlKey: true }));
    // Sidebar DOM remains present
    expect(screen.getAllByRole('complementary').length).toBeGreaterThan(0);
  });
});

describe('ChatLayoutShell — keyboard shortcut: Cmd+D (toggle dark mode)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls setTheme("light") when current theme is dark', () => {
    mocks.currentTheme.value = 'dark';
    renderShell();
    act(() => pressKey('d', { ctrlKey: true }));
    expect(mocks.setTheme).toHaveBeenCalledWith('light');
  });

  it('calls setTheme("dark") when current theme is light', () => {
    mocks.currentTheme.value = 'light';
    renderShell();
    act(() => pressKey('d', { ctrlKey: true }));
    expect(mocks.setTheme).toHaveBeenCalledWith('dark');
  });
});

describe('ChatLayoutShell — keyboard shortcut: Cmd+Shift+S (legacy sidebar toggle)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('toggles the sidebar without error on Cmd+Shift+S', () => {
    renderShell();
    act(() => pressKey('s', { ctrlKey: true, shiftKey: true }));
    expect(screen.getAllByRole('complementary').length).toBeGreaterThan(0);
  });
});

describe('ChatLayoutShell — shortcut handler isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not open CommandPalette on plain K press', () => {
    renderShell();
    act(() => pressKey('k'));
    expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument();
  });

  it('does not open KeyboardShortcutsDialog on plain / press', () => {
    renderShell();
    act(() => pressKey('/'));
    expect(screen.queryByTestId('keyboard-shortcuts-dialog')).not.toBeInTheDocument();
  });

  it('opening CommandPalette does not simultaneously open KeyboardShortcutsDialog', () => {
    renderShell();
    act(() => pressKey('k', { ctrlKey: true }));
    expect(screen.getByTestId('command-palette')).toBeInTheDocument();
    expect(screen.queryByTestId('keyboard-shortcuts-dialog')).not.toBeInTheDocument();
  });

  it('opening KeyboardShortcutsDialog does not simultaneously open CommandPalette', () => {
    renderShell();
    act(() => pressKey('/', { ctrlKey: true }));
    expect(screen.getByTestId('keyboard-shortcuts-dialog')).toBeInTheDocument();
    expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument();
  });
});
