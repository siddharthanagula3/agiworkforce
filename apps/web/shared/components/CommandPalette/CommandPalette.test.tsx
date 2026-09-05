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

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => navigationState.pathname,
}));

const mockSetTheme = vi.fn();
vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'dark', setTheme: mockSetTheme }),
}));

const chatStoreState = vi.hoisted(() => ({ conversations: [] as unknown[] }));
vi.mock('@shared/stores/web-chat-store', () => ({
  useChatStore: (selector: (state: typeof chatStoreState) => unknown) => selector(chatStoreState),
}));

vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ isLoaded: true, user: { publicMetadata: {} } }),
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

function renderPalette(open = true, onOpenChange = vi.fn()) {
  return render(<CommandPalette open={open} onOpenChange={onOpenChange} />);
}

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigationState.pathname = '/';
  });

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

      expect(screen.getByText('Go to Settings')).toBeInTheDocument();
      expect(screen.queryByText('New chat')).not.toBeInTheDocument();
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

  describe('command groups', () => {
    it('shows Actions group', () => {
      renderPalette();
      expect(screen.getByText('Actions')).toBeInTheDocument();
    });

    it('shows Quick actions group', () => {
      renderPalette();
      expect(screen.getByText('Quick actions')).toBeInTheDocument();
    });

    it('shows Preferences group', () => {
      renderPalette();
      expect(screen.getByText('Preferences')).toBeInTheDocument();
    });

    it('renders New chat command', () => {
      renderPalette();
      expect(screen.getByText('New chat')).toBeInTheDocument();
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

    it('never renders the chat sidebar command (removed: unreachable + wrong state)', () => {
      navigationState.pathname = '/chat';
      renderPalette();
      expect(screen.queryByText('Collapse Chat Sidebar')).not.toBeInTheDocument();
    });

    it('renders toggle theme command when theme is dark', () => {
      renderPalette();
      expect(screen.getByText('Switch to System Theme')).toBeInTheDocument();
    });
  });

  describe('navigation commands', () => {
    it('navigates to /chat on New chat click', () => {
      const onOpenChange = vi.fn();
      renderPalette(true, onOpenChange);

      fireEvent.click(screen.getByText('New chat'));
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

  describe('preferences commands', () => {
    it('calls setTheme with next theme when theme toggle is clicked', () => {
      const onOpenChange = vi.fn();
      renderPalette(true, onOpenChange);

      fireEvent.click(screen.getByText('Switch to System Theme'));
      expect(mockSetTheme).toHaveBeenCalledWith('system');
    });
  });

  describe('model sub-menu', () => {
    it('opens model sub-menu when Switch AI Model is clicked', () => {
      renderPalette();
      fireEvent.click(screen.getByText('Switch AI Model'));

      expect(screen.getByText('Switch AI Model')).toBeInTheDocument();
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

      expect(screen.getByText('Fixture Primary Model')).toBeInTheDocument();

      fireEvent.keyDown(input, { key: 'Escape' });

      expect(screen.queryByText('Fixture Primary Model')).not.toBeInTheDocument();
      expect(screen.getByText('New chat')).toBeInTheDocument();
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
      expect(screen.getByText('New chat')).toBeInTheDocument();
    });
  });

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

      const input = screen.getByPlaceholderText('Type a command or search…');
      fireEvent.change(input, { target: { value: 'New Chat' } });

      fireEvent.keyDown(input, { key: 'Enter' });

      expect(mockPush).toHaveBeenCalledWith('/chat');
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('ArrowDown and Enter selects next item', () => {
      const onOpenChange = vi.fn();
      renderPalette(true, onOpenChange);

      const input = screen.getByPlaceholderText('Type a command or search…');
      fireEvent.change(input, { target: { value: 'Go to' } });

      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(mockPush).toHaveBeenCalled();
    });
  });

  describe('footer', () => {
    it('shows result count', () => {
      renderPalette();
      const footer = screen.getByText(/results/);
      expect(footer).toBeInTheDocument();
    });

    it('shows ESC shortcut in footer', () => {
      renderPalette();
      expect(screen.getByText('close')).toBeInTheDocument();
    });
  });
});
