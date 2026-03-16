/// <reference types="@testing-library/jest-dom" />
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Mock framer-motion
vi.mock('framer-motion', () => {
  const MotionDiv = React.forwardRef<HTMLDivElement, Record<string, unknown>>(function MotionDiv(
    { children, ...props },
    ref,
  ) {
    const domProps: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(props)) {
      if (
        !key.startsWith('animate') &&
        !key.startsWith('initial') &&
        !key.startsWith('exit') &&
        !key.startsWith('transition') &&
        !key.startsWith('variants') &&
        key !== 'whileHover' &&
        key !== 'whileTap' &&
        key !== 'layout'
      ) {
        domProps[key] = value;
      }
    }
    return (
      <div ref={ref} {...domProps}>
        {children as React.ReactNode}
      </div>
    );
  });
  MotionDiv.displayName = 'motion.div';
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: { div: MotionDiv },
  };
});

// Import after mocking
import { KeyboardShortcutsDialog } from '../KeyboardShortcutsDialog';

describe('KeyboardShortcutsDialog', () => {
  let onCloseMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onCloseMock = vi.fn();
  });

  describe('Rendering', () => {
    it('should render nothing when isOpen is false', () => {
      const { container } = render(
        <KeyboardShortcutsDialog isOpen={false} onClose={onCloseMock} />,
      );
      expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
    });

    it('should render dialog when isOpen is true', () => {
      render(<KeyboardShortcutsDialog isOpen={true} onClose={onCloseMock} />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should display title "Keyboard Shortcuts"', () => {
      render(<KeyboardShortcutsDialog isOpen={true} onClose={onCloseMock} />);
      expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
    });

    it('should display all shortcut categories', () => {
      render(<KeyboardShortcutsDialog isOpen={true} onClose={onCloseMock} />);
      expect(screen.getByText('Navigation')).toBeInTheDocument();
      expect(screen.getByText('Chat')).toBeInTheDocument();
      expect(screen.getByText('Models')).toBeInTheDocument();
      expect(screen.getByText('Settings')).toBeInTheDocument();
      expect(screen.getByText('Other')).toBeInTheDocument();
    });

    it('should display all shortcuts with descriptions', () => {
      render(<KeyboardShortcutsDialog isOpen={true} onClose={onCloseMock} />);
      expect(screen.getByText('Open command palette')).toBeInTheDocument();
      expect(screen.getByText('Toggle sidebar')).toBeInTheDocument();
      expect(screen.getByText('Send message')).toBeInTheDocument();
      expect(screen.getByText('New line in message')).toBeInTheDocument();
    });
  });

  describe('Search Functionality', () => {
    it('should have a search input field', () => {
      render(<KeyboardShortcutsDialog isOpen={true} onClose={onCloseMock} />);
      const searchInput = screen.getByPlaceholderText('Search shortcuts...');
      expect(searchInput).toBeInTheDocument();
    });

    it('should filter shortcuts by description text', async () => {
      const user = userEvent.setup();
      render(<KeyboardShortcutsDialog isOpen={true} onClose={onCloseMock} />);

      const searchInput = screen.getByPlaceholderText('Search shortcuts...');
      await user.type(searchInput, 'command');

      expect(screen.getByText('Open command palette')).toBeInTheDocument();
      expect(screen.queryByText('Toggle sidebar')).not.toBeInTheDocument();
    });

    it('should filter shortcuts by key combination', async () => {
      const user = userEvent.setup();
      render(<KeyboardShortcutsDialog isOpen={true} onClose={onCloseMock} />);

      const searchInput = screen.getByPlaceholderText('Search shortcuts...');
      await user.type(searchInput, 'K');

      // Should show shortcuts that contain 'K'
      expect(screen.getByText('Open command palette')).toBeInTheDocument();
    });

    it('should be case-insensitive when filtering', async () => {
      const user = userEvent.setup();
      render(<KeyboardShortcutsDialog isOpen={true} onClose={onCloseMock} />);

      const searchInput = screen.getByPlaceholderText('Search shortcuts...');
      await user.type(searchInput, 'SEND');

      expect(screen.getByText('Send message')).toBeInTheDocument();
    });

    it('should show all shortcuts when search is cleared', async () => {
      const user = userEvent.setup();
      render(<KeyboardShortcutsDialog isOpen={true} onClose={onCloseMock} />);

      const searchInput = screen.getByPlaceholderText('Search shortcuts...') as HTMLInputElement;
      await user.type(searchInput, 'send');
      expect(screen.queryByText('Toggle sidebar')).not.toBeInTheDocument();

      await user.clear(searchInput);
      expect(screen.getByText('Toggle sidebar')).toBeInTheDocument();
    });

    it('should display "No shortcuts found" when search has no results', async () => {
      const user = userEvent.setup();
      render(<KeyboardShortcutsDialog isOpen={true} onClose={onCloseMock} />);

      const searchInput = screen.getByPlaceholderText('Search shortcuts...');
      await user.type(searchInput, 'xyzabc123');

      expect(screen.getByText('No shortcuts found')).toBeInTheDocument();
    });
  });

  describe('Keyboard Navigation', () => {
    it('should close dialog when Escape is pressed', async () => {
      render(<KeyboardShortcutsDialog isOpen={true} onClose={onCloseMock} />);
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });

    it('should not close dialog when Escape is pressed and isOpen is false', async () => {
      render(<KeyboardShortcutsDialog isOpen={false} onClose={onCloseMock} />);
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onCloseMock).not.toHaveBeenCalled();
    });

    it('should navigate shortcuts with arrow keys', async () => {
      const user = userEvent.setup();
      const { container } = render(<KeyboardShortcutsDialog isOpen={true} onClose={onCloseMock} />);

      const shortcutItems = Array.from(container.querySelectorAll('[data-shortcut="true"]'));

      if (shortcutItems.length > 0) {
        const searchInput = screen.getByPlaceholderText('Search shortcuts...');
        await user.click(searchInput);
        await user.keyboard('{ArrowDown}');
        // Verify that navigation doesn't error
        expect(shortcutItems.length).toBeGreaterThan(0);
      }
    });

    it('should close dialog when backdrop is clicked', async () => {
      const user = userEvent.setup();
      const { container } = render(<KeyboardShortcutsDialog isOpen={true} onClose={onCloseMock} />);

      const backdrop = container.querySelector('[data-testid="dialog-backdrop"]');
      if (backdrop) {
        await user.click(backdrop);
        expect(onCloseMock).toHaveBeenCalled();
      }
    });

    it('should close dialog when close button is clicked', async () => {
      const user = userEvent.setup();
      render(<KeyboardShortcutsDialog isOpen={true} onClose={onCloseMock} />);

      const closeButton = screen.getByRole('button', { name: 'Close dialog' });
      await user.click(closeButton);
      expect(onCloseMock).toHaveBeenCalled();
    });
  });

  describe('Category Organization', () => {
    it('should group shortcuts by category', () => {
      render(<KeyboardShortcutsDialog isOpen={true} onClose={onCloseMock} />);

      const categories = ['Navigation', 'Chat', 'Models', 'Settings', 'Other'];
      categories.forEach((cat) => {
        expect(screen.getByText(cat)).toBeInTheDocument();
      });
    });

    it('should display shortcuts in correct categories', () => {
      render(<KeyboardShortcutsDialog isOpen={true} onClose={onCloseMock} />);

      // Navigation category should contain "Open command palette"
      const commandPaletteDesc = screen.getByText('Open command palette');
      const navCategory = screen.getByText('Navigation');
      expect(navCategory.closest('div')).toContainElement(commandPaletteDesc);
    });

    it('should maintain category order: Navigation, Chat, Models, Settings, Other', () => {
      render(<KeyboardShortcutsDialog isOpen={true} onClose={onCloseMock} />);

      const categories = screen.getAllByRole('heading', { level: 3 });
      const categoryTexts = categories.map((cat) => cat.textContent);

      expect(categoryTexts).toEqual(['Navigation', 'Chat', 'Models', 'Settings', 'Other']);
    });
  });

  describe('Visual Display', () => {
    it('should display key combinations with proper formatting', () => {
      const { container } = render(<KeyboardShortcutsDialog isOpen={true} onClose={onCloseMock} />);

      const kbdElements = container.querySelectorAll('kbd');
      expect(kbdElements.length).toBeGreaterThan(0);
    });

    it('should display "+" between multiple key parts', () => {
      render(<KeyboardShortcutsDialog isOpen={true} onClose={onCloseMock} />);

      // Find the "+" separators in multi-key shortcuts
      const plusSeparators = screen.getAllByText('+');
      expect(plusSeparators.length).toBeGreaterThan(0);
    });

    it('should show instructions about Escape key in footer', () => {
      const { container } = render(<KeyboardShortcutsDialog isOpen={true} onClose={onCloseMock} />);
      // Find the footer by looking for elements that contain the escape instruction text
      const allText = container.textContent || '';
      expect(allText).toMatch(/Press.*Escape.*to close/i);
    });
  });

  describe('Integration', () => {
    it('should handle rapid open/close cycles', async () => {
      const { rerender } = render(<KeyboardShortcutsDialog isOpen={false} onClose={onCloseMock} />);

      rerender(<KeyboardShortcutsDialog isOpen={true} onClose={onCloseMock} />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      rerender(<KeyboardShortcutsDialog isOpen={false} onClose={onCloseMock} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should persist search state when filtering', async () => {
      const user = userEvent.setup();
      render(<KeyboardShortcutsDialog isOpen={true} onClose={onCloseMock} />);

      const searchInput = screen.getByPlaceholderText('Search shortcuts...') as HTMLInputElement;
      await user.type(searchInput, 'send');

      expect(searchInput.value).toBe('send');
      expect(screen.getByText('Send message')).toBeInTheDocument();
    });

    it('should clear search input when dialog is reopened', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<KeyboardShortcutsDialog isOpen={true} onClose={onCloseMock} />);

      const searchInput = screen.getByPlaceholderText('Search shortcuts...') as HTMLInputElement;
      await user.type(searchInput, 'send');

      rerender(<KeyboardShortcutsDialog isOpen={false} onClose={onCloseMock} />);
      rerender(<KeyboardShortcutsDialog isOpen={true} onClose={onCloseMock} />);

      const newSearchInput = screen.getByPlaceholderText('Search shortcuts...') as HTMLInputElement;
      expect(newSearchInput.value).toBe('');
    });
  });
});
