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
      if (command === 'execute_terminal_command') {
        return {
          stdout: '',
          stderr: 'claude: command not found',
          exitCode: 127,
          durationMs: 4,
        };
      }
      if (command === 'dir_list') return [];
      if (command === 'file_read') throw new Error('No compatible plugin registry');
      return undefined;
    });
  });

  it('disables compatible plugin package actions when the CLI is unavailable', async () => {
    render(<SkillsPluginsSettings />);

    expect(await screen.findByText('Compatible plugin lifecycle')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Compatible CLI unavailable')).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText('plugin-name@marketplace')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Install plugin' })).toBeDisabled();
    expect(
      screen.getByText(/Plugin package actions are disabled because the compatible CLI/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Built-in AGI skills and project resources remain available/i),
    ).toBeInTheDocument();
  });
});
