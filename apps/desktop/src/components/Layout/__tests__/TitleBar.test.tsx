/**
 * Unit tests for TitleBar component
 * Tests fullscreen UI rendering and icon changes
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TitleBar from '../TitleBar';
import type { DockPosition, WindowActions } from '../../../hooks/useWindowManager';
import { TooltipProvider } from '../../ui/Tooltip';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    header: ({ children, ...props }: any) => <header {...props}>{children}</header>,
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    h1: ({ children, ...props }: any) => <h1 {...props}>{children}</h1>,
    p: ({ children, ...props }: any) => <p {...props}>{children}</p>,
  },
}));

// Helper to render TitleBar with TooltipProvider
const renderTitleBar = (
  state: any,
  actions: WindowActions,
  onOpenCommandPalette: () => void,
  commandShortcutHint?: string,
) => {
  return render(
    <TooltipProvider>
      <TitleBar
        state={state}
        actions={actions}
        onOpenCommandPalette={onOpenCommandPalette}
        commandShortcutHint={commandShortcutHint}
      />
    </TooltipProvider>,
  );
};

describe('TitleBar - Fullscreen Functionality', () => {
  const mockActions: WindowActions = {
    refresh: vi.fn(),
    setPinned: vi.fn(),
    togglePinned: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    toggleAlwaysOnTop: vi.fn(),
    dock: vi.fn(),
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    hide: vi.fn(),
    show: vi.fn(),
  };

  const defaultState = {
    pinned: true,
    alwaysOnTop: false,
    dock: null as DockPosition | null,
    focused: true,
    maximized: false,
    fullscreen: false,
  };

  const mockOnOpenCommandPalette = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Fullscreen State Rendering', () => {
    it('should render TitleBar component successfully', () => {
      renderTitleBar(defaultState, mockActions, mockOnOpenCommandPalette);
      expect(screen.getByText('AGI Workforce')).toBeInTheDocument();
    });

    it('should display correct tooltip when not in fullscreen', () => {
      renderTitleBar(defaultState, mockActions, mockOnOpenCommandPalette);
      expect(screen.getByText('Fullscreen')).toBeInTheDocument();
    });

    it('should display correct tooltip when in fullscreen', () => {
      const fullscreenState = {
        ...defaultState,
        fullscreen: true,
      };
      renderTitleBar(fullscreenState, mockActions, mockOnOpenCommandPalette);
      expect(screen.getByText('Exit Fullscreen')).toBeInTheDocument();
    });

    it('should show fullscreen state change correctly', () => {
      const { rerender } = renderTitleBar(defaultState, mockActions, mockOnOpenCommandPalette);
      expect(screen.getByText('Fullscreen')).toBeInTheDocument();

      const fullscreenState = {
        ...defaultState,
        fullscreen: true,
      };

      rerender(
        <TooltipProvider>
          <TitleBar
            state={fullscreenState}
            actions={mockActions}
            onOpenCommandPalette={mockOnOpenCommandPalette}
          />
        </TooltipProvider>,
      );

      expect(screen.getByText('Exit Fullscreen')).toBeInTheDocument();
    });
  });

  describe('Window Controls', () => {
    it('should render minimize tooltip', () => {
      renderTitleBar(defaultState, mockActions, mockOnOpenCommandPalette);
      expect(screen.getByText('Minimize')).toBeInTheDocument();
    });

    it('should render hide to tray tooltip', () => {
      renderTitleBar(defaultState, mockActions, mockOnOpenCommandPalette);
      expect(screen.getAllByText('Hide to tray').length).toBeGreaterThan(0);
    });
  });

  describe('Pin State', () => {
    it('should show unpin tooltip when pinned', () => {
      renderTitleBar(defaultState, mockActions, mockOnOpenCommandPalette);
      expect(screen.getByText('Unpin window')).toBeInTheDocument();
    });

    it('should show pin tooltip when unpinned', () => {
      const unpinnedState = {
        ...defaultState,
        pinned: false,
      };
      renderTitleBar(unpinnedState, mockActions, mockOnOpenCommandPalette);
      expect(screen.getByText('Pin window')).toBeInTheDocument();
    });
  });

  describe('Always On Top State', () => {
    it('should show enable tooltip when not always on top', () => {
      renderTitleBar(defaultState, mockActions, mockOnOpenCommandPalette);
      expect(screen.getByText('Enable always on top')).toBeInTheDocument();
    });

    it('should show disable tooltip when always on top', () => {
      const alwaysOnTopState = {
        ...defaultState,
        alwaysOnTop: true,
      };
      renderTitleBar(alwaysOnTopState, mockActions, mockOnOpenCommandPalette);
      expect(screen.getByText('Disable always on top')).toBeInTheDocument();
    });
  });

  describe('Dock State Display', () => {
    it('should display Floating when not docked', () => {
      renderTitleBar(defaultState, mockActions, mockOnOpenCommandPalette);
      expect(screen.getByText(/Floating/)).toBeInTheDocument();
    });

    it('should display Docked left when docked to left', () => {
      const dockedState = {
        ...defaultState,
        dock: 'left' as DockPosition,
      };
      renderTitleBar(dockedState, mockActions, mockOnOpenCommandPalette);
      expect(screen.getByText(/Docked left/)).toBeInTheDocument();
    });

    it('should display Docked right when docked to right', () => {
      const dockedState = {
        ...defaultState,
        dock: 'right' as DockPosition,
      };
      renderTitleBar(dockedState, mockActions, mockOnOpenCommandPalette);
      expect(screen.getByText(/Docked right/)).toBeInTheDocument();
    });
  });

  describe('Focus State Display', () => {
    it('should display Ready when focused', () => {
      renderTitleBar(defaultState, mockActions, mockOnOpenCommandPalette);
      expect(screen.getByText(/Ready/)).toBeInTheDocument();
    });

    it('should display Inactive when not focused', () => {
      const unfocusedState = {
        ...defaultState,
        focused: false,
      };
      renderTitleBar(unfocusedState, mockActions, mockOnOpenCommandPalette);
      expect(screen.getByText(/Inactive/)).toBeInTheDocument();
    });
  });

  describe('Command Palette', () => {
    it('should show command palette tooltip', () => {
      renderTitleBar(defaultState, mockActions, mockOnOpenCommandPalette);
      expect(screen.getByText('Command palette')).toBeInTheDocument();
    });

    it('should display command shortcut hint when provided', () => {
      renderTitleBar(defaultState, mockActions, mockOnOpenCommandPalette, 'Ctrl+K');
      expect(screen.getByText('Ctrl+K')).toBeInTheDocument();
    });
  });

  describe('Context Menu', () => {
    it('should show dock options in context menu', () => {
      renderTitleBar(defaultState, mockActions, mockOnOpenCommandPalette);
      expect(screen.getByText('Dock left')).toBeInTheDocument();
      expect(screen.getByText('Dock right')).toBeInTheDocument();
      expect(screen.getByText('Undock')).toBeInTheDocument();
    });
  });
});
