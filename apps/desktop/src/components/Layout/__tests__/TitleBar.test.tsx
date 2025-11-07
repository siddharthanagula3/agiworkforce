/**
 * Unit tests for TitleBar component
 * Tests fullscreen UI rendering and icon changes
 */

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DockPosition, WindowActions } from '../../../hooks/useWindowManager';
import { TooltipProvider } from '../../ui/Tooltip';
import TitleBar from '../TitleBar';

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

  describe('Rendering', () => {
    it('renders the application title and window state', () => {
      renderTitleBar(defaultState, mockActions, mockOnOpenCommandPalette);
      expect(screen.getByText('AGI Workforce')).toBeInTheDocument();
      expect(screen.getByText(/Floating/)).toBeInTheDocument();
    });
  });

  describe('Window Controls', () => {
    it('should render minimize tooltip', () => {
      renderTitleBar(defaultState, mockActions, mockOnOpenCommandPalette);
      expect(screen.getByLabelText('Minimize window')).toBeInTheDocument();
    });

    it('should render hide to tray tooltip', () => {
      renderTitleBar(defaultState, mockActions, mockOnOpenCommandPalette);
      expect(screen.getByLabelText('Hide window')).toBeInTheDocument();
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
      expect(screen.getByLabelText('Open command palette')).toBeInTheDocument();
    });
  });

  describe('Maximize control', () => {
    it('exposes maximize label when window is not maximized', () => {
      renderTitleBar(defaultState, mockActions, mockOnOpenCommandPalette);
      expect(screen.getByLabelText('Maximize window')).toBeInTheDocument();
    });

    it('exposes restore label when window is maximized', () => {
      const maximizedState = {
        ...defaultState,
        maximized: true,
      };
      renderTitleBar(maximizedState, mockActions, mockOnOpenCommandPalette);
      expect(screen.getByLabelText('Restore window')).toBeInTheDocument();
    });
  });
});
