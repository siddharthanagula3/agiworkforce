/**
 * H45 — InstructionFilesSettings tests
 *
 * Covers: non-Tauri preview mode, file-existence display, edit dialog,
 * create dialog, and save flow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InstructionFilesSettings } from '../InstructionFilesSettings';

// ── Radix UI / jsdom compat polyfills ────────────────────────────────────────
if (typeof Element.prototype.hasPointerCapture === 'undefined') {
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
}
if (typeof Element.prototype.setPointerCapture === 'undefined') {
  Element.prototype.setPointerCapture = vi.fn();
}
if (typeof Element.prototype.releasePointerCapture === 'undefined') {
  Element.prototype.releasePointerCapture = vi.fn();
}

class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

// ── Module mocks ──────────────────────────────────────────────────────────────

const mockInvoke = vi.fn();
const mockIsTauriContext = vi.fn(() => true);

vi.mock('@tauri-apps/api/path', () => ({
  homeDir: vi.fn(() => Promise.resolve('/home/user')),
}));

vi.mock('../../../lib/tauri-mock', () => ({
  isTauriContext: () => mockIsTauriContext(),
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Sets up invoke to: return home dir, report CLAUDE.md as found, others not. */
function setupSuccessfulScan({ claudeMdFound = true }: { claudeMdFound?: boolean } = {}) {
  mockInvoke.mockImplementation((cmd: string, args?: Record<string, unknown>) => {
    if (cmd === 'get_home_directory') return Promise.resolve('/home/user');
    if (cmd === 'file_exists') {
      const path = args?.['path'] as string;
      if (path.endsWith('CLAUDE.md') && claudeMdFound) return Promise.resolve(true);
      return Promise.resolve(false);
    }
    if (cmd === 'file_read') return Promise.resolve('# My CLAUDE.md content\n\nHello world');
    if (cmd === 'file_write') return Promise.resolve(undefined);
    return Promise.reject(new Error(`Unexpected invoke: ${cmd}`));
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('InstructionFilesSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTauriContext.mockReturnValue(true);
  });

  describe('Non-Tauri context', () => {
    it('shows "File detection requires the desktop app" banner', () => {
      mockIsTauriContext.mockReturnValue(false);
      render(<InstructionFilesSettings />);
      expect(screen.getByText(/file detection requires the desktop app/i)).toBeInTheDocument();
    });

    it('does not call invoke in non-Tauri context', () => {
      mockIsTauriContext.mockReturnValue(false);
      render(<InstructionFilesSettings />);
      expect(mockInvoke).not.toHaveBeenCalled();
    });
  });

  describe('Section heading and file list', () => {
    it('renders without crashing', () => {
      setupSuccessfulScan();
      expect(() => render(<InstructionFilesSettings />)).not.toThrow();
    });

    it('shows the "Instruction Files" section heading', () => {
      setupSuccessfulScan();
      render(<InstructionFilesSettings />);
      // Multiple elements may contain "instruction files" (heading + description);
      // confirm at least one is present.
      const matches = screen.getAllByText(/instruction files/i);
      expect(matches.length).toBeGreaterThan(0);
    });

    it('shows known instruction file patterns in the table', () => {
      setupSuccessfulScan();
      render(<InstructionFilesSettings />);
      // All patterns from INSTRUCTION_FILE_PATTERNS should be visible
      expect(screen.getByText('CLAUDE.md')).toBeInTheDocument();
      expect(screen.getByText('AGENTS.md')).toBeInTheDocument();
      expect(screen.getByText('.cursorrules')).toBeInTheDocument();
      expect(screen.getByText('.windsurfrules')).toBeInTheDocument();
      expect(screen.getByText('.github/copilot-instructions.md')).toBeInTheDocument();
    });

    it('shows source labels for files', () => {
      setupSuccessfulScan();
      render(<InstructionFilesSettings />);
      // Multiple files may share the same source label (e.g. both CLAUDE.md and AGENTS.md
      // are "Claude Code"), so use getAllByText.
      const claudeCodeLabels = screen.getAllByText('Claude Code');
      expect(claudeCodeLabels.length).toBeGreaterThan(0);
      expect(screen.getByText('Cursor')).toBeInTheDocument();
      expect(screen.getByText('Windsurf')).toBeInTheDocument();
    });
  });

  describe('File status display', () => {
    it('shows "Found" for CLAUDE.md after scan completes', async () => {
      setupSuccessfulScan({ claudeMdFound: true });
      render(<InstructionFilesSettings />);
      await waitFor(() => {
        // At least one "Found" status must be visible
        expect(screen.getAllByText(/^found$/i).length).toBeGreaterThan(0);
      });
    });

    it('shows "Not found" for files that do not exist', async () => {
      setupSuccessfulScan({ claudeMdFound: false });
      render(<InstructionFilesSettings />);
      await waitFor(() => {
        const notFoundItems = screen.getAllByText(/not found/i);
        expect(notFoundItems.length).toBeGreaterThan(0);
      });
    });

    it('displays the home directory path in the footer', async () => {
      setupSuccessfulScan();
      render(<InstructionFilesSettings />);
      await waitFor(() => {
        expect(screen.getByText(/\/home\/user/)).toBeInTheDocument();
      });
    });
  });

  describe('File actions', () => {
    it('shows "View / Edit" button for found files', async () => {
      setupSuccessfulScan({ claudeMdFound: true });
      render(<InstructionFilesSettings />);
      await waitFor(() => {
        const viewButtons = screen.getAllByRole('button', { name: /view.*edit/i });
        expect(viewButtons.length).toBeGreaterThan(0);
      });
    });

    it('shows "Create" button for missing files', async () => {
      setupSuccessfulScan({ claudeMdFound: false });
      render(<InstructionFilesSettings />);
      await waitFor(() => {
        const createButtons = screen.getAllByRole('button', { name: /create/i });
        expect(createButtons.length).toBeGreaterThan(0);
      });
    });

    it('opens view/edit dialog with file content when clicked', async () => {
      setupSuccessfulScan({ claudeMdFound: true });
      render(<InstructionFilesSettings />);

      await waitFor(() => {
        expect(screen.getAllByRole('button', { name: /view.*edit/i }).length).toBeGreaterThan(0);
      });

      const viewBtn = screen.getAllByRole('button', { name: /view.*edit/i })[0]!;
      await userEvent.click(viewBtn);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/add your instructions here/i)).toBeInTheDocument();
      });
    });

    it('opens create dialog when Create button is clicked', async () => {
      setupSuccessfulScan({ claudeMdFound: false });
      render(<InstructionFilesSettings />);

      await waitFor(() => {
        expect(screen.getAllByRole('button', { name: /create/i }).length).toBeGreaterThan(0);
      });

      const createBtn = screen.getAllByRole('button', { name: /create/i })[0]!;
      await userEvent.click(createBtn);

      await waitFor(() => {
        // Dialog textarea appears
        expect(screen.getByPlaceholderText(/add your instructions here/i)).toBeInTheDocument();
      });
    });
  });

  describe('Edit / Save dialog', () => {
    it('calls file_write when Save File is clicked', async () => {
      setupSuccessfulScan({ claudeMdFound: true });
      render(<InstructionFilesSettings />);

      await waitFor(() => {
        expect(screen.getAllByRole('button', { name: /view.*edit/i }).length).toBeGreaterThan(0);
      });

      const viewBtn = screen.getAllByRole('button', { name: /view.*edit/i })[0]!;
      await userEvent.click(viewBtn);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save file/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /save file/i }));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          'file_write',
          expect.objectContaining({ path: expect.stringContaining('CLAUDE.md') }),
        );
      });
    });

    it('closes dialog when Cancel is clicked', async () => {
      setupSuccessfulScan({ claudeMdFound: false });
      render(<InstructionFilesSettings />);

      await waitFor(() => {
        expect(screen.getAllByRole('button', { name: /create/i }).length).toBeGreaterThan(0);
      });

      await userEvent.click(screen.getAllByRole('button', { name: /create/i })[0]!);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /save file/i })).not.toBeInTheDocument();
      });
    });
  });

  describe('Error handling', () => {
    it('does not crash when get_home_directory fails', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'get_home_directory') return Promise.reject(new Error('permission denied'));
        if (cmd === 'get_user_preference') return Promise.resolve(null);
        if (cmd === 'file_exists') return Promise.resolve(false);
        return Promise.resolve(undefined);
      });

      render(<InstructionFilesSettings />);

      await waitFor(() => {
        // Component should settle without crashing — file list is still displayed
        expect(screen.getByText('CLAUDE.md')).toBeInTheDocument();
      });
    });

    it('shows error message in dialog when file_read fails', async () => {
      setupSuccessfulScan({ claudeMdFound: true });
      mockInvoke.mockImplementation((cmd: string, _args?: Record<string, unknown>) => {
        if (cmd === 'get_home_directory') return Promise.resolve('/home/user');
        if (cmd === 'file_exists') return Promise.resolve(true);
        if (cmd === 'file_read') return Promise.reject(new Error('Read permission denied'));
        return Promise.resolve(undefined);
      });

      render(<InstructionFilesSettings />);

      await waitFor(() => {
        expect(screen.getAllByRole('button', { name: /view.*edit/i }).length).toBeGreaterThan(0);
      });

      await userEvent.click(screen.getAllByRole('button', { name: /view.*edit/i })[0]!);

      await waitFor(() => {
        // Error message shown in dialog
        expect(screen.getByText(/permission denied/i)).toBeInTheDocument();
      });
    });
  });
});
