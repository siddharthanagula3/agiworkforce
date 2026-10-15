import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  GLOBAL_INSTRUCTIONS_FILE,
  InstructionFilesSettings,
  PROJECT_INSTRUCTION_FILES,
} from '../InstructionFilesSettings';
import { useProjectStore } from '../../../stores/projectStore';

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

const mockInvoke = vi.fn();
const mockIsTauriContext = vi.fn(() => true);

vi.mock('../../../lib/tauri-mock', () => ({
  isTauri: false,
  isTauriContext: () => mockIsTauriContext(),
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const PROJECT_FOLDER = '/work/acme';

interface Disk {
  globalInstructions?: string;
  projectFiles?: Record<string, string>;
}

function setupDisk({ globalInstructions = '', projectFiles = {} }: Disk = {}) {
  mockInvoke.mockImplementation((cmd: string, args?: Record<string, unknown>) => {
    const path = args?.['path'] as string | undefined;
    if (cmd === 'dotfile_read_instructions') return Promise.resolve(globalInstructions);
    if (cmd === 'dotfile_write_instructions') return Promise.resolve(undefined);
    if (cmd === 'file_exists') return Promise.resolve(path !== undefined && path in projectFiles);
    if (cmd === 'file_read') return Promise.resolve(projectFiles[path ?? ''] ?? '');
    if (cmd === 'file_write') return Promise.resolve(undefined);
    return Promise.reject(new Error(`Unexpected invoke: ${cmd}`));
  });
}

function row(label: string): HTMLElement {
  const cell = screen.getByText(label);
  const container = cell.closest('.grid');
  if (!(container instanceof HTMLElement)) throw new Error(`No row for ${label}`);
  return container;
}

async function renderWithProject(disk: Disk = {}) {
  setupDisk(disk);
  useProjectStore.setState({ currentFolder: PROJECT_FOLDER });
  render(<InstructionFilesSettings />);
  await waitFor(() => {
    expect(screen.queryAllByRole('status')).toHaveLength(0);
  });
}

describe('InstructionFilesSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTauriContext.mockReturnValue(true);
    useProjectStore.setState({ currentFolder: null });
  });

  it('lists exactly the files the prompt builder reads', async () => {
    await renderWithProject();

    expect(screen.getByText(GLOBAL_INSTRUCTIONS_FILE)).toBeInTheDocument();
    for (const name of PROJECT_INSTRUCTION_FILES) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    expect(PROJECT_INSTRUCTION_FILES).toEqual(['AGENTS.md', 'CLAUDE.md', '.agi/instructions.md']);
  });

  it('offers no editor for the files nothing reads, and says so', async () => {
    await renderWithProject();

    for (const unread of ['GEMINI.md', '.cursorrules', '.windsurfrules']) {
      expect(screen.queryByText(unread)).not.toBeInTheDocument();
    }
    expect(screen.getByText(/\.cursorrules, \.windsurfrules .* are not read/i)).toBeInTheDocument();
  });

  it('looks for project files in the open project folder, never in the home directory', async () => {
    await renderWithProject();

    const checked = mockInvoke.mock.calls
      .filter(([cmd]) => cmd === 'file_exists')
      .map(([, args]) => (args as { path: string }).path);
    expect(checked).toEqual([
      '/work/acme/AGENTS.md',
      '/work/acme/CLAUDE.md',
      '/work/acme/.agi/instructions.md',
    ]);
  });

  it('asks for a project folder instead of listing project files when none is open', async () => {
    setupDisk();
    render(<InstructionFilesSettings />);

    expect(screen.getByText(/open a project folder/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('dotfile_read_instructions');
    });
    expect(mockInvoke).not.toHaveBeenCalledWith('file_exists', expect.anything());
  });

  it('reports which files exist', async () => {
    await renderWithProject({
      globalInstructions: 'Be brief.',
      projectFiles: { '/work/acme/AGENTS.md': '# Agents' },
    });

    expect(within(row(GLOBAL_INSTRUCTIONS_FILE)).getByText('Found')).toBeInTheDocument();
    expect(within(row('AGENTS.md')).getByText('Found')).toBeInTheDocument();
    expect(within(row('CLAUDE.md')).getByText('Not found')).toBeInTheDocument();
    expect(within(row('.agi/instructions.md')).getByText('Not found')).toBeInTheDocument();
  });

  it('saves the global instructions through the instructions-file command', async () => {
    const user = userEvent.setup();
    await renderWithProject({ globalInstructions: 'Be brief.' });

    await user.click(
      within(row(GLOBAL_INSTRUCTIONS_FILE)).getByRole('button', { name: /view.*edit/i }),
    );
    const editor = await screen.findByRole('textbox');
    expect(editor).toHaveValue('Be brief.');

    await user.clear(editor);
    await user.type(editor, 'Answer in British English.');
    await user.click(screen.getByRole('button', { name: /save file/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('dotfile_write_instructions', {
        content: 'Answer in British English.',
      });
    });
    expect(mockInvoke).not.toHaveBeenCalledWith('file_write', expect.anything());
  });

  it('creates a project instruction file inside the project folder', async () => {
    const user = userEvent.setup();
    await renderWithProject();

    await user.click(within(row('.agi/instructions.md')).getByRole('button', { name: /create/i }));
    await user.type(await screen.findByRole('textbox'), 'Run the tests first.');
    await user.click(screen.getByRole('button', { name: /save file/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('file_write', {
        path: '/work/acme/.agi/instructions.md',
        content: 'Run the tests first.',
      });
    });
    await waitFor(() => {
      expect(within(row('.agi/instructions.md')).getByText('Found')).toBeInTheDocument();
    });
  });

  it('keeps the editor open and shows the reason when a save is refused', async () => {
    const user = userEvent.setup();
    await renderWithProject();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'file_write') return Promise.reject(new Error('Operation denied by user'));
      return Promise.resolve(false);
    });

    await user.click(within(row('AGENTS.md')).getByRole('button', { name: /create/i }));
    await user.type(await screen.findByRole('textbox'), 'x');
    await user.click(screen.getByRole('button', { name: /save file/i }));

    expect(await screen.findByText('Operation denied by user')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('x');
  });

  it('shows the reason when a file cannot be read', async () => {
    const user = userEvent.setup();
    await renderWithProject({ projectFiles: { '/work/acme/CLAUDE.md': '# Claude' } });
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'file_read') return Promise.reject(new Error('Read permission denied'));
      return Promise.resolve(undefined);
    });

    await user.click(within(row('CLAUDE.md')).getByRole('button', { name: /view.*edit/i }));

    expect(await screen.findByText('Read permission denied')).toBeInTheDocument();
  });

  it('uses the folder separator the project path already has', async () => {
    setupDisk();
    useProjectStore.setState({ currentFolder: 'C:\\work\\acme\\' });
    render(<InstructionFilesSettings />);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('file_exists', {
        path: 'C:\\work\\acme\\.agi\\instructions.md',
      });
    });
  });

  it('does not touch the disk outside the desktop app', () => {
    mockIsTauriContext.mockReturnValue(false);
    useProjectStore.setState({ currentFolder: PROJECT_FOLDER });
    render(<InstructionFilesSettings />);

    expect(screen.getByText(/file detection requires the desktop app/i)).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
    for (const button of screen.getAllByRole('button', { name: /create/i })) {
      expect(button).toBeDisabled();
    }
  });
});
