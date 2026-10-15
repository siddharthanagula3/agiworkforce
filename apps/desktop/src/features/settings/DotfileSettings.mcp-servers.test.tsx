import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

const mocks = vi.hoisted(() => ({
  dotfiles: {
    readSharedConfig: vi.fn(),
    writeSharedConfig: vi.fn(),
    dotfileListMcpServers: vi.fn(),
    dotfileAddMcpServer: vi.fn(),
    dotfileRemoveMcpServer: vi.fn(),
    dotfileListSkills: vi.fn(),
    dotfileReadInstructions: vi.fn(),
    dotfileWriteInstructions: vi.fn(),
    dotfileReadMemories: vi.fn(),
    detectEcosystemTools: vi.fn(),
    importEcosystemMcpServers: vi.fn(),
  },
}));

vi.mock('@tauri-apps/api/path', () => ({ homeDir: vi.fn().mockResolvedValue('/Users/test/') }));
vi.mock('../../api/fileOps', () => ({ fileOpenWithDefaultApp: vi.fn() }));
vi.mock('@agiworkforce/desktop-command-client', () => ({ dotfiles: mocks.dotfiles }));

import { DotfileSettings } from './DotfileSettings';

describe('shared MCP servers in Developer settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dotfiles.readSharedConfig.mockResolvedValue({});
    mocks.dotfiles.dotfileListMcpServers.mockResolvedValue({
      files: { command: 'npx', args: ['-y', 'files-mcp'] },
    });
    mocks.dotfiles.dotfileListSkills.mockResolvedValue([]);
    mocks.dotfiles.dotfileReadInstructions.mockResolvedValue('');
    mocks.dotfiles.dotfileReadMemories.mockResolvedValue('');
    mocks.dotfiles.detectEcosystemTools.mockResolvedValue([]);
    mocks.dotfiles.dotfileRemoveMcpServer.mockResolvedValue(undefined);
  });

  it('asks before removing a server and says what is lost', async () => {
    const user = userEvent.setup();
    render(<DotfileSettings />);

    await user.click(await screen.findByRole('button', { name: 'Remove MCP server files' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Remove files?');
    expect(dialog).toHaveTextContent('deletes the server from ~/.agiworkforce/mcp.json');
    expect(dialog).toHaveTextContent('adding it back means entering them again');
    expect(mocks.dotfiles.dotfileRemoveMcpServer).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Remove server' }));

    await waitFor(() =>
      expect(mocks.dotfiles.dotfileRemoveMcpServer).toHaveBeenCalledWith('files'),
    );
  });

  it('adds a server only with a command and says so when the system prompt is declined', async () => {
    const user = userEvent.setup();
    const info = vi.spyOn(toast, 'info').mockImplementation(() => 'toast-id');
    const success = vi.spyOn(toast, 'success').mockImplementation(() => 'toast-id');
    mocks.dotfiles.dotfileAddMcpServer.mockResolvedValue(false);
    render(<DotfileSettings />);

    await user.click(await screen.findByRole('button', { name: 'Add' }));
    expect(screen.getByText(/starts this command as you, outside its sandbox/)).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('Server name'), 'notes');
    expect(screen.getByRole('button', { name: 'Add Server' })).toBeDisabled();
    await user.type(screen.getByPlaceholderText('Command (e.g. npx)'), 'npx');
    await user.type(screen.getByPlaceholderText('Args (space-separated)'), '-y notes-mcp');
    await user.click(screen.getByRole('button', { name: 'Add Server' }));

    await waitFor(() =>
      expect(mocks.dotfiles.dotfileAddMcpServer).toHaveBeenCalledWith('notes', {
        command: 'npx',
        args: ['-y', 'notes-mcp'],
      }),
    );
    await waitFor(() =>
      expect(info).toHaveBeenCalledWith(
        'Nothing was added. You declined the server at the system prompt.',
      ),
    );
    expect(success).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Server name')).toHaveValue('notes');

    mocks.dotfiles.dotfileAddMcpServer.mockResolvedValue(true);
    await user.click(screen.getByRole('button', { name: 'Add Server' }));
    await waitFor(() => expect(success).toHaveBeenCalledWith('Added MCP server: notes'));
    info.mockRestore();
    success.mockRestore();
  });

  it('does not claim a save the system prompt declined', async () => {
    const user = userEvent.setup();
    const info = vi.spyOn(toast, 'info').mockImplementation(() => 'toast-id');
    const success = vi.spyOn(toast, 'success').mockImplementation(() => 'toast-id');
    mocks.dotfiles.readSharedConfig.mockResolvedValue({
      default: { model: 'provider/model', permission_mode: 'default', sandbox_mode: 'read-only' },
    });
    mocks.dotfiles.writeSharedConfig.mockResolvedValue(false);
    render(<DotfileSettings />);

    const permissionMode = await screen.findByDisplayValue('default');
    await user.clear(permissionMode);
    await user.type(permissionMode, 'dontAsk');
    await user.click(screen.getAllByRole('button', { name: 'Save' })[0]!);

    await waitFor(() =>
      expect(mocks.dotfiles.writeSharedConfig).toHaveBeenCalledWith('default', {
        model: 'provider/model',
        permission_mode: 'dontAsk',
        sandbox_mode: 'read-only',
      }),
    );
    await waitFor(() =>
      expect(info).toHaveBeenCalledWith(
        'Nothing was saved. You declined the change at the system prompt.',
      ),
    );
    expect(success).not.toHaveBeenCalled();
    info.mockRestore();
    success.mockRestore();
  });

  it('removes nothing when the question is cancelled', async () => {
    const user = userEvent.setup();
    render(<DotfileSettings />);

    await user.click(await screen.findByRole('button', { name: 'Remove MCP server files' }));
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(mocks.dotfiles.dotfileRemoveMcpServer).not.toHaveBeenCalled();
  });
});
