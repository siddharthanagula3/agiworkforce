/**
 * KeyboardShortcutsDialog — component tests
 *
 * Covers:
 *  - Rendering with isOpen=true/false
 *  - All expected shortcut groups and entries present
 *  - Search/filter functionality
 *  - "No shortcuts found" empty state
 *  - Escape key closes the dialog
 *  - Close button closes the dialog
 *  - Backdrop click closes the dialog
 *  - Cmd+/ shortcut group is present
 *  - Cmd+N, Cmd+B, Cmd+D shortcuts are present
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

// framer-motion is mocked globally in test/setup.ts
// AnimatePresence just renders children, motion.div renders as <div>

import { KeyboardShortcutsDialog } from '../KeyboardShortcutsDialog';

const baseProps = {
  isOpen: true,
  onClose: vi.fn(),
};

describe('KeyboardShortcutsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Visibility ──────────────────────────────────────────────────────────────

  describe('visibility', () => {
    it('renders nothing when isOpen is false', () => {
      render(<KeyboardShortcutsDialog isOpen={false} onClose={vi.fn()} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders the dialog when isOpen is true', () => {
      render(<KeyboardShortcutsDialog {...baseProps} />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('shows the "Keyboard Shortcuts" heading', () => {
      render(<KeyboardShortcutsDialog {...baseProps} />);
      expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
    });
  });

  // ── Shortcut groups ─────────────────────────────────────────────────────────

  describe('shortcut groups', () => {
    it('renders a Navigation group', () => {
      render(<KeyboardShortcutsDialog {...baseProps} />);
      expect(screen.getByText(/navigation/i)).toBeInTheDocument();
    });

    it('renders a Chat group', () => {
      render(<KeyboardShortcutsDialog {...baseProps} />);
      expect(screen.getByText(/^chat$/i)).toBeInTheDocument();
    });

    it('renders an Appearance group', () => {
      render(<KeyboardShortcutsDialog {...baseProps} />);
      expect(screen.getByText(/appearance/i)).toBeInTheDocument();
    });
  });

  // ── Required shortcuts ──────────────────────────────────────────────────────

  describe('required shortcuts present', () => {
    it('shows "Open command palette" shortcut', () => {
      render(<KeyboardShortcutsDialog {...baseProps} />);
      expect(screen.getByText(/open command palette/i)).toBeInTheDocument();
    });

    it('shows "New chat" shortcut', () => {
      render(<KeyboardShortcutsDialog {...baseProps} />);
      expect(screen.getByText(/new chat/i)).toBeInTheDocument();
    });

    it('shows "Show keyboard shortcuts" shortcut', () => {
      render(<KeyboardShortcutsDialog {...baseProps} />);
      expect(screen.getByText(/show keyboard shortcuts/i)).toBeInTheDocument();
    });

    it('shows "Toggle sidebar" shortcut', () => {
      render(<KeyboardShortcutsDialog {...baseProps} />);
      expect(screen.getAllByText(/toggle sidebar/i).length).toBeGreaterThan(0);
    });

    it('shows "Toggle dark mode" shortcut', () => {
      render(<KeyboardShortcutsDialog {...baseProps} />);
      expect(screen.getByText(/toggle dark mode/i)).toBeInTheDocument();
    });

    it('displays kbd elements for each shortcut key', () => {
      const { container } = render(<KeyboardShortcutsDialog {...baseProps} />);
      const kbds = container.querySelectorAll('kbd');
      // There should be multiple kbd elements (at least one per shortcut key)
      expect(kbds.length).toBeGreaterThan(5);
    });
  });

  // ── Search / filter ─────────────────────────────────────────────────────────

  describe('search functionality', () => {
    it('renders a search input', () => {
      render(<KeyboardShortcutsDialog {...baseProps} />);
      expect(screen.getByPlaceholderText(/search shortcuts/i)).toBeInTheDocument();
    });

    it('filters shortcuts based on search query matching description', () => {
      render(<KeyboardShortcutsDialog {...baseProps} />);
      const input = screen.getByPlaceholderText(/search shortcuts/i);

      act(() => {
        fireEvent.change(input, { target: { value: 'dark mode' } });
      });

      expect(screen.getByText(/toggle dark mode/i)).toBeInTheDocument();
      // "Open command palette" should not be visible
      expect(screen.queryByText(/open command palette/i)).not.toBeInTheDocument();
    });

    it('shows "No shortcuts found" when search matches nothing', () => {
      render(<KeyboardShortcutsDialog {...baseProps} />);
      const input = screen.getByPlaceholderText(/search shortcuts/i);

      act(() => {
        fireEvent.change(input, { target: { value: 'xyzzy-nonexistent-query' } });
      });

      expect(screen.getByText(/no shortcuts found/i)).toBeInTheDocument();
    });

    it('resets search when dialog closes and reopens', () => {
      const { rerender } = render(<KeyboardShortcutsDialog {...baseProps} />);
      const input = screen.getByPlaceholderText(/search shortcuts/i);

      act(() => {
        fireEvent.change(input, { target: { value: 'dark mode' } });
      });

      // Close the dialog
      rerender(<KeyboardShortcutsDialog isOpen={false} onClose={vi.fn()} />);
      // Reopen the dialog
      rerender(<KeyboardShortcutsDialog {...baseProps} />);

      // Search input should be cleared
      expect(screen.getByPlaceholderText(/search shortcuts/i)).toHaveValue('');
    });
  });

  // ── Close interactions ──────────────────────────────────────────────────────

  describe('close interactions', () => {
    it('calls onClose when the close button is clicked', () => {
      const onClose = vi.fn();
      render(<KeyboardShortcutsDialog isOpen={true} onClose={onClose} />);

      const closeButton = screen.getByLabelText(/close dialog/i);
      act(() => {
        fireEvent.click(closeButton);
      });

      expect(onClose).toHaveBeenCalledOnce();
    });

    it('calls onClose when backdrop is clicked', () => {
      const onClose = vi.fn();
      render(<KeyboardShortcutsDialog isOpen={true} onClose={onClose} />);

      const backdrop = screen.getByTestId('dialog-backdrop');
      act(() => {
        fireEvent.click(backdrop);
      });

      expect(onClose).toHaveBeenCalledOnce();
    });

    it('calls onClose when Escape key is pressed', () => {
      const onClose = vi.fn();
      render(<KeyboardShortcutsDialog isOpen={true} onClose={onClose} />);

      act(() => {
        fireEvent.keyDown(window, { key: 'Escape' });
      });

      expect(onClose).toHaveBeenCalledOnce();
    });

    it('does NOT call onClose when Escape is pressed and dialog is closed', () => {
      const onClose = vi.fn();
      render(<KeyboardShortcutsDialog isOpen={false} onClose={onClose} />);

      act(() => {
        fireEvent.keyDown(window, { key: 'Escape' });
      });

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  // ── Accessibility ────────────────────────────────────────────────────────────

  describe('accessibility', () => {
    it('has role=dialog on the modal container', () => {
      render(<KeyboardShortcutsDialog {...baseProps} />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('has aria-labelledby pointing to the title', () => {
      render(<KeyboardShortcutsDialog {...baseProps} />);
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-labelledby', 'shortcuts-title');
    });

    it('title element has correct id', () => {
      render(<KeyboardShortcutsDialog {...baseProps} />);
      const title = screen.getByText('Keyboard Shortcuts');
      expect(title).toHaveAttribute('id', 'shortcuts-title');
    });
  });

  // ── Footer hint ──────────────────────────────────────────────────────────────

  describe('footer', () => {
    it('shows the Escape hint in the footer', () => {
      render(<KeyboardShortcutsDialog {...baseProps} />);
      expect(screen.getByText(/press/i)).toBeInTheDocument();
      expect(screen.getByText(/to close/i)).toBeInTheDocument();
    });
  });
});
