import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  homeDir: vi.fn(),
}));

vi.mock('../../lib/tauri-mock', () => ({
  invoke: mocks.invoke,
  isTauri: true,
  isCloudWeb: false,
  supportsLocalAppMode: true,
  isTauriContext: () => true,
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn().mockResolvedValue(undefined),
  once: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock('@tauri-apps/api/path', () => ({
  homeDir: mocks.homeDir,
}));

import { SkillsPluginsSettings } from './SkillsPluginsSettings';

describe('SkillsPluginsSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.homeDir.mockResolvedValue('/Users/test');
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === 'claude_plugin_cli_available') return false;
      if (command === 'dir_list') return [];
      if (command === 'file_read') throw new Error('No compatible plugin registry');
      return undefined;
    });
  });

  it('disables compatible plugin package actions when the CLI is unavailable', async () => {
    render(<SkillsPluginsSettings />);

    expect(await screen.findByText('Install, update and remove')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('claude command not found')).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText('plugin-name@marketplace')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Install plugin' })).toBeDisabled();
    expect(
      screen.getByText(/These actions are off because the claude command is not installed/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Claude Code has no plugins installed on this machine/i),
    ).toBeInTheDocument();
  });
});
