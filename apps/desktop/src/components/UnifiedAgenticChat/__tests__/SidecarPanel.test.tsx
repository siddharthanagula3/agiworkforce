import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock matchMedia for framer-motion
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // Deprecated
    removeListener: vi.fn(), // Deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock Tauri and heavy dependencies
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue({}),
}));

// Mock Monaco Editor
vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange }: any) => (
    <textarea
      data-testid="monaco-editor"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

// Mock the Sidecar sub-components
vi.mock('../Sidecar/CodeCanvas', () => ({
  CodeCanvas: ({ contextId }: any) => (
    <div data-testid="code-canvas">Code Canvas Mode - Context: {contextId || 'none'}</div>
  ),
}));

vi.mock('../Sidecar/BrowserPreview', () => ({
  BrowserPreview: ({ contextId }: any) => (
    <div data-testid="browser-preview">Browser Preview Mode - Context: {contextId || 'none'}</div>
  ),
}));

vi.mock('../Sidecar/TerminalView', () => ({
  TerminalView: ({ contextId }: any) => (
    <div data-testid="terminal-view">Terminal View Mode - Context: {contextId || 'none'}</div>
  ),
}));

vi.mock('../Sidecar/DiffViewer', () => ({
  DiffViewer: ({ contextId }: any) => (
    <div data-testid="diff-viewer">Diff Viewer Mode - Context: {contextId || 'none'}</div>
  ),
}));

// Mock store
const mockSidecarState: {
  isOpen: boolean;
  activeMode: 'code' | 'browser' | 'terminal' | 'preview' | 'diff' | 'canvas';
  contextId: string | null;
  autoTrigger: boolean;
} = {
  isOpen: true,
  activeMode: 'code',
  contextId: 'test-context-123',
  autoTrigger: false,
};

const mockCloseSidecar = vi.fn();

vi.mock('../../../stores/unifiedChatStore', () => ({
  useUnifiedChatStore: vi.fn((selector) => {
    const state = {
      sidecar: mockSidecarState,
      closeSidecar: mockCloseSidecar,
    };
    return selector ? selector(state) : state;
  }),
}));

// Mock useReducedMotion hook
vi.mock('../../../hooks/useReducedMotion', () => ({
  useReducedMotion: vi.fn(() => false),
}));

import { SidecarPanel } from '../SidecarPanel';

describe('SidecarPanel Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSidecarState.isOpen = true;
    mockSidecarState.activeMode = 'code';
    mockSidecarState.contextId = 'test-context-123';
    mockSidecarState.autoTrigger = false;
  });

  describe('Mode Rendering', () => {
    it('should render CodeCanvas when activeMode is "code"', () => {
      mockSidecarState.activeMode = 'code';
      render(<SidecarPanel />);

      expect(screen.getByTestId('code-canvas')).toBeInTheDocument();
      expect(screen.getByText(/Code Canvas Mode/i)).toBeInTheDocument();
    });

    it('should render BrowserPreview when activeMode is "browser"', () => {
      mockSidecarState.activeMode = 'browser';
      render(<SidecarPanel />);

      expect(screen.getByTestId('browser-preview')).toBeInTheDocument();
      expect(screen.getByText(/Browser Preview Mode/i)).toBeInTheDocument();
    });

    it('should render TerminalView when activeMode is "terminal"', () => {
      mockSidecarState.activeMode = 'terminal';
      render(<SidecarPanel />);

      expect(screen.getByTestId('terminal-view')).toBeInTheDocument();
      expect(screen.getByText(/Terminal View Mode/i)).toBeInTheDocument();
    });

    it('should render DiffViewer when activeMode is "diff"', () => {
      mockSidecarState.activeMode = 'diff';
      render(<SidecarPanel />);

      expect(screen.getByTestId('diff-viewer')).toBeInTheDocument();
      expect(screen.getByText(/Diff Viewer Mode/i)).toBeInTheDocument();
    });

    it('should render preview placeholder when activeMode is "preview"', () => {
      mockSidecarState.activeMode = 'preview';
      render(<SidecarPanel />);

      expect(screen.getByText(/Preview mode/i)).toBeInTheDocument();
      expect(screen.getByText(/Content preview will appear here/i)).toBeInTheDocument();
    });

    it('should pass contextId to mode-specific components', () => {
      mockSidecarState.activeMode = 'code';
      mockSidecarState.contextId = 'custom-context-456';
      render(<SidecarPanel />);

      expect(screen.getByText(/Context: custom-context-456/i)).toBeInTheDocument();
    });
  });

  describe('Mode Labels', () => {
    it('should display "Code Editor" label for code mode', () => {
      mockSidecarState.activeMode = 'code';
      render(<SidecarPanel />);

      expect(screen.getByText('Code Editor')).toBeInTheDocument();
    });

    it('should display "Browser Preview" label for browser mode', () => {
      mockSidecarState.activeMode = 'browser';
      render(<SidecarPanel />);

      expect(screen.getByText('Browser Preview')).toBeInTheDocument();
    });

    it('should display "Terminal Output" label for terminal mode', () => {
      mockSidecarState.activeMode = 'terminal';
      render(<SidecarPanel />);

      expect(screen.getByText('Terminal Output')).toBeInTheDocument();
    });

    it('should display "Diff Viewer" label for diff mode', () => {
      mockSidecarState.activeMode = 'diff';
      render(<SidecarPanel />);

      expect(screen.getByText('Diff Viewer')).toBeInTheDocument();
    });

    it('should display "Preview" label for preview mode', () => {
      mockSidecarState.activeMode = 'preview';
      render(<SidecarPanel />);

      expect(screen.getByText('Preview')).toBeInTheDocument();
    });
  });

  describe('Header Controls', () => {
    it('should render close button with correct ARIA label', () => {
      render(<SidecarPanel />);

      const closeButton = screen.getByLabelText('Close sidecar');
      expect(closeButton).toBeInTheDocument();
    });

    it('should call closeSidecar when close button is clicked', () => {
      render(<SidecarPanel />);

      const closeButton = screen.getByLabelText('Close sidecar');
      fireEvent.click(closeButton);

      expect(mockCloseSidecar).toHaveBeenCalledTimes(1);
    });

    it('should render maximize button', () => {
      render(<SidecarPanel />);

      const maximizeButton = screen.getByLabelText('Maximize sidecar');
      expect(maximizeButton).toBeInTheDocument();
    });

    it('should toggle maximize state when maximize button is clicked', () => {
      render(<SidecarPanel />);

      const maximizeButton = screen.getByLabelText('Maximize sidecar');
      fireEvent.click(maximizeButton);

      // After clicking, should show "Restore" instead of "Maximize"
      expect(screen.getByLabelText('Restore sidecar size')).toBeInTheDocument();
    });

    it('should render pin button', () => {
      render(<SidecarPanel />);

      const pinButton = screen.getByLabelText('Pin sidecar');
      expect(pinButton).toBeInTheDocument();
    });

    it('should toggle pin state when pin button is clicked', () => {
      render(<SidecarPanel />);

      const pinButton = screen.getByLabelText('Pin sidecar');
      fireEvent.click(pinButton);

      // After clicking, should show "Unpin" instead of "Pin"
      expect(screen.getByLabelText('Unpin sidecar')).toBeInTheDocument();
    });
  });

  describe('Auto-Trigger Indicator', () => {
    it('should show auto-trigger indicator when autoTrigger is true', () => {
      mockSidecarState.autoTrigger = true;
      render(<SidecarPanel />);

      expect(screen.getByText(/Auto-opened/i)).toBeInTheDocument();
      expect(
        screen.getByText(/automatically triggered based on message content/i),
      ).toBeInTheDocument();
    });

    it('should not show auto-trigger indicator when autoTrigger is false', () => {
      mockSidecarState.autoTrigger = false;
      render(<SidecarPanel />);

      expect(screen.queryByText(/Auto-opened/i)).not.toBeInTheDocument();
    });
  });

  describe('Context ID Display', () => {
    it('should display contextId in header when present', () => {
      mockSidecarState.contextId = 'my-long-context-id-that-should-be-truncated';
      const { container } = render(<SidecarPanel />);

      // Find the header element specifically
      const header = container.querySelector('.flex.items-center.gap-2');
      expect(header).toBeInTheDocument();
      expect(header?.textContent).toContain('my-long-context-id-t');
    });

    it('should not display contextId when null', () => {
      mockSidecarState.contextId = null;
      render(<SidecarPanel />);

      // Should only show the mode label, no contextId
      const header = screen.getByText('Code Editor').parentElement;
      expect(header?.textContent).toBe('Code Editor');
    });
  });

  describe('Visibility', () => {
    it('should render when sidecar is open', () => {
      mockSidecarState.isOpen = true;
      render(<SidecarPanel />);

      expect(screen.getByTestId('code-canvas')).toBeInTheDocument();
    });

    it('should not render when sidecar is closed', () => {
      mockSidecarState.isOpen = false;
      const { container } = render(<SidecarPanel />);

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Mode Switching', () => {
    it('should switch between different modes', () => {
      // Test each mode independently rather than trying to switch
      const modes: Array<'code' | 'browser' | 'terminal' | 'diff' | 'preview' | 'canvas'> = [
        'code',
        'browser',
        'terminal',
        'diff',
        'preview',
      ];

      modes.forEach((mode) => {
        mockSidecarState.activeMode = mode;
        const { unmount } = render(<SidecarPanel />);

        // Verify the correct mode is rendered
        if (mode === 'code') {
          expect(screen.getByTestId('code-canvas')).toBeInTheDocument();
          expect(screen.getByText('Code Editor')).toBeInTheDocument();
        } else if (mode === 'browser') {
          expect(screen.getByTestId('browser-preview')).toBeInTheDocument();
          expect(screen.getByText('Browser Preview')).toBeInTheDocument();
        } else if (mode === 'terminal') {
          expect(screen.getByTestId('terminal-view')).toBeInTheDocument();
          expect(screen.getByText('Terminal Output')).toBeInTheDocument();
        } else if (mode === 'diff') {
          expect(screen.getByTestId('diff-viewer')).toBeInTheDocument();
          expect(screen.getByText('Diff Viewer')).toBeInTheDocument();
        } else if (mode === 'preview') {
          expect(screen.getByText(/Preview mode/i)).toBeInTheDocument();
        }

        unmount();
      });
    });
  });

  describe('Resize Functionality', () => {
    it('should have resize handle element', () => {
      const { container } = render(<SidecarPanel />);

      // Resize handle should be present (styled with cursor-col-resize)
      const resizeHandle = container.querySelector('.cursor-col-resize');
      expect(resizeHandle).toBeInTheDocument();
    });

    it('should handle mousedown on resize handle', () => {
      const { container } = render(<SidecarPanel />);

      const resizeHandle = container.querySelector('.cursor-col-resize') as HTMLElement;
      expect(resizeHandle).toBeInTheDocument();

      fireEvent.mouseDown(resizeHandle);

      // After mousedown, the handle should have active styling (bg-teal class)
      expect(resizeHandle).toHaveClass('bg-teal');
    });
  });

  describe('Accessibility', () => {
    it('should have toolbar role for controls', () => {
      render(<SidecarPanel />);

      const toolbar = screen.getByRole('toolbar', { name: /sidecar controls/i });
      expect(toolbar).toBeInTheDocument();
    });

    it('should have proper ARIA labels on all buttons', () => {
      render(<SidecarPanel />);

      expect(screen.getByLabelText('Maximize sidecar')).toBeInTheDocument();
      expect(screen.getByLabelText('Pin sidecar')).toBeInTheDocument();
      expect(screen.getByLabelText('Close sidecar')).toBeInTheDocument();
    });

    it('should have aria-pressed attribute on toggle buttons', () => {
      render(<SidecarPanel />);

      const pinButton = screen.getByLabelText('Pin sidecar');
      const maximizeButton = screen.getByLabelText('Maximize sidecar');

      expect(pinButton).toHaveAttribute('aria-pressed');
      expect(maximizeButton).toHaveAttribute('aria-pressed');
    });
  });
});
