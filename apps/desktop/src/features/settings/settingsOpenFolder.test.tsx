import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  homeDir: vi.fn(),
  fileOpenWithDefaultApp: vi.fn(),
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

vi.mock('@tauri-apps/api/path', () => ({ homeDir: mocks.homeDir }));
vi.mock('../../api/fileOps', () => ({
  fileOpenWithDefaultApp: mocks.fileOpenWithDefaultApp,
}));
vi.mock('@agiworkforce/desktop-command-client', () => ({ dotfiles: mocks.dotfiles }));

import { DotfileSettings } from './DotfileSettings';
import { CustomAgentsList } from './CustomAgentsList';
import { useCustomAgentsStore } from '../../stores/customAgentsStore';

describe('on-disk path open-folder actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.homeDir.mockResolvedValue('/Users/test/');
    mocks.fileOpenWithDefaultApp.mockResolvedValue(undefined);
    mocks.dotfiles.readSharedConfig.mockResolvedValue({});
    mocks.dotfiles.dotfileListMcpServers.mockResolvedValue({});
    mocks.dotfiles.dotfileListSkills.mockResolvedValue([
      {
        name: 'triage',
        description: 'Triage skill',
        path: '/Users/test/.agiworkforce/skills/triage/SKILL.md',
        source: 'system',
      },
    ]);
    mocks.dotfiles.dotfileReadInstructions.mockResolvedValue('');
    mocks.dotfiles.dotfileReadMemories.mockResolvedValue('');
    mocks.dotfiles.detectEcosystemTools.mockResolvedValue([
      {
        name: 'Fixture Tool',
        path: '/Users/test/.fixture-tool',
        has_mcp: false,
        has_skills: false,
        has_instructions: false,
        mcp_config_path: null,
        skills_paths: [],
      },
    ]);
  });

  it('opens the enclosing directory of a dotfile shown as text', async () => {
    const user = userEvent.setup();
    render(<DotfileSettings />);

    await user.click(
      await screen.findByRole('button', { name: 'Open containing folder for config.toml' }),
    );

    await waitFor(() => {
      expect(mocks.fileOpenWithDefaultApp).toHaveBeenCalledWith('/Users/test/.agiworkforce');
    });
  });

  it('opens a detected tool directory at the path itself, not its parent', async () => {
    const user = userEvent.setup();
    render(<DotfileSettings />);

    await user.click(
      await screen.findByRole('button', { name: 'Open containing folder for Fixture Tool' }),
    );

    await waitFor(() => {
      expect(mocks.fileOpenWithDefaultApp).toHaveBeenCalledWith('/Users/test/.fixture-tool');
    });
  });

  it('opens the folder holding a discovered skill', async () => {
    const user = userEvent.setup();
    render(<DotfileSettings />);

    await user.click(
      await screen.findByRole('button', { name: 'Open containing folder for triage' }),
    );

    await waitFor(() => {
      expect(mocks.fileOpenWithDefaultApp).toHaveBeenCalledWith(
        '/Users/test/.agiworkforce/skills/triage',
      );
    });
  });

  it('opens the global agents folder from the custom agents storage hint', async () => {
    useCustomAgentsStore.setState({
      agents: [],
      isLoading: false,
      error: null,
      fetchAgents: vi.fn().mockResolvedValue(undefined),
    });
    const user = userEvent.setup();
    render(<CustomAgentsList />);

    await user.click(screen.getByRole('button', { name: 'Open the global agents folder' }));

    await waitFor(() => {
      expect(mocks.fileOpenWithDefaultApp).toHaveBeenCalledWith('/Users/test/.claude/agents');
    });
  });
});
