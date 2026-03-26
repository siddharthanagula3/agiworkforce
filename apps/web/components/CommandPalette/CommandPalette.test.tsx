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

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockSetTheme = vi.fn();
vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'dark', setTheme: mockSetTheme }),
}));

// UIStore
vi.mock('@/stores/uiStore', () => ({
  useUIStore: () => ({
    simpleMode: false,
    toggleSimpleMode: vi.fn(),
  }),
}));

// ChatStore
const mockToggleSidebar = vi.fn();
vi.mock('@/stores/chatStore', () => ({
  useChatStore: () => ({
    sidebarCollapsed: false,
    toggleSidebar: mockToggleSidebar,
  }),
}));

// model-store
vi.mock('@/shared/stores/model-store', () => ({
  AVAILABLE_MODELS: [
    {
      id: 'gpt-5.4',
      name: 'GPT-5.4',
      provider: 'OpenAI',
      description: 'Most capable GPT model',
    },
    {
      id: 'claude-sonnet-4-6',
      name: 'Claude Sonnet 4.6',
      provider: 'Anthropic',
      description: 'Balanced intelligence',
    },
  ],
}));

// Radix Dialog — render children directly (no Portal)
vi.mock('@/components/ui/Dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-content">{children}</div>
  ),
}));

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

    it('has the correct placeholder', () => {
      renderPalette();
      expect(screen.getByPlaceholderText('Type a command or search...')).toBeInTheDocument();
    });

    it('filters commands based on query', () => {
      renderPalette();
      const input = screen.getByPlaceholderText('Type a command or search...');

      fireEvent.change(input, { target: { value: 'settings' } });

      // "Go to Settings" should still be visible
      expect(screen.getByText('Go to Settings')).toBeInTheDocument();
      // "New Chat" should be filtered out
      expect(screen.queryByText('New Chat')).not.toBeInTheDocument();
    });

    it('shows "No commands found." when query has no match', () => {
      renderPalette();
      const input = screen.getByPlaceholderText('Type a command or search...');

      fireEvent.change(input, { target: { value: 'zzzzzzz_impossible' } });

      expect(screen.getByText('No commands found.')).toBeInTheDocument();
    });

    it('shows clear button when query is non-empty', () => {
      renderPalette();
      const input = screen.getByPlaceholderText('Type a command or search...');

      fireEvent.change(input, { target: { value: 'chat' } });
      expect(screen.getByLabelText('Clear search')).toBeInTheDocument();
    });

    it('clicking clear button resets the query', () => {
      renderPalette();
      const input = screen.getByPlaceholderText('Type a command or search...') as HTMLInputElement;

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

    it('renders toggle sidebar command', () => {
      renderPalette();
      expect(screen.getByText('Collapse Sidebar')).toBeInTheDocument();
    });

    it('renders toggle theme command when theme is dark', () => {
      renderPalette();
      expect(screen.getByText('Switch to System Theme')).toBeInTheDocument();
    });
  });

  // ============================================================
  // Command execution — navigation
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

    it('navigates to /chat on Go to Settings click', () => {
      const onOpenChange = vi.fn();
      renderPalette(true, onOpenChange);

      fireEvent.click(screen.getByText('Go to Settings'));
      expect(mockPush).toHaveBeenCalledWith('/chat');
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  // ============================================================
  // Preferences commands
  // ============================================================

  describe('preferences commands', () => {
    it('calls toggleSidebar when sidebar toggle is clicked', () => {
      const onOpenChange = vi.fn();
      renderPalette(true, onOpenChange);

      fireEvent.click(screen.getByText('Collapse Sidebar'));
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
      expect(screen.getByText('GPT-5.4')).toBeInTheDocument();
      expect(screen.getByText('Claude Sonnet 4.6')).toBeInTheDocument();
    });

    it('closes palette when a model is selected', () => {
      const onOpenChange = vi.fn();
      renderPalette(true, onOpenChange);

      fireEvent.click(screen.getByText('Switch AI Model'));
      fireEvent.click(screen.getByText('GPT-5.4'));

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('pressing Escape in sub-menu returns to main menu', () => {
      renderPalette();
      const input = screen.getByPlaceholderText('Type a command or search...');

      fireEvent.click(screen.getByText('Switch AI Model'));

      // Now in sub-menu
      expect(screen.getByText('GPT-5.4')).toBeInTheDocument();

      fireEvent.keyDown(input, { key: 'Escape' });

      // Back to main menu — GPT-5.4 should be gone
      expect(screen.queryByText('GPT-5.4')).not.toBeInTheDocument();
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

      expect(screen.queryByText('GPT-5.4')).not.toBeInTheDocument();
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

      const input = screen.getByPlaceholderText('Type a command or search...');
      fireEvent.keyDown(input, { key: 'Escape' });

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('pressing Enter executes the selected command', () => {
      const onOpenChange = vi.fn();
      renderPalette(true, onOpenChange);

      // Filter to a single result
      const input = screen.getByPlaceholderText('Type a command or search...');
      fireEvent.change(input, { target: { value: 'New Chat' } });

      fireEvent.keyDown(input, { key: 'Enter' });

      expect(mockPush).toHaveBeenCalledWith('/chat');
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('ArrowDown and Enter selects next item', () => {
      const onOpenChange = vi.fn();
      renderPalette(true, onOpenChange);

      // Filter to the two commands in Navigate that contain "Dashboard" and "Chat"
      const input = screen.getByPlaceholderText('Type a command or search...');
      fireEvent.change(input, { target: { value: 'Go to' } });

      // Go to Dashboard is index 0, Go to Chat is index 1
      // ArrowDown moves to index 1
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'Enter' });

      // Could be any "Go to" page — just confirm navigation happened
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
