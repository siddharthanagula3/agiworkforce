/**
 * CommandPalette tests
 *
 * Covers:
 * - Rendering in open/closed state
 * - Command groups (Actions, Navigate, Preferences)
 * - Search/filter behaviour
 * - Keyboard navigation (ArrowUp/Down, Enter, Escape)
 * - Sub-menu navigation for model switching
 * - Executing actions (navigation, theme toggle, sidebar toggle)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { CommandPalette } from './CommandPalette';

const modelFixtureIds = vi.hoisted(() => ({
  primary: 'test-command-model-primary',
  secondary: 'test-command-model-secondary',
}));

const navigationState = vi.hoisted(() => ({
  pathname: '/',
}));

const modelStoreMocks = vi.hoisted(() => ({
  setSelectedModelId: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => navigationState.pathname,
}));

const mockSetTheme = vi.fn();
vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'dark', setTheme: mockSetTheme }),
}));

// ChatStore
const mockToggleSidebar = vi.fn();
vi.mock('@shared/stores/web-chat-store', () => ({
  useChatStore: () => ({
    sidebarCollapsed: false,
    toggleSidebar: mockToggleSidebar,
  }),
}));

vi.mock('@/shared/stores/model-store', () => ({
  AVAILABLE_MODELS: [
    {
      id: modelFixtureIds.primary,
      name: 'Fixture Primary Model',
      provider: 'Provider A',
      description: 'Primary command palette fixture model',
    },
    {
      id: modelFixtureIds.secondary,
      name: 'Fixture Secondary Model',
      provider: 'Provider B',
      description: 'Secondary command palette fixture model',
    },
  ],
  useModelStore: (
    selector: (state: {
      selectedModelId: string;
      setSelectedModelId: typeof modelStoreMocks.setSelectedModelId;
    }) => unknown,
  ) =>
    selector({
      selectedModelId: modelFixtureIds.primary,
      setSelectedModelId: modelStoreMocks.setSelectedModelId,
    }),
}));

// Radix Dialog · render children directly (no Portal)
// CommandPalette imports Dialog from @agiworkforce/ui (restructure Wave 3A moved
// it off the deleted @/components/ui fork). Mock the barrel, preserving every
// other real export so unrelated symbols the component tree pulls still resolve.
vi.mock('@agiworkforce/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/ui')>();
  return {
    ...actual,
    Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
      open ? <div data-testid="dialog">{children}</div> : null,
    DialogContent: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="dialog-content">{children}</div>
    ),
    DialogTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <h2 className={className}>{children}</h2>
    ),
    DialogDescription: ({
      children,
      className,
    }: {
      children: React.ReactNode;
      className?: string;
    }) => <p className={className}>{children}</p>,
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPalette(open = true, onOpenChange = vi.fn()) {
  return render(<CommandPalette open={open} onOpenChange={onOpenChange} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigationState.pathname = '/';
  });

  // ============================================================
  // Visibility
  // ============================================================

  describe('visibility', () => {
    it('renders when open=true', () => {
      renderPalette(true);
      expect(screen.getByTestId('dialog')).toBeInTheDocument();
    });

    it('does not render when open=false', () => {
      renderPalette(false);
      expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
    });
  });

  // ============================================================
  // Search input
  // ============================================================

  describe('search input', () => {
    it('renders the search input', () => {
      renderPalette();
      expect(screen.getByLabelText('Command palette search')).toBeInTheDocument();
    });

    it('renders accessible dialog title and description', () => {
      renderPalette();
      expect(screen.getByText('Command palette')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Search commands, navigate the app, change preferences, and switch AI models.',
        ),
      ).toBeInTheDocument();
    });

    it('has the correct placeholder', () => {
      renderPalette();
      expect(screen.getByPlaceholderText('Type a command or search…')).toBeInTheDocument();
    });

    it('filters commands based on query', () => {
      renderPalette();
      const input = screen.getByPlaceholderText('Type a command or search…');

      fireEvent.change(input, { target: { value: 'settings' } });

      // "Go to Settings" should still be visible
      expect(screen.getByText('Go to Settings')).toBeInTheDocument();
      // "New Chat" should be filtered out
      expect(screen.queryByText('New Chat')).not.toBeInTheDocument();
    });

    it('shows "No commands found." when query has no match', () => {
      renderPalette();
      const input = screen.getByPlaceholderText('Type a command or search…');

      fireEvent.change(input, { target: { value: 'zzzzzzz_impossible' } });

      expect(screen.getByText('No commands found.')).toBeInTheDocument();
    });

    it('shows clear button when query is non-empty', () => {
      renderPalette();
      const input = screen.getByPlaceholderText('Type a command or search…');

      fireEvent.change(input, { target: { value: 'chat' } });
      expect(screen.getByLabelText('Clear search')).toBeInTheDocument();
    });

    it('clicking clear button resets the query', () => {
      renderPalette();
      const input = screen.getByPlaceholderText('Type a command or search…') as HTMLInputElement;

      fireEvent.change(input, { target: { value: 'chat' } });
      expect(input.value).toBe('chat');

      fireEvent.click(screen.getByLabelText('Clear search'));
      expect(input.value).toBe('');
    });
  });

  // ============================================================
  // Command groups
  // ============================================================

  describe('command groups', () => {
    it('shows Actions group', () => {
      renderPalette();
      expect(screen.getByText('Actions')).toBeInTheDocument();
    });

    it('shows Navigate group', () => {
      renderPalette();
      expect(screen.getByText('Navigate')).toBeInTheDocument();
    });

    it('shows Preferences group', () => {
      renderPalette();
      expect(screen.getByText('Preferences')).toBeInTheDocument();
    });

    it('renders New Chat command', () => {
      renderPalette();
      expect(screen.getByText('New Chat')).toBeInTheDocument();
    });

    it('renders Search Conversations command', () => {
      renderPalette();
      expect(screen.getByText('Search Conversations')).toBeInTheDocument();
    });

    it('renders Switch AI Model command', () => {
      renderPalette();
      expect(screen.getByText('Switch AI Model')).toBeInTheDocument();
    });

    it('renders Go to Settings command', () => {
      renderPalette();
      expect(screen.getByText('Go to Settings')).toBeInTheDocument();
    });

    it('does not render chat sidebar command outside chat routes', () => {
      renderPalette();
      expect(screen.queryByText('Collapse Chat Sidebar')).not.toBeInTheDocument();
    });

    it('renders chat sidebar command on chat routes', () => {
      navigationState.pathname = '/chat';
      renderPalette();
      expect(screen.getByText('Collapse Chat Sidebar')).toBeInTheDocument();
    });

    it('renders toggle theme command when theme is dark', () => {
      renderPalette();
      expect(screen.getByText('Switch to System Theme')).toBeInTheDocument();
    });
  });

  // ============================================================
  // Command execution · navigation
  // ============================================================

  describe('navigation commands', () => {
    it('navigates to /chat on New Chat click', () => {
      const onOpenChange = vi.fn();
      renderPalette(true, onOpenChange);

      fireEvent.click(screen.getByText('New Chat'));
      expect(mockPush).toHaveBeenCalledWith('/chat');
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('navigates to /billing on Go to Billing click', () => {
      const onOpenChange = vi.fn();
      renderPalette(true, onOpenChange);

      fireEvent.click(screen.getByText('Go to Billing'));
      expect(mockPush).toHaveBeenCalledWith('/billing');
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('navigates to /settings/general on Go to Settings click', () => {
      const onOpenChange = vi.fn();
      renderPalette(true, onOpenChange);

      fireEvent.click(screen.getByText('Go to Settings'));
      expect(mockPush).toHaveBeenCalledWith('/settings/general');
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  // ============================================================
  // Preferences commands
  // ============================================================

  describe('preferences commands', () => {
    it('calls toggleSidebar when sidebar toggle is clicked', () => {
      const onOpenChange = vi.fn();
      navigationState.pathname = '/chat';
      renderPalette(true, onOpenChange);

      fireEvent.click(screen.getByText('Collapse Chat Sidebar'));
      expect(mockToggleSidebar).toHaveBeenCalled();
    });

    it('calls setTheme with next theme when theme toggle is clicked', () => {
      const onOpenChange = vi.fn();
      renderPalette(true, onOpenChange);

      // current theme is 'dark' → next is 'system'
      fireEvent.click(screen.getByText('Switch to System Theme'));
      expect(mockSetTheme).toHaveBeenCalledWith('system');
    });
  });

  // ============================================================
  // Sub-menu: model switching
  // ============================================================

  describe('model sub-menu', () => {
    it('opens model sub-menu when Switch AI Model is clicked', () => {
      renderPalette();
      fireEvent.click(screen.getByText('Switch AI Model'));

      // Sub-menu title should appear
      expect(screen.getByText('Switch AI Model')).toBeInTheDocument();
      // Model options should appear
      expect(screen.getByText('Fixture Primary Model')).toBeInTheDocument();
      expect(screen.getByText('Fixture Secondary Model')).toBeInTheDocument();
    });

    it('closes palette when a model is selected', () => {
      const onOpenChange = vi.fn();
      renderPalette(true, onOpenChange);

      fireEvent.click(screen.getByText('Switch AI Model'));
      fireEvent.click(screen.getByText('Fixture Primary Model'));

      expect(modelStoreMocks.setSelectedModelId).toHaveBeenCalledWith(modelFixtureIds.primary);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('pressing Escape in sub-menu returns to main menu', () => {
      renderPalette();
      const input = screen.getByPlaceholderText('Type a command or search…');

      fireEvent.click(screen.getByText('Switch AI Model'));

      // Now in sub-menu
      expect(screen.getByText('Fixture Primary Model')).toBeInTheDocument();

      fireEvent.keyDown(input, { key: 'Escape' });

      // Back to main menu · model options should be gone
      expect(screen.queryByText('Fixture Primary Model')).not.toBeInTheDocument();
      // Main commands should be back
      expect(screen.getByText('New Chat')).toBeInTheDocument();
    });

    it('shows "Back to main menu" button in sub-menu', () => {
      renderPalette();
      fireEvent.click(screen.getByText('Switch AI Model'));
      expect(screen.getByLabelText('Back to main menu')).toBeInTheDocument();
    });

    it('back button returns to main menu', () => {
      renderPalette();
      fireEvent.click(screen.getByText('Switch AI Model'));

      fireEvent.click(screen.getByLabelText('Back to main menu'));

      expect(screen.queryByText('Fixture Primary Model')).not.toBeInTheDocument();
      expect(screen.getByText('New Chat')).toBeInTheDocument();
    });
  });

  // ============================================================
  // Keyboard navigation
  // ============================================================

  describe('keyboard navigation', () => {
    it('pressing Escape closes the palette', () => {
      const onOpenChange = vi.fn();
      renderPalette(true, onOpenChange);

      const input = screen.getByPlaceholderText('Type a command or search…');
      fireEvent.keyDown(input, { key: 'Escape' });

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('pressing Enter executes the selected command', () => {
      const onOpenChange = vi.fn();
      renderPalette(true, onOpenChange);

      // Filter to a single result
      const input = screen.getByPlaceholderText('Type a command or search…');
      fireEvent.change(input, { target: { value: 'New Chat' } });

      fireEvent.keyDown(input, { key: 'Enter' });

      expect(mockPush).toHaveBeenCalledWith('/chat');
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('ArrowDown and Enter selects next item', () => {
      const onOpenChange = vi.fn();
      renderPalette(true, onOpenChange);

      // Filter to multiple navigation commands.
      const input = screen.getByPlaceholderText('Type a command or search…');
      fireEvent.change(input, { target: { value: 'Go to' } });

      // ArrowDown moves to the second visible result.
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'Enter' });

      // Could be any "Go to" page · just confirm navigation happened
      expect(mockPush).toHaveBeenCalled();
    });
  });

  // ============================================================
  // Footer
  // ============================================================

  describe('footer', () => {
    it('shows result count', () => {
      renderPalette();
      // Look for the numeric result count in the footer
      const footer = screen.getByText(/results/);
      expect(footer).toBeInTheDocument();
    });

    it('shows ESC shortcut in footer', () => {
      renderPalette();
      expect(screen.getByText('close')).toBeInTheDocument();
    });
  });
});
